import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteTranslationHistory,
  listTranslationHistory,
  saveTranslationHistory,
  TRANSLATION_HISTORY_LIMIT,
  updateTranslationHistory,
} from "../app/translation-history.ts";

function result(text) {
  return {
    schemaVersion: "1.1",
    sourceLanguage: "en",
    targetLanguage: "ru",
    translation: text,
    transcription: "",
    variants: [{ style: "literal", label: "Literal", translation: text, transcription: "", backTranslation: "Back" }],
    notes: [],
    uncertainties: [],
  };
}

function withLocalStorage(run) {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  };
  try { return run(values); } finally { globalThis.window = previousWindow; }
}

test("translation history is client-only, account-scoped, and capped at the latest 10", () => withLocalStorage(() => {
  const account = "account-history-a";
  for (let index = 0; index < TRANSLATION_HISTORY_LIMIT + 2; index += 1) {
    saveTranslationHistory(account, { result: result(`Translation ${index}`), sourceKind: "text", sourcePreview: `Source ${index}` });
  }
  const items = listTranslationHistory(account);
  assert.equal(items.length, 10);
  assert.equal(items[0].result.translation, "Translation 11");
  assert.equal(items.at(-1)?.result.translation, "Translation 2");
  assert.equal(listTranslationHistory("account-history-b").length, 0);
}));

test("translation history updates and deletes entries without storing the full source text", () => withLocalStorage((values) => {
  const account = "account-history-b";
  const source = "x".repeat(500);
  const saved = saveTranslationHistory(account, { result: result("First"), sourceKind: "text", sourcePreview: source });
  assert.ok(saved);
  updateTranslationHistory(account, saved.id, result("Updated"));
  const items = listTranslationHistory(account);
  assert.equal(items[0].result.translation, "Updated");
  assert.equal(items[0].sourcePreview.length, 240);
  const raw = [...values.values()][0];
  assert.ok(!raw.includes(source));
  deleteTranslationHistory(account, saved.id);
  assert.deepEqual(listTranslationHistory(account), []);
}));
