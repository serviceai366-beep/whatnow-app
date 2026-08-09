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
  assert.match(page, /void persistAnalysisHistory\(payload\.result, requestMode, analysisLanguage, accessToken\)/);
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
  assert.match(page, /limit\.scope === "user_window"/);
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
  assert.match(widget, /quotaEstimated/);
  assert.match(widget, /quotaAllowance/);
  assert.match(widget, /AbortController/);
  assert.match(page, /response\.headers\.has\("X-RateLimit-Limit-24h"\)/);
  assert.match(page, /setQuotaRefreshKey\(\(current\) => current \+ 1\)/);
  assert.match(css, /\.quota-row progress/);
  assert.match(css, /:root\[data-theme="dark"\]/);
});

test("attached documents use a compact safe non-iframe preview", async () => {
  const [page] = await files;
  assert.match(page, /\.txt,.rtf,.docx,.odt/);
  assert.match(page, /className="composer-attachment"/);
  assert.match(page, /className="composer-attachment-thumb"/);
  assert.match(page, /className="composer-attachment-type"/);
  assert.doesNotMatch(page, /<iframe/);
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

test("translated header labels never collapse into individual letters", async () => {
  const [, , css] = await files;
  assert.match(css, /\.header-tool-button \{[\s\S]*white-space: nowrap/);
  assert.match(css, /@media \(min-width: 721px\) and \(max-width: 1040px\)/);
  assert.doesNotMatch(css, /@container \(max-width: 1260px\)/);
  assert.match(css, /\.header-nav-actions \.header-tool-button,[\s\S]*\.x-account-link/);
  assert.match(css, /\.site-header\.compact \{[\s\S]*width: min\(1180px, calc\(100% - 24px\)\)/);
  assert.match(css, /\.site-header:not\(\.compact\) \.header-tool-button[\s\S]*font-size: 13px/);
});

test("mobile header controls hide overflowing labels after desktop overrides", async () => {
  const [, , css] = await files;
  const mobileOverride = css.indexOf("/* Mobile header: keep every navigation label");
  const desktopGlassOverride = css.lastIndexOf(".site-header:not(.compact) .header-tool-button {");
  assert.ok(mobileOverride > desktopGlassOverride);
  assert.match(css.slice(mobileOverride), /\.site-header:not\(\.compact\) \.header-tool-button,[\s\S]*font-size: 0/);
  assert.match(css.slice(mobileOverride), /overflow: hidden/);
  assert.match(css.slice(mobileOverride), /line-height: 0/);
  assert.match(css.slice(mobileOverride), /@media \(max-width: 430px\)[\s\S]*flex-basis: 40px/);
});

test("the top brand states the current Free or Pro plan", async () => {
  const [page, accountWidget] = await files;
  assert.match(page, /headerPlan === "pro" \? "WhatNow Pro" : "WhatNow Free"/);
  assert.match(page, /onPlanChange=\{setHeaderPlan\}/);
  assert.match(accountWidget, /onPlanChange\?\.\(payload\.quota\.planCode === "pro" \? "pro" : "free"\)/);
});
