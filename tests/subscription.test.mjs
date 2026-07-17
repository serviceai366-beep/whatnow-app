import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GET, POST } from "../app/api/subscription/route.ts";
import { checkoutForm, privateSubscriptionReference, stripeTestConfiguration } from "../app/stripe-server.ts";

const token = "test.subscription-user.signature";

function request(method = "GET", headers = {}) {
  return new Request("https://whatnow-app.com/api/subscription", {
    method,
    headers: { authorization: `Bearer ${token}`, ...(method === "POST" ? { "content-type": "application/json" } : {}), ...headers },
    body: method === "POST" ? "{}" : undefined,
  });
}

function authResponse() {
  return Response.json({ id: "subscription-user", email: "owner@example.com", email_confirmed_at: "2026-07-10T00:00:00Z" });
}

test("Stripe configuration is disabled by default and rejects live secrets", () => {
  assert.equal(stripeTestConfiguration({}), null);
  assert.equal(stripeTestConfiguration({ STRIPE_TEST_CHECKOUT_ENABLED: "true", STRIPE_SECRET_KEY: "sk_live_secret", STRIPE_PRO_PRICE_ID: "price_123" }), null);
  assert.deepEqual(stripeTestConfiguration({ STRIPE_TEST_CHECKOUT_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_secret", STRIPE_PRO_PRICE_ID: "price_123" }), { secretKey: "sk_test_secret", priceId: "price_123" });
});

test("checkout form uses one fixed recurring price and a private account reference", async () => {
  const reference = await privateSubscriptionReference("user-1");
  assert.equal(reference.length, 40);
  assert.doesNotMatch(reference, /user-1/);
  const form = checkoutForm({ priceId: "price_123", user: { id: "user-1", email: "owner@example.com" }, userReference: reference, origin: "https://whatnow-app.com" });
  assert.equal(form.get("mode"), "subscription");
  assert.equal(form.get("line_items[0][price]"), "price_123");
  assert.equal(form.get("line_items[0][quantity]"), "1");
  assert.equal(form.get("client_reference_id"), reference);
  assert.equal(form.get("customer_email"), "owner@example.com");
  assert.equal(form.get("success_url"), "https://whatnow-app.com/?subscription=success");
});

test("subscription endpoint reports Free and cannot charge without test configuration", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnabled = process.env.STRIPE_TEST_CHECKOUT_ENABLED;
  delete process.env.STRIPE_TEST_CHECKOUT_ENABLED;
  globalThis.fetch = async (url) => String(url).includes("/auth/v1/user") ? authResponse() : (() => { throw new Error("Stripe must not be called"); })();
  try {
    const snapshot = await GET(request());
    assert.equal(snapshot.status, 200);
    const body = await snapshot.json();
    assert.equal(body.subscription.planCode, "free");
    assert.equal(body.subscription.checkoutAvailable, false);
    assert.equal(body.subscription.managementAvailable, false);
    assert.equal(body.pricing.monthlyGrossCents, 999);
    assert.equal(body.pricing.rolling24HourSafetyThreshold, 30);
    assert.equal(body.pricing.rolling30DaySafetyThreshold, 300);

    const checkout = await POST(request("POST"));
    assert.equal(checkout.status, 503);
    assert.equal((await checkout.json()).error.code, "checkout_unavailable");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEnabled === undefined) delete process.env.STRIPE_TEST_CHECKOUT_ENABLED;
    else process.env.STRIPE_TEST_CHECKOUT_ENABLED = previousEnabled;
  }
});

test("subscription endpoint rejects cross-site checkout before authentication", async () => {
  const response = await POST(request("POST", { origin: "https://attacker.example", "sec-fetch-site": "cross-site" }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "forbidden");
});

test("plan UI is localized and explicitly labels the non-chargeable test state", async () => {
  const [panel, hub, env] = await Promise.all([
    readFile(new URL("../app/subscription-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/user-hub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  for (const phrase of ["Payments are not open yet", "Списание с карты невозможно", "No kartes neko nevar iekasēt"]) assert.match(panel, new RegExp(phrase));
  assert.match(panel, /\$9\.99/);
  assert.match(hub, /<SubscriptionPanel locale=\{locale\}/);
  assert.match(env, /STRIPE_TEST_CHECKOUT_ENABLED=false/);
  assert.doesNotMatch(panel, /sk_test_|sk_live_/);
});
