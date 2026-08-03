import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { POST } from "../app/api/translate/route.ts";
import { POST as POST_FOLLOWUP } from "../app/api/translate/followup/route.ts";
import { resetAnalysisChallengeStateForTests } from "../app/analysis-challenge.ts";
import { translationJsonSchema, validateTranslationResult } from "../app/translation-schema.ts";
import { translationFollowupJsonSchema, validateTranslationFollowup } from "../app/translation-followup-schema.ts";

const validTranslation = {
  schemaVersion: "1.1",
  sourceLanguage: "lv",
  targetLanguage: "en",
  translation: "This is a translated document.",
  transcription: "This is a translated document.",
  variants: [
    { style: "literal", label: "Literal", translation: "This is a translated document.", transcription: "This iz a translaytid dokyument." },
    { style: "conversational", label: "Conversational", translation: "Here is the translated document.", transcription: "Hir iz the translaytid dokyument." },
    { style: "bold", label: "Bold", translation: "This document is translated and ready.", transcription: "This dokyument iz translaytid and redi." },
  ],
  notes: [],
  uncertainties: [],
};

function requestWithText(text = "Sveiki!", options = {}) {
  const formData = new FormData();
  formData.set("targetLanguage", options.targetLanguage ?? "en");
  formData.set("mode", "text");
  formData.set("variantMode", options.variantMode ?? "initial");
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
  formData.set("variantMode", options.variantMode ?? "initial");
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
  assert.equal(validateTranslationResult({ ...validTranslation, variants: validTranslation.variants.slice(0, 2) }, "en"), false);
  assert.equal(validateTranslationResult({ ...validTranslation, variants: [{ ...validTranslation.variants[0], style: "alternative" }] }, "en", "more"), true);
  assert.equal(validateTranslationFollowup({ answer: "It is a nuance.", uncertain: false, transcription: "" }), true);
  assert.equal(validateTranslationFollowup({ answer: "It is a nuance.", uncertain: false, transcription: "", extra: true }), false);
  assert.equal(translationJsonSchema.additionalProperties, false);
  assert.deepEqual(translationJsonSchema.properties.targetLanguage.enum, ["en", "ru", "lv", "es", "pt", "fr", "de", "it", "pl", "uk", "nl", "ro", "sv", "cs"]);
  assert.equal(translationFollowupJsonSchema.additionalProperties, false);
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
    assert.equal(requests[0].body.input[0].content[0].type, "input_text");
    assert.match(requests[0].body.instructions, /Translate the supplied source material/);
    assert.match(requests[0].body.instructions, /exactly three variants/);
  } finally { globalThis.fetch = previousFetch; }
}));

test("translation route requests alternative variants without changing the schema", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  resetAnalysisChallengeStateForTests();
  const alternatives = {
    ...validTranslation,
    variants: [{ style: "alternative", label: "Alternative 1", translation: "Another clear version.", transcription: "Another klir version." }],
    translation: "Another clear version.",
    transcription: "Another klir version.",
  };
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    if (address.includes("/auth/v1/user")) return Response.json({ id: "translation-more-user", email: "more@example.com", email_confirmed_at: "2026-08-03T10:00:00Z", is_anonymous: false });
    requests.push({ url: address, body: JSON.parse(init.body) });
    return openAiResponse(alternatives);
  };
  try {
    const response = await POST(requestWithText("Labdien!", { userId: "translation-more-user", variantMode: "more" }));
    assert.equal(response.status, 200);
    assert.equal(requests[0].body.max_output_tokens, 2800);
    assert.match(requests[0].body.instructions, /additional alternatives/);
    assert.equal((await response.json()).result.variants[0].style, "alternative");
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

test("translation follow-up answers from the saved translation context", async () => withServerKey(async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  resetAnalysisChallengeStateForTests();
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    if (address.includes("/auth/v1/user")) return Response.json({ id: "translation-followup-user", email: "followup@example.com", email_confirmed_at: "2026-08-03T10:00:00Z", is_anonymous: false });
    if (address.includes("challenges.cloudflare.com")) return Response.json({ success: true, hostname: "localhost", action: "analyze" });
    requests.push({ url: address, body: JSON.parse(init.body) });
    return openAiResponse({ answer: "This wording keeps the original meaning but sounds more natural.", uncertain: false, transcription: "" });
  };
  try {
    const response = await POST_FOLLOWUP(new Request("http://localhost/api/translate/followup", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test.translation-followup-user.signature", "x-forwarded-for": "192.0.2.41" },
      body: JSON.stringify({ targetLanguage: "en", question: "Why is this phrase conversational?", context: "The conversational variant is Here is the translated document.", selectedVariant: "Here is the translated document." }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.answer.uncertain, false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.store, false);
    assert.equal(requests[0].body.text.format.name, "whatnow_translation_followup");
    assert.equal(requests[0].body.reasoning.effort, "low");
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
  assert.match(component, /translation-workspace-grid/);
  assert.match(component, /variantMode/);
  assert.match(component, /api\/translate\/followup/);
  assert.match(component, /translation-transcription/);
  assert.match(component, /\.pdf.*\.docx.*\.odt/);
  assert.match(route, /verifySupabaseRequest/);
  assert.match(route, /checkAnalysisQuota/);
  assert.match(route, /store: false/);
  assert.match(styles, /\.translation-shell/);
  assert.match(styles, /\.translation-workspace-grid/);
  assert.match(styles, /\.translation-followup/);
  assert.match(styles, /grid-template-columns: repeat\(3/);
  assert.match(studio, /initialPrompt/);
});
