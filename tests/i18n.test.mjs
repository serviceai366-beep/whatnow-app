import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorKeyByCode, translations } from "../app/i18n.ts";
import { profileLanguages } from "../app/profile-types.ts";

test("all interface languages contain the same complete key set", () => {
  const baseline = Object.keys(translations.ru).sort();
  for (const language of profileLanguages) {
    assert.deepEqual(Object.keys(translations[language]).sort(), baseline);
    for (const [key, value] of Object.entries(translations[language])) {
      assert.equal(typeof value, "string", `${language}.${key} must be a string`);
      assert.notEqual(value.trim(), "", `${language}.${key} must not be empty`);
    }
  }
});

test("translations preserve Cyrillic, Latvian diacritics, and the approved English slogan", () => {
  assert.match(translations.ru.heroTitle, /[А-Яа-яЁё]/);
  assert.match(translations.lv.heroTitle, /[āčēģīķļņšūž]/i);
  assert.equal(translations.en.heroTitle, "Don’t just translate the document. Know what to do next.");
});

test("every server error code maps to an existing localized message", () => {
  for (const key of Object.values(apiErrorKeyByCode)) {
    for (const language of profileLanguages) {
      assert.equal(typeof translations[language][key], "string");
      assert.ok(translations[language][key].length > 0);
    }
  }
});
