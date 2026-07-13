import assert from "node:assert/strict";
import test from "node:test";
import {
  createRateLimiter,
  hasSupportedRequestContentType,
  isRequestBodySizeAllowed,
  isSameOriginRequest,
  MAX_REQUEST_BODY_SIZE,
  privacySafeClientKey,
} from "../app/security.ts";

test("accepts same-origin forms and rejects cross-site submissions", () => {
  const sameOrigin = new Request("https://whatnow.example/api/analyze", {
    headers: { origin: "https://whatnow.example", "sec-fetch-site": "same-origin" },
  });
  const crossSite = new Request("https://whatnow.example/api/analyze", {
    headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
  });
  assert.equal(isSameOriginRequest(sameOrigin), true);
  assert.equal(isSameOriginRequest(crossSite), false);
});

test("accepts only bounded multipart requests", () => {
  assert.equal(hasSupportedRequestContentType(new Request("https://whatnow.example", {
    headers: { "content-type": "multipart/form-data; boundary=test" },
  })), true);
  assert.equal(hasSupportedRequestContentType(new Request("https://whatnow.example", {
    headers: { "content-type": "application/json" },
  })), false);
  assert.equal(isRequestBodySizeAllowed(new Request("https://whatnow.example", {
    headers: { "content-length": String(MAX_REQUEST_BODY_SIZE) },
  })), true);
  assert.equal(isRequestBodySizeAllowed(new Request("https://whatnow.example", {
    headers: { "content-length": String(MAX_REQUEST_BODY_SIZE + 1) },
  })), false);
});

test("uses a stable one-way client key instead of storing a raw address", async () => {
  const first = await privacySafeClientKey(new Request("https://whatnow.example", { headers: { "cf-connecting-ip": "192.0.2.1" } }));
  const same = await privacySafeClientKey(new Request("https://whatnow.example", { headers: { "cf-connecting-ip": "192.0.2.1" } }));
  const other = await privacySafeClientKey(new Request("https://whatnow.example", { headers: { "cf-connecting-ip": "192.0.2.2" } }));
  assert.equal(first, same);
  assert.notEqual(first, other);
  assert.doesNotMatch(first, /192\.0\.2\.1/);
  assert.match(first, /^[a-f0-9]{24}$/);
});

test("uses the signed-in account identity without storing its raw email", async () => {
  const first = await privacySafeClientKey(new Request("https://whatnow.example", {
    headers: { "oai-authenticated-user-email": "Person@Example.com", "cf-connecting-ip": "192.0.2.1" },
  }), "test-secret");
  const changedNetwork = await privacySafeClientKey(new Request("https://whatnow.example", {
    headers: { "oai-authenticated-user-email": "person@example.com", "cf-connecting-ip": "198.51.100.2" },
  }), "test-secret");
  const otherAccount = await privacySafeClientKey(new Request("https://whatnow.example", {
    headers: { "oai-authenticated-user-email": "other@example.com", "cf-connecting-ip": "192.0.2.1" },
  }), "test-secret");
  assert.equal(first, changedNetwork);
  assert.notEqual(first, otherAccount);
  assert.doesNotMatch(first, /person|example/);
});

test("rate limiter resets after its configured window", () => {
  let currentTime = 1_000;
  const limiter = createRateLimiter({ limit: 2, windowMs: 500, now: () => currentTime });
  assert.equal(limiter.check("client").allowed, true);
  assert.equal(limiter.check("client").allowed, true);
  assert.equal(limiter.check("client").allowed, false);
  currentTime = 1_501;
  assert.equal(limiter.check("client").allowed, true);
});
