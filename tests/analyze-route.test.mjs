import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/analyze/route.ts";
import { validAnalysisResult } from "./analysis-fixture.mjs";

let requestSequence = 0;

function requestWithText(language = "ru", text = "Официальное уведомление без указанного срока.", headers = {}) {
  const formData = new FormData();
  formData.set("language", language);
  formData.set("mode", "text");
  formData.set("text", text);
  requestSequence += 1;
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: formData,
    headers: { "x-forwarded-for": `192.0.2.${requestSequence}`, ...headers },
  });
}

test("does not call OpenAI when the server secret is missing", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const response = await POST(requestWithText());
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.error.code, "not_configured");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  } finally {
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
  }
});

test("sends one Responses API request and validates its structured output", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const requests = [];
  process.env.OPENAI_API_KEY = "test-server-key";
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    return Response.json({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(validAnalysisResult) }] }],
      usage: { input_tokens: 1234, output_tokens: 456, total_tokens: 1690, input_tokens_details: { cached_tokens: 128 } },
    });
  };

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
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
    assert.equal(requests[0].init.headers.Authorization, "Bearer test-server-key");
    assert.equal(requests[0].body.model, "gpt-5.6-luna");
    assert.deepEqual(requests[0].body.reasoning, { effort: "low" });
    assert.equal(requests[0].body.store, false);
    assert.equal(requests[0].body.max_output_tokens, 3500);
    assert.equal(requests[0].body.text.format.strict, true);
    assert.equal(requests[0].body.input[0].content[0].type, "input_text");
    assert.equal(response.headers.get("x-ratelimit-limit"), "4");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("rejects cross-site requests before reading or forwarding document data", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-server-key";
  globalThis.fetch = async () => { throw new Error("OpenAI must not be called"); };

  try {
    const response = await POST(requestWithText("ru", "text", {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    }));
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.error.code, "forbidden");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("rejects a file whose bytes do not match its extension", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-server-key";
  globalThis.fetch = async () => { throw new Error("OpenAI must not be called"); };
  const formData = new FormData();
  formData.set("language", "ru");
  formData.set("mode", "file");
  formData.set("file", new File(["<html>fake image</html>"], "scan.png", { type: "image/png" }));

  try {
    const response = await POST(new Request("http://localhost/api/analyze", {
      method: "POST",
      body: formData,
      headers: { "x-forwarded-for": "203.0.113.42" },
    }));
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "invalid_file_content");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("sanitizes the PDF filename before forwarding it to OpenAI", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-server-key";
  let sentBody;
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return Response.json({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(validAnalysisResult) }] }],
    });
  };
  const formData = new FormData();
  formData.set("language", "ru");
  formData.set("mode", "file");
  formData.set("file", new File([new TextEncoder().encode("%PDF-1.4\n")], "Timur-private-letter.pdf", { type: "application/pdf" }));

  try {
    const response = await POST(new Request("http://localhost/api/analyze", {
      method: "POST",
      body: formData,
      headers: { "x-forwarded-for": "203.0.113.43" },
    }));
    assert.equal(response.status, 200);
    assert.equal(sentBody.input[0].content[1].filename, "document.pdf");
    assert.doesNotMatch(JSON.stringify(sentBody), /Timur-private-letter/);
    assert.equal(sentBody.store, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("limits repeated analyses before they can create additional OpenAI cost", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-server-key";
  let openaiCalls = 0;
  globalThis.fetch = async () => {
    openaiCalls += 1;
    return Response.json({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(validAnalysisResult) }] }],
    });
  };

  try {
    const responses = [];
    for (let index = 0; index < 5; index += 1) {
      responses.push(await POST(requestWithText("ru", `Документ ${index}`, { "x-forwarded-for": "198.51.100.77" })));
    }
    assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 429]);
    const payload = await responses[4].json();
    assert.equal(payload.error.code, "too_many_requests");
    assert.equal(openaiCalls, 4);
    assert.ok(Number(responses[4].headers.get("retry-after")) > 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("keeps the requested explanation language independent from the source language", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-server-key";
  let sentBody;
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return Response.json({
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify({ ...validAnalysisResult, outputLanguage: "lv" }) }],
      }],
    });
  };

  try {
    const source = "Please submit the signed form by 20 July 2026.";
    const response = await POST(requestWithText("lv", source));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.result.outputLanguage, "lv");
    assert.match(sentBody.instructions, /Return the explanation in Latvian/);
    assert.match(sentBody.input[0].content[0].text, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(sentBody.model, "gpt-5.6-luna");
    assert.deepEqual(sentBody.reasoning, { effort: "low" });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("rejects invalid model output instead of displaying it", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-server-key";
  globalThis.fetch = async () => Response.json({
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "incomplete" }) }] }],
  });

  try {
    const response = await POST(requestWithText());
    const payload = await response.json();
    assert.equal(response.status, 502);
    assert.equal(payload.error.code, "invalid_model_response");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("maps OpenAI authentication and upstream rate errors without exposing details", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-server-key";
  try {
    globalThis.fetch = async () => Response.json({ error: { message: "secret upstream detail" } }, {
      status: 401,
      headers: { "x-request-id": "req-test-auth" },
    });
    const authResponse = await POST(requestWithText());
    const authPayload = await authResponse.json();
    assert.equal(authResponse.status, 502);
    assert.equal(authPayload.error.code, "openai_auth");
    assert.doesNotMatch(JSON.stringify(authPayload), /secret upstream detail|req-test-auth/);

    globalThis.fetch = async () => Response.json({ error: { message: "upstream throttled" } }, { status: 429 });
    const rateResponse = await POST(requestWithText());
    const ratePayload = await rateResponse.json();
    assert.equal(rateResponse.status, 429);
    assert.equal(ratePayload.error.code, "rate_limited");
    assert.equal(ratePayload.error.retryable, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("handles non-JSON, empty, malformed and wrong-language model responses", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-server-key";
  try {
    const responses = [
      new Response("not json", { status: 502, headers: { "content-type": "text/plain" } }),
      Response.json({ output: [] }),
      Response.json({ output: [{ content: [{ type: "output_text", text: "{broken" }] }] }),
      Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ ...validAnalysisResult, outputLanguage: "en" }) }] }] }),
    ];
    globalThis.fetch = async () => responses.shift();

    const upstream = await POST(requestWithText());
    assert.equal(upstream.status, 502);
    assert.equal((await upstream.json()).error.code, "upstream_error");

    for (let index = 0; index < 3; index += 1) {
      const response = await POST(requestWithText("ru"));
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, "invalid_model_response");
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("aborts a stalled OpenAI request at the configured timeout", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousTimeout = process.env.WHATNOW_REQUEST_TIMEOUT_MS;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-server-key";
  process.env.WHATNOW_REQUEST_TIMEOUT_MS = "10";
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });

  try {
    const response = await POST(requestWithText());
    const payload = await response.json();
    assert.equal(response.status, 504);
    assert.equal(payload.error.code, "timeout");
    assert.equal(payload.error.retryable, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
    if (previousTimeout) process.env.WHATNOW_REQUEST_TIMEOUT_MS = previousTimeout;
    else delete process.env.WHATNOW_REQUEST_TIMEOUT_MS;
  }
});

test("rejects malformed multipart bodies, oversized content-length and unsupported languages", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-server-key";
  try {
    const malformed = await POST(new Request("http://localhost/api/analyze", {
      method: "POST",
      body: "broken multipart",
      headers: { "content-type": "multipart/form-data; boundary=missing", "x-forwarded-for": "198.51.100.201" },
    }));
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "invalid_request");

    const oversized = await POST(new Request("http://localhost/api/analyze", {
      method: "POST",
      body: "x",
      headers: {
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(12 * 1024 * 1024 + 1),
        "x-forwarded-for": "198.51.100.202",
      },
    }));
    assert.equal(oversized.status, 413);

    const unsupported = await POST(requestWithText("de"));
    assert.equal(unsupported.status, 400);
    assert.equal((await unsupported.json()).error.code, "invalid_request");
  } finally {
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});
