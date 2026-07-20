import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { supportedLanguages } from "../app/analysis-schema.ts";
import { interfaceLanguageOptions, responseLanguageOptions } from "../app/language-options.ts";
import { profileLanguages } from "../app/profile-types.ts";

test("offers a broad European and South American response-language set", () => {
  assert.deepEqual(responseLanguageOptions.map((option) => option.code), [...supportedLanguages]);
  for (const code of ["es", "pt", "fr", "de", "it", "pl", "uk", "nl", "ro", "sv", "cs"]) {
    assert.ok(supportedLanguages.includes(code), `${code} should be available for explanations`);
  }
  assert.deepEqual(interfaceLanguageOptions.map((option) => option.code), [...profileLanguages]);
});

test("the home screen exposes a searchable, scrollable response-language picker", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /language-picker-search/);
  assert.match(page, /responseLanguageOptions/);
  assert.match(page, /role="listbox"/);
  assert.match(css, /\.language-picker-options[^}]*overflow-y:\s*auto/);
  assert.match(css, /@media[\s\S]*\.language-picker-menu\s*\{\s*position:\s*fixed/);
});
