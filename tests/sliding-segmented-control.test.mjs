import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [component, page, translator, studio, account, hub, styles] = await Promise.all([
  readFile(new URL("../app/sliding-segmented-control.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/translation-workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/document-studio-prototype.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/account-widget.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/user-hub.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("linked mode controls share one horizontal mouse and touch slider", () => {
  assert.match(component, /setPointerCapture/);
  assert.match(component, /releasePointerCapture/);
  assert.match(component, /event\.clientX - drag\.startX/);
  assert.match(component, /nearest\.click\(\)/);
  assert.match(styles, /touch-action:\s*pan-y/);
  assert.match(styles, /translate3d\(var\(--segment-x\), var\(--segment-y\), 0\)/);
  assert.match(styles, /cubic-bezier\(\.2,\.9,\.25,1\)/);
});

test("the slider is limited to related controls and leaves pinning separate", () => {
  assert.match(page, /className="product-mode-segments"/);
  assert.match(page, /<\/SlidingSegmentedControl>\s*\n\s*<button type="button" className={`mode-pin-button/);
  assert.match(translator, /className="source-tabs"/);
  assert.match(translator, /className="translation-variant-tabs"/);
  assert.match(studio, /className="studio-workflow-switch"/);
  assert.match(studio, /className="studio-action-switch"/);
  assert.match(account, /className="auth-mode-switch"/);
  assert.match(account, /className="theme-switch"/);
  assert.match(hub, /className="hub-tabs"/);
  assert.doesNotMatch(page, /SlidingSegmentedControl[^>]+header-actions/);
});

test("translation mode keeps the three segments wide on mobile", () => {
  assert.match(styles, /\.product-mode-switch\.translate-mode\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) 30px;/);
  assert.match(styles, /\.product-mode-segments\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
});
