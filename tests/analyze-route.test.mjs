import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/analyze/route.ts";
import { validAnalysisResult } from "./analysis-fixture.mjs";

let requestSequence = 0;

function tokenFor(userId) {
  return `test.${userId}.signature`;
}

function requestWithText(language = "ru", text = "Официальное уведомление без указанного срока.", options = {}) {
  const formData = new FormData();
  formData.set("language", language);
  formData.set("mode", "text");
  formData.set("text", text);
  if (!options.withoutCaptcha) formData.set("turnstileToken", options.captchaToken ?? "test-turnstile-token");
  requestSequence += 1;
  const userId = options.userId ?? `route-user-${requestSequence}`;
  const headers = {
    authorization: `Bearer ${tokenFor(userId)}`,
    "x-forwarded-for": `192.0.2.${requestSequence % 250}`,
    ...options.headers,
  };
  if (options.withoutAuth) delete headers.authorization;
  return new Request("http://localhost/api/analyze", { method: "POST", body: formData, headers });
}

function requestWithFile(file, options = {}) {
  const formData = new FormData();
  formData.set("language", options.language ?? "ru");
  formData.set("mode", "file");
  formData.set("file", file);
  if (!options.withoutCaptcha) formData.set("turnstileToken", options.captchaToken ?? "test-turnstile-token");
  requestSequence += 1;
  const userId = options.userId ?? `file-user-${requestSequence}`;
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: formData,
    headers: { authorization: `Bearer ${tokenFor(userId)}`, "x-forwarded-for": `198.51.100.${requestSequence % 250}` },
  });
}

function successfulOpenAI(language = "ru") {
  return Response.json({
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ ...validAnalysisResult, outputLanguage: language }) }] }],
    usage: { input_tokens: 1234, output_tokens: 456, total_tokens: 1690, input_tokens_details: { cached_tokens: 128 } },
  });
}

function routedFetch(openaiHandler, { authStatus = 200, authUser, captchaResponse } = {}) {
  return async (url, init = {}) => {
    const address = String(url);
    if (address.includes("/auth/v1/user")) {
      if (authStatus !== 200) return Response.json({ message: "invalid" }, { status: authStatus });
      const token = String(init.headers?.Authorization ?? "").replace(/^Bearer /, "");
      const userId = authUser?.id ?? token.split(".")[1] ?? "verified-user";
      return Response.json(authUser ?? {
        id: userId,
        email: `${userId}@example.com`,
        email_confirmed_at: "2026-07-13T18:00:00Z",
        is_anonymous: false,
      });
    }
    if (address.includes("challenges.cloudflare.com/turnstile/v0/siteverify")) {
      return Response.json(captchaResponse ?? { success: true, hostname: "localhost", action: "analyze" });
    }
    return openaiHandler(url, init);
  };
}

async function withServerKey(callback) {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousCaptchaSecret = process.env.TURNSTILE_SECRET_KEY;
  const previousCaptchaHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME;
  process.env.OPENAI_API_KEY = "test-server-key";
  process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
  process.env.TURNSTILE_EXPECTED_HOSTNAME = "localhost";
  try { return await callback(); }
  finally {
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
    if (previousCaptchaSecret) process.env.TURNSTILE_SECRET_KEY = previousCaptchaSecret;
    else delete process.env.TURNSTILE_SECRET_KEY;
    if (previousCaptchaHostname) process.env.TURNSTILE_EXPECTED_HOSTNAME = previousCaptchaHostname;
    else delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
  }
}

test("fails safely when the server secret is missing", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  delete process.env.OPENAI_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("must not fetch"); };
  try {
    const response = await POST(requestWithText());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "not_configured");
    assert.equal(calls, 0);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
  }
});

test("requires a verified Supabase account before OpenAI", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("must not fetch"); };
  try {
    const missing = await POST(requestWithText("ru", "text", { withoutAuth: true }));
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).error.code, "authentication_required");
    assert.equal(calls, 0);

    globalThis.fetch = routedFetch(() => { throw new Error("OpenAI must not be called"); }, { authStatus: 401 });
    const invalid = await POST(requestWithText());
    assert.equal(invalid.status, 401);
    assert.equal((await invalid.json()).error.code, "authentication_invalid");
  } finally { globalThis.fetch = previousFetch; }
}));

test("requires a fresh server-validated Turnstile token before quota or OpenAI", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  let openaiCalls = 0;
  try {
    globalThis.fetch = routedFetch(() => { openaiCalls += 1; return successfulOpenAI(); });
    const missing = await POST(requestWithText("ru", "text", { withoutCaptcha: true }));
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).error.code, "captcha_required");

    globalThis.fetch = routedFetch(() => { openaiCalls += 1; return successfulOpenAI(); }, {
      captchaResponse: { success: false, hostname: "localhost", action: "analyze" },
    });
    const rejected = await POST(requestWithText());
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error.code, "captcha_failed");
    assert.equal(openaiCalls, 0);
  } finally { globalThis.fetch = previousFetch; }
}));

test("sends exactly one structured Responses request after account verification", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  const openaiRequests = [];
  globalThis.fetch = routedFetch(async (url, init) => {
    openaiRequests.push({ url: String(url), init, body: JSON.parse(init.body) });
    return successfulOpenAI();
  });
  try {
    const response = await POST(requestWithText());
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.result.summary, validAnalysisResult.summary);
    assert.deepEqual(payload.meta, {
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
      usage: { inputTokens: 1234, outputTokens: 456, totalTokens: 1690, cachedInputTokens: 128 },
    });
    assert.equal(openaiRequests.length, 1);
    assert.equal(openaiRequests[0].url, "https://api.openai.com/v1/responses");
    assert.equal(openaiRequests[0].init.headers.Authorization, "Bearer test-server-key");
    assert.equal(openaiRequests[0].body.model, "gpt-5.6-luna");
    assert.deepEqual(openaiRequests[0].body.reasoning, { effort: "low" });
    assert.equal(openaiRequests[0].body.store, false);
    assert.equal(openaiRequests[0].body.max_output_tokens, 3500);
    assert.equal(openaiRequests[0].body.text.format.strict, true);
    assert.equal(response.headers.get("x-ratelimit-limit-24h"), "3");
    assert.equal(response.headers.get("x-ratelimit-limit-7d"), "10");
  } finally { globalThis.fetch = previousFetch; }
}));

test("rejects cross-site data before account or OpenAI calls", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("must not fetch"); };
  try {
    const response = await POST(requestWithText("ru", "text", { headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" } }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "forbidden");
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previousFetch; }
}));

test("rejects damaged or disguised files before OpenAI and without exposing names", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  let openaiCalls = 0;
  globalThis.fetch = routedFetch(() => { openaiCalls += 1; return successfulOpenAI(); });
  try {
    const response = await POST(requestWithFile(new File(["<html>fake</html>"], "private-scan.png", { type: "image/png" })));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_file_content");
    assert.equal(openaiCalls, 0);
  } finally { globalThis.fetch = previousFetch; }
}));

test("sanitizes PDF and rich-document filenames before forwarding", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = routedFetch((_url, init) => { bodies.push(JSON.parse(init.body)); return successfulOpenAI(); });
  try {
    const pdf = new File([new TextEncoder().encode("%PDF-1.4\n")], "Timur-private-letter.pdf", { type: "application/pdf" });
    assert.equal((await POST(requestWithFile(pdf))).status, 200);
    assert.equal(bodies[0].input[0].content[1].filename, "document.pdf");
    assert.equal(bodies[0].input[0].content[1].detail, "high");
    assert.doesNotMatch(JSON.stringify(bodies[0]), /Timur-private-letter/);

    const rtf = new File([new TextEncoder().encode("{\\rtf1\\ansi Official notice}")], "Sensitive Name.rtf", { type: "application/rtf" });
    assert.equal((await POST(requestWithFile(rtf))).status, 200);
    assert.equal(bodies[1].input[0].content[1].filename, "document.rtf");
    assert.equal(bodies[1].input[0].content[1].detail, undefined);
    assert.match(bodies[1].input[0].content[1].file_data, /^data:application\/rtf;base64,/);
    assert.doesNotMatch(JSON.stringify(bodies[1]), /Sensitive Name/);
  } finally { globalThis.fetch = previousFetch; }
}));

test("decodes TXT server-side and sends it as bounded input text", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  let body;
  globalThis.fetch = routedFetch((_url, init) => { body = JSON.parse(init.body); return successfulOpenAI("en"); });
  try {
    const file = new File([new TextEncoder().encode("Please reply by 20 July 2026.")], "note.txt", { type: "text/plain" });
    const response = await POST(requestWithFile(file, { language: "en" }));
    assert.equal(response.status, 200);
    assert.equal(body.input[0].content.length, 1);
    assert.equal(body.input[0].content[0].type, "input_text");
    assert.match(body.input[0].content[0].text, /Please reply by 20 July 2026/);
    assert.doesNotMatch(JSON.stringify(body), /file_data/);
  } finally { globalThis.fetch = previousFetch; }
}));

test("enforces 3 analyses per rolling 24 hours for one verified user", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  let openaiCalls = 0;
  globalThis.fetch = routedFetch(() => { openaiCalls += 1; return successfulOpenAI(); });
  try {
    const responses = [];
    for (let index = 0; index < 4; index += 1) {
      responses.push(await POST(requestWithText("ru", `Документ ${index}`, { userId: "route-limit-owner" })));
    }
    assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 429]);
    const payload = await responses[3].json();
    assert.equal(payload.error.code, "user_limit_reached");
    assert.equal(payload.error.scope, "user_24h");
    assert.equal(payload.error.limits.daily.limit, 3);
    assert.equal(payload.error.limits.daily.remaining, 0);
    assert.ok(payload.error.resetAt > Date.now());
    assert.equal(Number(responses[3].headers.get("retry-after")), payload.error.retryAfterSeconds);
    assert.equal(openaiCalls, 3);
  } finally { globalThis.fetch = previousFetch; }
}));

test("keeps output language independent from source language", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  let body;
  globalThis.fetch = routedFetch((_url, init) => { body = JSON.parse(init.body); return successfulOpenAI("lv"); });
  try {
    const source = "Please submit the signed form by 20 July 2026.";
    const response = await POST(requestWithText("lv", source));
    assert.equal(response.status, 200);
    assert.match(body.instructions, /Return the explanation in Latvian/);
    assert.match(body.input[0].content[0].text, /Please submit the signed form/);
  } finally { globalThis.fetch = previousFetch; }
}));

test("rejects malformed, empty, wrong-language, and incomplete model output", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  const upstream = [
    Response.json({ output: [] }),
    Response.json({ output: [{ content: [{ type: "output_text", text: "{broken" }] }] }),
    Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ ...validAnalysisResult, outputLanguage: "en" }) }] }] }),
    Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ summary: "incomplete" }) }] }] }),
  ];
  globalThis.fetch = routedFetch(() => upstream.shift());
  try {
    for (let index = 0; index < 4; index += 1) {
      const response = await POST(requestWithText());
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, "invalid_model_response");
    }
  } finally { globalThis.fetch = previousFetch; }
}));

test("maps upstream auth, rate, and transport failures without leaking details", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  const upstream = [
    Response.json({ error: { message: "secret upstream detail" } }, { status: 401, headers: { "x-request-id": "req-secret" } }),
    Response.json({ error: { message: "throttled" } }, { status: 429 }),
    new Response("not json", { status: 502 }),
  ];
  globalThis.fetch = routedFetch(() => upstream.shift());
  try {
    const expected = [[502, "openai_auth"], [429, "rate_limited"], [502, "upstream_error"]];
    for (const [status, code] of expected) {
      const response = await POST(requestWithText());
      const payload = await response.json();
      assert.equal(response.status, status);
      assert.equal(payload.error.code, code);
      assert.doesNotMatch(JSON.stringify(payload), /secret upstream detail|req-secret|throttled/);
    }
  } finally { globalThis.fetch = previousFetch; }
}));

test("aborts a stalled OpenAI request at the configured timeout", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  const previousTimeout = process.env.WHATNOW_REQUEST_TIMEOUT_MS;
  process.env.WHATNOW_REQUEST_TIMEOUT_MS = "10";
  globalThis.fetch = routedFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  try {
    const response = await POST(requestWithText());
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, "timeout");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousTimeout) process.env.WHATNOW_REQUEST_TIMEOUT_MS = previousTimeout;
    else delete process.env.WHATNOW_REQUEST_TIMEOUT_MS;
  }
}));

test("rejects malformed multipart, oversized bodies, and unsupported languages", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = routedFetch(() => { throw new Error("OpenAI must not be called"); });
  try {
    const common = { authorization: `Bearer ${tokenFor("malformed-user")}` };
    const malformed = await POST(new Request("http://localhost/api/analyze", {
      method: "POST", body: "broken multipart", headers: { ...common, "content-type": "multipart/form-data; boundary=missing" },
    }));
    assert.equal(malformed.status, 400);

    const oversized = await POST(new Request("http://localhost/api/analyze", {
      method: "POST", body: "x", headers: { ...common, "content-type": "multipart/form-data; boundary=test", "content-length": String(12 * 1024 * 1024 + 1) },
    }));
    assert.equal(oversized.status, 413);

    const unsupported = await POST(requestWithText("de"));
    assert.equal(unsupported.status, 400);
  } finally { globalThis.fetch = previousFetch; }
}));
