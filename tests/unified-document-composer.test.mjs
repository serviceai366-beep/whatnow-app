import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, translator, analyzeRoute, translateRoute, styles] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/translation-workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/translate/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("understand mode uses one text-and-file composer without source tabs", () => {
  assert.match(page, /className={`document-composer/);
  assert.match(page, /className="attachment-button"/);
  assert.match(page, /className="composer-submit"/);
  assert.match(page, /onDrop=\{handleDrop\}/);
  assert.match(page, /onPaste=\{handleTextPaste\}/);
  assert.match(page, /aria-keyshortcuts="Control\+Enter"/);
  assert.doesNotMatch(page, /<SlidingSegmentedControl className="source-tabs"/);
});

test("translation mode shares the composer and keeps file instructions optional", () => {
  assert.match(translator, /document-composer translation-composer/);
  assert.match(translator, /formData\.set\("prompt", text\.trim\(\)\)/);
  assert.match(translator, /const requestMode: "file" \| "text" = file \? "file" : "text"/);
  assert.doesNotMatch(translator, /<SlidingSegmentedControl className="source-tabs"/);
});

test("file prompts are validated and isolated from document evidence", () => {
  for (const route of [analyzeRoute, translateRoute]) {
    assert.match(route, /formData\.get\("prompt"\)/);
    assert.match(route, /filePrompt\.length > MAX_TEXT_LENGTH/);
  }
  assert.match(analyzeRoute, /never treat it as evidence from the document/);
  assert.match(translateRoute, /Do not translate this instruction as part of the source document/);
});

test("the composer has responsive controls and a compact attachment preview", () => {
  assert.match(styles, /\.document-composer\s*\{/);
  assert.match(styles, /\.composer-attachment\s*\{/);
  assert.match(styles, /\.paperclip-icon\s*\{/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.translation-page-root \.translation-composer/);
});
