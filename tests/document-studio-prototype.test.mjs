import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const studio=await readFile(new URL("../app/document-studio-prototype.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
test("create-edit is a separate authenticated live workspace",()=>{assert.match(page,/productMode === "create"/);assert.match(page,/<DocumentStudioPrototype locale={language} account={account}/);assert.match(studio,/\/api\/document-studio/);assert.match(studio,/getAccessToken/)});
test("guided templates, jurisdiction, readiness, and confirmation are present",()=>{for(const p of [/Residential lease/,/Non-disclosure agreement/,/Birthday invitation/,/Country or legal jurisdiction/,/readiness !== "green"/,/Continue with placeholders/])assert.match(studio,p)});
test("the legal boundary and history/export controls are explicit",()=>{assert.match(studio,/legal validity, enforceability, and suitability are not guaranteed/);assert.match(studio,/latest 10 generated documents/);assert.match(studio,/format=\$\{format\}/);assert.match(studio,/"docx" \| "pdf"/)});
test("existing documents can be attached without storing them in client history",()=>{for(const pattern of [/studio-document-file/,/\.pdf,.jpg,.jpeg,.png,.webp,.txt,.rtf,.docx,.odt/,/form\.append\("file", sourceFile\)/,/setHistory\(\(previous\) => \[data\.document!, \.\.\.previous\]/])assert.match(studio,pattern)});
test("beta is scoped to the create-edit mode",()=>{assert.doesNotMatch(page,/className="beta-badge"/);assert.match(page,/className="mode-beta"/);assert.match(studio,/className="studio-beta-badge"/);assert.match(css,/\.studio-beta-badge/)});
test("document studio exposes its own separate history",()=>{assert.match(studio,/historyButton:/);assert.match(studio,/id="studio-history"/);assert.match(studio,/studio-history-toggle/);assert.match(studio,/setHistory\(data\.documents\)/)});
test("document studio shows elapsed reasoning time and a two-to-three minute estimate",()=>{assert.match(studio,/studio-generation-timer/);assert.match(studio,/formatDuration\(elapsed\)/);assert.match(studio,/Usually about 2–3 minutes/);assert.match(studio,/03:00/)});
test("workspace remains responsive and scrollbars remain visually hidden",()=>{assert.match(css,/\.template-library::-webkit-scrollbar \{ display: none; \}/);assert.match(css,/@media \(max-width: 620px\)/);assert.match(css,/\.studio-draft-workspace \{ grid-template-columns:1fr; \}/)});
test("free accounts are visibly locked and the client supports cancellation",()=>{assert.match(studio,/quota\?\.planCode !== "pro"/);assert.match(studio,/studio-pro-gate/);assert.match(studio,/generationController\.current\?\.abort\(\)/);assert.match(studio,/Stop generation/)});
test("the preparation and document assistants support selected text and fullscreen editing",()=>{for(const pattern of [/method: "PUT"/,/method: "PATCH"/,/window\.getSelection\(\)/,/selectedText/,/assistant-expanded/,/annotations \?\? \[\]/])assert.match(studio,pattern)});
