import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GET, POST } from "../app/api/subscription/route.ts";
import { checkoutForm, createStripeCheckout, privateSubscriptionReference, stripeConfiguration, testCheckoutAllowed } from "../app/stripe-server.ts";

const token = "test.subscription-user.signature";

function request(method = "GET", headers = {}, body = "{}") {
  return new Request("https://whatnow-app.com/api/subscription", {
    method,
    headers: { authorization: `Bearer ${token}`, ...(method === "POST" ? { "content-type": "application/json" } : {}), ...headers },
    body: method === "POST" ? body : undefined,
  });
}

function authResponse() {
  return Response.json({ id: "subscription-user", email: "owner@example.com", email_confirmed_at: "2026-07-10T00:00:00Z" });
}

test("Stripe configuration requires an explicit mode and matching secret", () => {
  assert.equal(stripeConfiguration({}), null);
  assert.equal(stripeConfiguration({ STRIPE_CHECKOUT_MODE: "test", STRIPE_SECRET_KEY: "sk_live_secret", STRIPE_PRO_PRICE_ID: "price_123" }), null);
  assert.deepEqual(stripeConfiguration({ STRIPE_CHECKOUT_MODE: "test", STRIPE_SECRET_KEY: "sk_test_secret", STRIPE_PRO_PRICE_ID: "price_123" }), { secretKey: "sk_test_secret", priceId: "price_123", mode: "test" });
  assert.deepEqual(stripeConfiguration({ STRIPE_CHECKOUT_MODE: "live", STRIPE_SECRET_KEY: "sk_live_secret", STRIPE_PRO_PRICE_ID: "price_live123" }), { secretKey: "sk_live_secret", priceId: "price_live123", mode: "live" });
  assert.deepEqual(stripeConfiguration({ STRIPE_CHECKOUT_MODE: "live", STRIPE_SECRET_KEY: "rk_live_limited", STRIPE_PRO_PRICE_ID: "price_live123" }), { secretKey: "rk_live_limited", priceId: "price_live123", mode: "live" });
  assert.equal(testCheckoutAllowed("Owner@Example.com", { STRIPE_TEST_ALLOWED_EMAILS: "other@example.com, owner@example.com" }), true);
  assert.equal(testCheckoutAllowed("visitor@example.com", { STRIPE_TEST_ALLOWED_EMAILS: "owner@example.com" }), false);
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

test("checkout creation sends a stable Stripe idempotency key for browser retries", async () => {
  let capturedHeaders;
  const result = await createStripeCheckout({
    request: new Request("https://whatnow-app.com/api/subscription"),
    user: { id: "user-1", email: "owner@example.com" },
    configuration: { secretKey: "sk_live_secret", priceId: "price_live123", mode: "live" },
    fetchImpl: async (_url, init) => {
      capturedHeaders = init?.headers;
      return Response.json({ url: "https://checkout.stripe.com/c/pay/cs_test" });
    },
  });
  assert.equal(result.ok, true);
  const idempotencyKey = capturedHeaders?.["Idempotency-Key"];
  assert.match(idempotencyKey, /^whatnow-checkout-[a-f0-9]{40}-\d+$/);
});

test("subscription endpoint reports Free and cannot charge without test configuration", async () => {
  const previousFetch = globalThis.fetch;
  const previousMode = process.env.STRIPE_CHECKOUT_MODE;
  delete process.env.STRIPE_CHECKOUT_MODE;
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

    const checkout = await POST(request("POST", {}, JSON.stringify({ action: "checkout" })));
    assert.equal(checkout.status, 503);
    assert.equal((await checkout.json()).error.code, "checkout_unavailable");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousMode === undefined) delete process.env.STRIPE_CHECKOUT_MODE;
    else process.env.STRIPE_CHECKOUT_MODE = previousMode;
  }
});

test("private test checkout blocks accounts outside the allowlist", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnvironment = {
    mode: process.env.STRIPE_CHECKOUT_MODE,
    allowed: process.env.STRIPE_TEST_ALLOWED_EMAILS,
    secret: process.env.STRIPE_SECRET_KEY,
    price: process.env.STRIPE_PRO_PRICE_ID,
  };
  process.env.STRIPE_CHECKOUT_MODE = "test";
  process.env.STRIPE_TEST_ALLOWED_EMAILS = "someone-else@example.com";
  process.env.STRIPE_SECRET_KEY = "sk_test_configuredbutclosed";
  process.env.STRIPE_PRO_PRICE_ID = "price_configuredbutclosed";
  globalThis.fetch = async (url) => String(url).includes("/auth/v1/user") ? authResponse() : (() => { throw new Error("Stripe must not be called for a non-allowlisted account"); })();
  try {
    const checkout = await POST(request("POST", {}, JSON.stringify({ action: "checkout" })));
    assert.equal(checkout.status, 403);
    assert.equal((await checkout.json()).error.code, "checkout_unavailable");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousEnvironment.mode === undefined) delete process.env.STRIPE_CHECKOUT_MODE;
    else process.env.STRIPE_CHECKOUT_MODE = previousEnvironment.mode;
    if (previousEnvironment.allowed === undefined) delete process.env.STRIPE_TEST_ALLOWED_EMAILS;
    else process.env.STRIPE_TEST_ALLOWED_EMAILS = previousEnvironment.allowed;
    if (previousEnvironment.secret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousEnvironment.secret;
    if (previousEnvironment.price === undefined) delete process.env.STRIPE_PRO_PRICE_ID;
    else process.env.STRIPE_PRO_PRICE_ID = previousEnvironment.price;
  }
});

test("subscription endpoint rejects cross-site checkout before authentication", async () => {
  const response = await POST(request("POST", { origin: "https://attacker.example", "sec-fetch-site": "cross-site" }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "forbidden");
});

test("plan UI is localized for private test and live checkout states", async () => {
  const [panel, hub, env] = await Promise.all([
    readFile(new URL("../app/subscription-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/user-hub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  for (const phrase of ["Subscribe securely", "Оформить безопасно", "Abonēt droši"]) assert.match(panel, new RegExp(phrase));
  assert.match(panel, /\$9\.99/);
  assert.match(hub, /<SubscriptionPanel locale=\{locale\}/);
  assert.match(panel, /cancelAtPeriodEnd/);
  assert.match(panel, /Cancellation scheduled/);
  assert.match(panel, /renews automatically/);
  assert.match(env, /STRIPE_CHECKOUT_MODE=disabled/);
  assert.match(env, /STRIPE_TEST_ALLOWED_EMAILS=/);
  assert.doesNotMatch(panel, /sk_test_|sk_live_/);
});
