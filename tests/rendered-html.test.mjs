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
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(self\)/);
  assert.match(response.headers.get("content-security-policy") ?? "", /object-src 'none'/);
  assert.match(response.headers.get("content-security-policy") ?? "", /vrcbgpmevieccopqembx\.supabase\.co/);
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);

  const html = await response.text();
  assert.match(html, /<title>WhatNow\? — know what to do next<\/title>/i);
  assert.doesNotMatch(html, /Don’t just translate the document/);
  assert.match(html, /Analyze document/);
  assert.match(html, /PDF, photo, TXT, RTF, DOCX, or ODT/);
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
  assert.match(page, /setInputMode\("file"\)/, "A pasted screenshot should continue through the secure file-analysis flow.");
  assert.match(page, /pasteScreenshotHint/);
  assert.match(page, /className="info-panel"/);
  assert.doesNotMatch(page, /<section className="benefits"/);
  assert.doesNotMatch(page, /className="privacy-notice"/);
  assert.doesNotMatch(page, /className="professional-notice"/);
  assert.match(styles, /\.hero \{[\s\S]*width: min\(820px/);
  assert.match(styles, /\.info-detail-grid/);
});

test("offers a local document scanner with crop, use, and save actions", async () => {
  const [page, studio, scanner, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/document-studio-prototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/document-scanner.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /DocumentScanner/);
  assert.match(page, /setScannerOpen\(true\)/);
  assert.match(page, /text-scan-button/);
  assert.match(studio, /onOpenScanner/);
  assert.match(studio, /scanDocument/);
  assert.match(scanner, /getUserMedia/);
  assert.match(scanner, /detectDocumentCorners/);
  assert.match(scanner, /warpDocument/);
  assert.match(scanner, /navigator\.share/);
  assert.match(scanner, /Drag the four corners/);
  assert.match(scanner, /@techstark\/opencv-js/);
  assert.match(scanner, /cv\.Canny/);
  assert.match(scanner, /cv\.findContours/);
  assert.match(scanner, /cv\.approxPolyDP/);
  assert.match(scanner, /scoreQuadrilateral/);
  assert.match(scanner, /paperColorMask/);
  assert.match(scanner, /makeRefinedScan/);
  assert.match(scanner, /manual cropping usable/);
  assert.match(worker, /media-src 'self' blob:/);
  assert.match(worker, /camera=\(self\)/);
});
