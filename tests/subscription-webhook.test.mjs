import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { handleStripeWebhook, verifyStripeWebhookSignature } from "../app/stripe-webhook.ts";
import { activePlanForUser, createSubscriptionStoreForTests } from "../app/subscription-store.ts";
import { createStripeTestPortal } from "../app/stripe-server.ts";

class Statement {
  constructor(statement, bindings = []) { this.statement = statement; this.bindings = bindings; }
  bind(...values) { return new Statement(this.statement, values); }
  async first() { return this.statement.get(...this.bindings) ?? null; }
  async run() { return this.statement.run(...this.bindings); }
}

class Database {
  constructor(database) { this.database = database; }
  prepare(query) { return new Statement(this.database.prepare(query)); }
  async batch(statements) {
    const values = [];
    for (const statement of statements) values.push(await statement.run());
    return values;
  }
}

async function signature(payload, secret, timestamp) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return `t=${timestamp},v1=${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function checkoutEvent(id = "evt_checkout1") {
  return {
    id,
    type: "checkout.session.completed",
    created: 1_700_000_000,
    livemode: false,
    data: { object: {
      customer: "cus_test1",
      subscription: "sub_test1",
      payment_status: "paid",
      client_reference_id: "a".repeat(40),
      metadata: { whatnow_account: "a".repeat(40) },
    } },
  };
}

test("subscription storage activates and cancels only the linked test account", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const store = createSubscriptionStoreForTests(new Database(database));
    await store.markCheckoutPending("user-1", "a".repeat(40), 1_000);
    assert.equal((await store.readForUser("user-1")).state, "test_checkout_pending");
    await store.applyStripeEvent(checkoutEvent(), 2_000);
    assert.equal(await activePlanForUser("user-1", store), "pro");
    const active = await store.readForUser("user-1");
    assert.equal(active.stripeCustomerId, "cus_test1");
    assert.equal(active.stripeSubscriptionId, "sub_test1");

    await store.applyStripeEvent(checkoutEvent(), 2_500);
    assert.equal(await activePlanForUser("user-1", store), "pro");
    await store.applyStripeEvent({
      id: "evt_cancel1",
      type: "customer.subscription.deleted",
      created: 1_700_000_100,
      livemode: false,
      data: { object: {
        id: "sub_test1",
        customer: "cus_test1",
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: 1_800_000_000,
        metadata: { whatnow_account: "a".repeat(40) },
      } },
    }, 3_000);
    assert.equal(await activePlanForUser("user-1", store), "free");
    assert.equal((await store.readForUser("user-1")).state, "canceled");
    await store.applyStripeEvent(checkoutEvent(), 4_000);
    assert.equal((await store.readForUser("user-1")).state, "canceled", "an older retried event must not reactivate access");
  } finally {
    database.close();
  }
});

test("customer portal accepts only Stripe's HTTPS billing host", async () => {
  let body = null;
  const result = await createStripeTestPortal({
    request: new Request("https://whatnow-app.com/api/subscription"),
    customerId: "cus_test1",
    configuration: { secretKey: "sk_test_secret", priceId: "price_test1" },
    fetchImpl: async (_url, init) => {
      body = init.body;
      return Response.json({ url: "https://billing.stripe.com/p/session/test" });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(body.get("customer"), "cus_test1");
  assert.equal(body.get("return_url"), "https://whatnow-app.com/?subscription=managed");

  const rejected = await createStripeTestPortal({
    request: new Request("https://whatnow-app.com/api/subscription"),
    customerId: "cus_test1",
    configuration: { secretKey: "sk_test_secret", priceId: "price_test1" },
    fetchImpl: async () => Response.json({ url: "https://attacker.example/session" }),
  });
  assert.deepEqual(rejected, { ok: false, code: "invalid_response" });
});

test("webhook signature uses raw body, timestamp tolerance, and test-only secret", async () => {
  const payload = JSON.stringify(checkoutEvent("evt_signed1"));
  const secret = "whsec_test_secret";
  const now = Date.UTC(2026, 6, 17, 12);
  const timestamp = Math.floor(now / 1000);
  const header = await signature(payload, secret, timestamp);
  assert.equal(await verifyStripeWebhookSignature({ payload, signatureHeader: header, secret, now }), true);
  assert.equal(await verifyStripeWebhookSignature({ payload: `${payload} `, signatureHeader: header, secret, now }), false);
  assert.equal(await verifyStripeWebhookSignature({ payload, signatureHeader: header, secret, now: now + 301_000 }), false);
});

test("webhook rejects invalid signatures before changing subscription state", async () => {
  let applied = 0;
  const response = await handleStripeWebhook(new Request("https://whatnow-app.com/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=bad" },
    body: JSON.stringify(checkoutEvent()),
  }), {
    environment: { STRIPE_TEST_CHECKOUT_ENABLED: "true", STRIPE_WEBHOOK_SECRET: "whsec_test_secret" },
    store: { readForUser: async () => null, markCheckoutPending: async () => {}, applyStripeEvent: async () => { applied += 1; } },
    now: Date.UTC(2026, 6, 17, 12),
  });
  assert.equal(response.status, 400);
  assert.equal(applied, 0);
});

test("valid signed webhook is accepted once processing storage is available", async () => {
  const event = checkoutEvent("evt_handler1");
  const payload = JSON.stringify(event);
  const secret = "whsec_test_secret";
  const now = Date.UTC(2026, 6, 17, 12);
  const header = await signature(payload, secret, Math.floor(now / 1000));
  let received = null;
  const response = await handleStripeWebhook(new Request("https://whatnow-app.com/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  }), {
    environment: { STRIPE_TEST_CHECKOUT_ENABLED: "true", STRIPE_WEBHOOK_SECRET: secret },
    store: { readForUser: async () => null, markCheckoutPending: async () => {}, applyStripeEvent: async (value) => { received = value; } },
    now,
  });
  assert.equal(response.status, 200);
  assert.equal(received.id, event.id);
});
