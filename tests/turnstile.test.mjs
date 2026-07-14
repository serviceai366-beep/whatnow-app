import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyTurnstileToken } from "../app/turnstile-server.ts";

async function withTurnstileEnv(callback) {
  const previousSecret = process.env.TURNSTILE_SECRET_KEY;
  const previousHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME;
  process.env.TURNSTILE_SECRET_KEY = "server-only-secret";
  process.env.TURNSTILE_EXPECTED_HOSTNAME = "whatnow.example";
  try { return await callback(); }
  finally {
    if (previousSecret) process.env.TURNSTILE_SECRET_KEY = previousSecret;
    else delete process.env.TURNSTILE_SECRET_KEY;
    if (previousHostname) process.env.TURNSTILE_EXPECTED_HOSTNAME = previousHostname;
    else delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
  }
}

test("rejects missing and oversized CAPTCHA tokens without a network call", async () => withTurnstileEnv(async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("must not call"); };
  const request = new Request("https://whatnow.example/api/analyze");
  assert.deepEqual(await verifyTurnstileToken({ request, token: null, action: "analyze", fetchImpl }), { ok: false, code: "captcha_required" });
  assert.deepEqual(await verifyTurnstileToken({ request, token: "x".repeat(2049), action: "analyze", fetchImpl }), { ok: false, code: "captcha_required" });
  assert.equal(calls, 0);
}));

test("accepts only successful tokens for the exact hostname and action", async () => withTurnstileEnv(async () => {
  const request = new Request("https://whatnow.example/api/analyze", { headers: { "cf-connecting-ip": "192.0.2.1" } });
  let submittedBody = "";
  const accepted = await verifyTurnstileToken({
    request,
    token: "valid-turnstile-token",
    action: "analyze",
    fetchImpl: async (_url, init) => {
      submittedBody = String(init?.body);
      return Response.json({ success: true, hostname: "whatnow.example", action: "analyze" });
    },
  });
  assert.deepEqual(accepted, { ok: true });
  assert.match(submittedBody, /response=valid-turnstile-token/);
  assert.match(submittedBody, /remoteip=192\.0\.2\.1/);

  for (const payload of [
    { success: false, hostname: "whatnow.example", action: "analyze" },
    { success: true, hostname: "attacker.example", action: "analyze" },
    { success: true, hostname: "whatnow.example", action: "other" },
  ]) {
    const rejected = await verifyTurnstileToken({
      request,
      token: "valid-turnstile-token",
      action: "analyze",
      fetchImpl: async () => Response.json(payload),
    });
    assert.deepEqual(rejected, { ok: false, code: "captcha_failed" });
  }
}));

test("fails closed when the server secret or verification service is unavailable", async () => {
  const previousSecret = process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  try {
    const request = new Request("https://whatnow.example/api/analyze");
    assert.deepEqual(await verifyTurnstileToken({ request, token: "valid-turnstile-token", action: "analyze" }), { ok: false, code: "captcha_unavailable" });
  } finally {
    if (previousSecret) process.env.TURNSTILE_SECRET_KEY = previousSecret;
  }
});

test("uses Cloudflare dummy credentials only in local development", async () => {
  const [clientConfig, serverConfig] = await Promise.all([
    readFile(new URL("../app/turnstile-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/turnstile-server.ts", import.meta.url), "utf8"),
  ]);
  assert.match(clientConfig, /NODE_ENV === "development"/);
  assert.match(clientConfig, /1x00000000000000000000AA/);
  assert.match(serverConfig, /NODE_ENV === "development"/);
  assert.match(serverConfig, /1x0000000000000000000000000000000AA/);
  assert.match(serverConfig, /process\.env\.TURNSTILE_SECRET_KEY/);
});
