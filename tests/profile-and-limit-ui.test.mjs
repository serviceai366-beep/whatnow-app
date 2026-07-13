import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/account-widget.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("analysis is gated by a verified account and sends the fresh bearer token", async () => {
  const [page, widget] = await files;
  assert.match(page, /if \(!account\)/);
  assert.match(page, /await getAccessToken\(\)/);
  assert.match(page, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(page, /setAuthOpen\(true\)/);
  assert.match(page, /open=\{authOpen\} onOpenChange=\{setAuthOpen\}/);
  assert.match(widget, /open: boolean/);
  assert.match(widget, /onOpenChange: \(open: boolean\) => void/);
});

test("switching accounts clears cached and visible analysis data", async () => {
  const [page] = await files;
  assert.match(page, /accountIdRef\.current !== nextId/);
  assert.match(page, /lastAnalysisRef\.current = null/);
  assert.match(page, /setAnalysis\(null\)/);
  assert.match(page, /setShowResult\(false\)/);
  assert.match(page, /setSelectedDocument\(null\)/);
  assert.match(page, /setDocumentText\(""\)/);
  assert.match(page, /setSavedHistoryId\(null\)/);
});

test("limit notice is localized, accessible, dismissible, and uses server reset time", async () => {
  const [page, , css] = await files;
  for (const text of ["Лимит анализов исчерпан", "Analīžu limits ir sasniegts", "Analysis limit reached"]) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /role="alert" aria-live="assertive"/);
  assert.match(page, /data\.resetAt - now/);
  assert.match(page, /Intl\.DateTimeFormat/);
  assert.match(page, /window\.setInterval/);
  assert.match(page, /aria-label=\{t\.close\}/);
  assert.match(css, /\.limit-toast \{/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.limit-toast/);
});

test("profile offers persistent light and dark themes with accessible controls", async () => {
  const [page, widget, css] = await files;
  assert.match(page, /localStorage\.getItem\("whatnow\.theme"\)/);
  assert.match(page, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(widget, /aria-pressed=\{theme === "light"\}/);
  assert.match(widget, /aria-pressed=\{theme === "dark"\}/);
  assert.match(widget, /3 анализа за 24 часа · 10 за 7 дней/);
  assert.match(css, /:root\[data-theme="dark"\]/);
});

test("rich text files use a safe non-iframe preview", async () => {
  const [page] = await files;
  assert.match(page, /\.txt,.rtf,.docx,.odt/);
  assert.match(page, /document\.kind === "pdf" \? \(/);
  assert.match(page, /document-preview-message/);
  assert.match(page, /t\.officePreviewNote/);
});
