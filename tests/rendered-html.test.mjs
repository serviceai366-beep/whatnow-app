import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the WhatNow prototype", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  assert.match(response.headers.get("content-security-policy") ?? "", /object-src 'none'/);
  assert.match(response.headers.get("content-security-policy") ?? "", /vrcbgpmevieccopqembx\.supabase\.co/);
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);

  const html = await response.text();
  assert.match(html, /<title>WhatNow\? — know what to do next<\/title>/i);
  assert.doesNotMatch(html, /Don’t just translate the document/);
  assert.match(html, /Analyze text/);
  assert.match(html, /Attach a file/);
  assert.match(html, /Text, photo, or document · Ctrl\+Enter/);
  assert.match(html, /Private processing · Check important decisions/);
  assert.doesNotMatch(html, /How the document is handled/);
  assert.doesNotMatch(html, /does not replace a lawyer, doctor/);
  assert.match(html, /type="file"/);
  assert.match(html, /accept="application\/pdf,image\/jpeg,image\/png,image\/webp,text\/plain/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("removes the disposable starter preview", async () => {
  const [page, layout, accountWidget, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account-widget.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /WhatNow\?/);
  assert.match(page, /useState/);
  assert.match(page, /AnalysisResultView/);
  assert.match(page, /t\.resultTitle/);
  assert.match(page, /t\.importantFragments/);
  assert.match(page, /t\.copyReply/);
  assert.match(page, /t\.analyzeAnother/);
  assert.match(layout, /lang="en"/);
  assert.match(page, /src="\/whatnow-logo\.jpg"/);
  assert.match(accountWidget, /src="\/whatnow-logo\.jpg"/);
  assert.match(layout, /whatnow-logo\.jpg/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});

test("keeps the home screen focused and moves explanatory content into the information panel", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /<InfoPanel open=\{infoOpen\}/);
  assert.match(page, /className="privacy-shortcut"/);
  assert.match(page, /const handleTextPaste/);
  assert.match(page, /onPaste=\{handleTextPaste\}/);
  assert.match(page, /image\/jpeg/, "Clipboard screenshots should use the same validated image formats as uploads.");
  assert.match(page, /selectDocument\(file\)/, "A pasted screenshot should continue through the secure file-analysis flow.");
  assert.match(page, /className="attachment-button"/);
  assert.match(page, /className={`document-composer/);
  assert.match(page, /className="info-panel"/);
  assert.doesNotMatch(page, /<section className="benefits"/);
  assert.doesNotMatch(page, /className="privacy-notice"/);
  assert.doesNotMatch(page, /className="professional-notice"/);
  assert.match(styles, /\.hero \{[\s\S]*width: min\(820px/);
  assert.match(styles, /\.info-detail-grid/);
});

test("removes the document scanner and camera access", async () => {
  const [page, studio, i18n, styles, worker, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/document-studio-prototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/i18n.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /DocumentScanner|scannerOpen|onOpenScanner|scanDocument|text-scan-button/);
  assert.doesNotMatch(studio, /onOpenScanner|scanDocument|studio-file-scan/);
  assert.doesNotMatch(i18n, /scanDocument|Сканировать камерой|Skenēt ar kameru/);
  assert.doesNotMatch(styles, /document-scanner|scanner-|scan-button|text-scan-button|studio-file-scan/);
  assert.match(worker, /camera=\(\)/);
  assert.doesNotMatch(worker, /camera=\(self\)/);
  assert.doesNotMatch(packageJson, /@techstark\/opencv-js/);
  await assert.rejects(access(new URL("../app/document-scanner.tsx", templateRoot)));
  assert.match(worker, /media-src 'self' blob:/);
});
