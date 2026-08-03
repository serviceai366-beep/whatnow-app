import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { POST } from "../app/api/translate/route.ts";
import { resetAnalysisChallengeStateForTests } from "../app/analysis-challenge.ts";
import { translationJsonSchema, validateTranslationResult } from "../app/translation-schema.ts";

const validTranslation = {
  schemaVersion: "1.0",
  sourceLanguage: "lv",
  targetLanguage: "en",
  translation: "This is a translated document.",
  notes: [],
  uncertainties: [],
};

function requestWithText(text = "Sveiki!", options = {}) {
  const formData = new FormData();
  formData.set("targetLanguage", options.targetLanguage ?? "en");
  formData.set("mode", "text");
  formData.set("text", text);
  if (options.captchaToken) formData.set("turnstileToken", options.captchaToken);
  return new Request("http://localhost/api/translate", {
    method: "POST",
    body: formData,
    headers: {
      authorization: `Bearer test.${options.userId ?? "translation-user"}.signature`,
      "x-forwarded-for": "192.0.2.40",
    },
  });
}

function requestWithFile(file, options = {}) {
  const formData = new FormData();
  formData.set("targetLanguage", options.targetLanguage ?? "ru");
  formData.set("mode", "file");
  formData.set("file", file);
  return new Request("http://localhost/api/translate", {
    method: "POST",
    body: formData,
    headers: { authorization: `Bearer test.${options.userId ?? "translation-file-user"}.signature` },
  });
}

function openAiResponse(result = validTranslation) {
  return Response.json({
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }],
    usage: { input_tokens: 22, output_tokens: 14, total_tokens: 36, input_tokens_details: { cached_tokens: 0 } },
  });
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
    if (previousKey) process.env.OPENAI_API_KEY = previousKey; else delete process.env.OPENAI_API_KEY;
    if (previousCaptchaSecret) process.env.TURNSTILE_SECRET_KEY = previousCaptchaSecret; else delete process.env.TURNSTILE_SECRET_KEY;
    if (previousCaptchaHostname) process.env.TURNSTILE_EXPECTED_HOSTNAME = previousCaptchaHostname; else delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
  }
}

test("translation schema accepts complete results and rejects invented fields or wrong targets", () => {
  assert.equal(validateTranslationResult(validTranslation, "en"), true);
  assert.equal(validateTranslationResult({ ...validTranslation, targetLanguage: "ru" }, "en"), false);
  assert.equal(validateTranslationResult({ ...validTranslation, extra: "no" }, "en"), false);
  assert.equal(translationJsonSchema.additionalProperties, false);
  assert.deepEqual(translationJsonSchema.properties.targetLanguage.enum, ["en", "ru", "lv", "es", "pt", "fr", "de", "it", "pl", "uk", "nl", "ro", "sv", "cs"]);
});

test("translation route requires a verified account and never calls OpenAI without it", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("unexpected network call"); };
  try {
    const response = await POST(new Request("http://localhost/api/translate", { method: "POST", body: new FormData() }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "authentication_required");
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previousFetch; }
}));

test("translation route sends a structured, non-stored request for text", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  resetAnalysisChallengeStateForTests();
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    if (address.includes("/auth/v1/user")) return Response.json({ id: "translation-text-user", email: "translation@example.com", email_confirmed_at: "2026-08-03T10:00:00Z", is_anonymous: false });
    if (address.includes("challenges.cloudflare.com")) return Response.json({ success: true, hostname: "localhost", action: "analyze" });
    requests.push({ url: address, body: JSON.parse(init.body) });
    return openAiResponse();
  };
  try {
    const response = await POST(requestWithText("Labdien!", { userId: "translation-text-user" }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.result.translation, validTranslation.translation);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
    assert.equal(requests[0].body.model, "gpt-5.6-luna");
    assert.deepEqual(requests[0].body.reasoning, { effort: "low" });
    assert.equal(requests[0].body.store, false);
    assert.equal(requests[0].body.text.format.name, "whatnow_translation");
    assert.equal(requests[0].body.text.format.strict, true);
    assert.match(requests[0].body.instructions, /Translate the supplied source material/);
  } finally { globalThis.fetch = previousFetch; }
}));

test("translation route validates file signatures and forwards a safe PDF filename", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    if (address.includes("/auth/v1/user")) return Response.json({ id: "translation-pdf-user", email: "pdf@example.com", email_confirmed_at: "2026-08-03T10:00:00Z", is_anonymous: false });
    requests.push({ url: address, body: JSON.parse(init.body) });
    return openAiResponse({ ...validTranslation, targetLanguage: "ru", translation: "Переведённый документ." });
  };
  try {
    const pdf = new File([new TextEncoder().encode("%PDF-1.7\n")], "private-name.pdf", { type: "application/pdf" });
    const response = await POST(requestWithFile(pdf, { targetLanguage: "ru", userId: "translation-pdf-user" }));
    assert.equal(response.status, 200);
    const content = requests[0].body.input[0].content;
    assert.equal(content[1].type, "input_file");
    assert.equal(content[1].filename, "document.pdf");
    assert.equal(content[1].detail, "high");
    assert.doesNotMatch(content[1].file_data, /private-name/);
  } finally { globalThis.fetch = previousFetch; }
}));

test("translation UI exposes the dedicated mode and handoff actions", async () => {
  const [page, component, route, styles, studio] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/translation-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/translate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/document-studio-prototype.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /productMode === "translate"/);
  assert.match(page, /<TranslationWorkspace/);
  assert.match(component, /onUseInUnderstand/);
  assert.match(component, /onUseInCreate/);
  assert.match(component, /\.pdf.*\.docx.*\.odt/);
  assert.match(route, /verifySupabaseRequest/);
  assert.match(route, /checkAnalysisQuota/);
  assert.match(route, /store: false/);
  assert.match(styles, /\.translation-shell/);
  assert.match(styles, /grid-template-columns: repeat\(3/);
  assert.match(studio, /initialPrompt/);
});
