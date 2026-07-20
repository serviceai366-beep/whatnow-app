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
  assert.match(page, /if \(challengeToken\) formData\.set\("turnstileToken", challengeToken\)/);
  assert.match(page, /disabled=\{isAnalyzing\}/);
  assert.doesNotMatch(page, /disabled=\{isAnalyzing \|\| !captchaToken\}/);
  assert.match(page, /captchaChallengeOpen/);
  assert.match(page, /<SecurityChallenge/);
});

test("successful analyses are saved automatically and the UI offers a retry on failure", async () => {
  const [page] = await files;
  assert.match(page, /void persistAnalysisHistory\(payload\.result, inputMode, analysisLanguage, accessToken\)/);
  assert.match(page, /Automatically saved to history/);
  assert.match(page, /Retry saving/);
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

test("profile offers themes and displays live server-backed quota counters", async () => {
  const [page, widget, css] = await files;
  assert.match(page, /localStorage\.getItem\("whatnow\.theme"\)/);
  assert.match(page, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(widget, /aria-pressed=\{theme === "light"\}/);
  assert.match(widget, /aria-pressed=\{theme === "dark"\}/);
  assert.match(widget, /fetch\("\/api\/quota"/);
  assert.match(widget, /quota\.daily/);
  assert.match(widget, /quota\.weekly/);
  assert.match(widget, /item\.remaining\}\/\{item\.limit/);
  assert.match(page, /response\.headers\.has\("X-RateLimit-Limit-24h"\)/);
  assert.match(page, /setQuotaRefreshKey\(\(current\) => current \+ 1\)/);
  assert.match(css, /\.quota-row progress/);
  assert.match(css, /:root\[data-theme="dark"\]/);
});

test("rich text files use a safe non-iframe preview", async () => {
  const [page] = await files;
  assert.match(page, /\.txt,.rtf,.docx,.odt/);
  assert.match(page, /document\.kind === "pdf" \? \(/);
  assert.match(page, /document-preview-message/);
  assert.match(page, /t\.officePreviewNote/);
});

test("adaptive CAPTCHA and every modal stay inside small dynamic viewports", async () => {
  const [page, , css] = await files;
  assert.doesNotMatch(page, /className=\{`captcha-box\$\{captchaError/);
  assert.match(page, /security-challenge-backdrop/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /overscroll-behavior: contain/);
  assert.match(css, /max-height: 96dvh/);
  assert.match(css, /\.brand > span \{ display: none; \}/);
  assert.match(css, /\.storage-toast[\s\S]*bottom:/);
});

test("header tools use a unified graphical icon system instead of text symbols", async () => {
  const [page, , css] = await files;
  for (const kind of ["about", "support", "calendar", "space"]) {
    assert.match(page, new RegExp(`<ToolIcon kind="${kind}"`));
    assert.match(css, new RegExp(`\\.tool-icon-${kind}`));
  }
  assert.match(page, /function ToolIcon/);
  assert.doesNotMatch(page, /header-tool-button"[^\r\n]*aria-hidden="true">[i?□◇]<\/span>/);
  assert.match(page, /data-tooltip=\{w\.info\}/);
  assert.match(page, /data-tooltip=\{w\.space\}/);
  assert.match(css, /content: attr\(data-tooltip\)/);
  assert.match(css, /@media \(hover: hover\) and \(min-width: 721px\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.tool-icon/);
});
