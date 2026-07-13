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
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);

  const html = await response.text();
  assert.match(html, /<title>WhatNow\? — поймите, что делать дальше<\/title>/i);
  assert.match(html, /Не просто переводи документ/);
  assert.match(html, /Проанализировать документ/);
  assert.match(html, /PDF, JPG, PNG или WEBP/);
  assert.match(html, /Как обрабатывается документ/);
  assert.match(html, /не заменяет юриста, врача/);
  assert.match(html, /type="file"/);
  assert.match(html, /accept="application\/pdf,image\/jpeg,image\/png,image\/webp/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("removes the disposable starter preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /WhatNow\?/);
  assert.match(page, /useState/);
  assert.match(page, /AnalysisResultView/);
  assert.match(page, /t\.resultTitle/);
  assert.match(page, /t\.importantFragments/);
  assert.match(page, /t\.copyReply/);
  assert.match(page, /t\.analyzeAnother/);
  assert.match(layout, /lang="ru"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});
