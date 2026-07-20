import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("Liquid Glass visual tokens are applied to functional interface layers", () => {
  assert.match(styles, /--glass-regular:/);
  assert.match(styles, /--glass-strong:/);
  assert.match(styles, /--liquid-ease:/);
  assert.match(styles, /\.site-header\s*\{[\s\S]*?backdrop-filter:\s*none/);
  assert.match(styles, /\.site-header::after\s*\{[\s\S]*?backdrop-filter:\s*saturate\(175%\) blur\(26px\)/);
  assert.match(styles, /\.auth-dialog,[\s\S]*?\.history-panel\s*\{[\s\S]*?backdrop-filter:\s*saturate\(180%\) blur\(34px\)/);
  assert.match(styles, /\.language-picker-menu,[\s\S]*?\.limit-toast\s*\{[\s\S]*?animation:\s*liquid-pop/);
});

test("mobile glass navigation remains compact and preserves every account action", () => {
  assert.match(styles, /@media \(max-width:\s*720px\)[\s\S]*?\.site-header\s*\{[\s\S]*?width:\s*calc\(100% - 16px\)/);
  assert.match(styles, /\.header-tool-button\s*\{[^}]*flex:\s*0 0 42px/);
  assert.match(styles, /\.account-control\s*\{[^}]*flex:\s*0 0 42px/);
  assert.match(styles, /\.account-control \.account-details, \.account-control \.account-chevron\s*\{\s*display:\s*none/);
  assert.match(styles, /\.hub-panel-header\s*\{\s*position:\s*relative/);
  assert.match(styles, /\.hub-tabs, \.calendar-toolbar\s*\{\s*top:\s*0/);
  assert.match(styles, /\.analyzer-card\s*\{[\s\S]*?animation:\s*liquid-fade/);
});

test("glass effects degrade safely for accessibility and browser support", () => {
  assert.match(styles, /prefers-reduced-transparency:\s*reduce/);
  assert.match(styles, /@supports not \(\(backdrop-filter:/);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none/);
  assert.match(styles, /body\s*\{[\s\S]*?overflow-x:\s*clip/);
});

test("scrollable surfaces keep scrolling without displaying browser scrollbar chrome", () => {
  assert.match(styles, /html,\s*\nbody,\s*\n\*\s*\{[\s\S]*?scrollbar-width:\s*none/);
  assert.match(styles, /\*::\-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/);
  assert.match(styles, /\.language-picker-options[^}]*overflow-y:\s*auto/);
  assert.match(styles, /\.user-hub, \.calendar-panel[^}]*overflow:\s*auto/);
});
