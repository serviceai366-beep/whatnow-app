import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { handleStripeWebhook, verifyStripeWebhookSignature } from "../app/stripe-webhook.ts";
import { activePlanForUser, createSubscriptionStoreForTests } from "../app/subscription-store.ts";
import { createStripePortal } from "../app/stripe-server.ts";

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

const testEnvironment = {
  STRIPE_CHECKOUT_MODE: "test",
  STRIPE_SECRET_KEY: "sk_test_secret",
  STRIPE_PRO_PRICE_ID: "price_test1",
  STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
};

test("subscription storage activates and cancels only the linked test account", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const store = createSubscriptionStoreForTests(new Database(database));
    await store.markCheckoutPending("user-1", "a".repeat(40), true, 1_000);
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

test("a sandbox subscription is reset before a live checkout begins", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const store = createSubscriptionStoreForTests(new Database(database));
    await store.markCheckoutPending("user-1", "a".repeat(40), true, 1_000);
    await store.applyStripeEvent(checkoutEvent(), 2_000);
    assert.equal((await store.readForUser("user-1")).testMode, true);

    await store.markCheckoutPending("user-1", "b".repeat(40), false, 3_000);
    const reset = await store.readForUser("user-1");
    assert.equal(reset.planCode, "free");
    assert.equal(reset.state, "test_checkout_pending");
    assert.equal(reset.testMode, false);
    assert.equal(reset.stripeCustomerId, null);
  } finally {
    database.close();
  }
});

test("customer portal accepts only Stripe's HTTPS billing host", async () => {
  let body = null;
  const result = await createStripePortal({
    request: new Request("https://whatnow-app.com/api/subscription"),
    customerId: "cus_test1",
    configuration: { secretKey: "sk_test_secret", priceId: "price_test1", mode: "test" },
    fetchImpl: async (_url, init) => {
      body = init.body;
      return Response.json({ url: "https://billing.stripe.com/p/session/test" });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(body.get("customer"), "cus_test1");
  assert.equal(body.get("return_url"), "https://whatnow-app.com/?subscription=managed");

  const rejected = await createStripePortal({
    request: new Request("https://whatnow-app.com/api/subscription"),
    customerId: "cus_test1",
    configuration: { secretKey: "sk_test_secret", priceId: "price_test1", mode: "test" },
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
    environment: testEnvironment,
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
    environment: { ...testEnvironment, STRIPE_WEBHOOK_SECRET: secret },
    store: { readForUser: async () => null, markCheckoutPending: async () => {}, applyStripeEvent: async (value) => { received = value; } },
    now,
  });
  assert.equal(response.status, 200);
  assert.equal(received.id, event.id);
});

test("test webhooks without a signing secret are reconciled against Stripe before activation", async () => {
  const incoming = checkoutEvent("evt_reconcile1");
  const canonical = { ...incoming, data: { object: { ...incoming.data.object } } };
  let received = null;
  const response = await handleStripeWebhook(new Request("https://whatnow-app.com/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(incoming),
  }), {
    environment: { ...testEnvironment, STRIPE_WEBHOOK_SECRET: "" },
    store: { readForUser: async () => null, markCheckoutPending: async () => {}, applyStripeEvent: async (value) => { received = value; } },
    fetchImpl: async (url) => {
      assert.match(String(url), /\/v1\/events\/evt_reconcile1$/);
      return Response.json(canonical);
    },
  });
  assert.equal(response.status, 200);
  assert.equal(received.id, canonical.id);
});

test("test webhook reconciliation rejects an event Stripe does not confirm", async () => {
  let applied = 0;
  const response = await handleStripeWebhook(new Request("https://whatnow-app.com/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(checkoutEvent("evt_missing1")),
  }), {
    environment: { ...testEnvironment, STRIPE_WEBHOOK_SECRET: "" },
    store: { readForUser: async () => null, markCheckoutPending: async () => {}, applyStripeEvent: async () => { applied += 1; } },
    fetchImpl: async () => new Response(null, { status: 404 }),
  });
  assert.equal(response.status, 400);
  assert.equal(applied, 0);
});

test("webhook rejects a live event when the endpoint is configured for test mode", async () => {
  const event = { ...checkoutEvent("evt_live_mismatch"), livemode: true };
  const payload = JSON.stringify(event);
  const now = Date.UTC(2026, 6, 17, 12);
  const header = await signature(payload, testEnvironment.STRIPE_WEBHOOK_SECRET, Math.floor(now / 1000));
  let applied = 0;
  const response = await handleStripeWebhook(new Request("https://whatnow-app.com/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  }), {
    environment: testEnvironment,
    store: { readForUser: async () => null, markCheckoutPending: async () => {}, applyStripeEvent: async () => { applied += 1; } },
    now,
  });
  assert.equal(response.status, 400);
  assert.equal(applied, 0);
});

test("subscription storage accepts live Stripe events and records live mode", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const store = createSubscriptionStoreForTests(new Database(database));
    await store.markCheckoutPending("live-user", "b".repeat(40), false, 1_000);
    const event = checkoutEvent("evt_live1");
    event.livemode = true;
    event.data.object.client_reference_id = "b".repeat(40);
    event.data.object.metadata.whatnow_account = "b".repeat(40);
    await store.applyStripeEvent(event, 2_000);
    const subscription = await store.readForUser("live-user");
    assert.equal(subscription.planCode, "pro");
    assert.equal(subscription.testMode, false);
  } finally {
    database.close();
  }
});
