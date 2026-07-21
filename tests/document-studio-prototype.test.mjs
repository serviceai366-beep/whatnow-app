import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const studio=await readFile(new URL("../app/document-studio-prototype.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
test("create-edit is a separate authenticated live workspace",()=>{assert.match(page,/productMode === "create"/);assert.match(page,/<DocumentStudioPrototype locale={language} account={account}/);assert.match(studio,/\/api\/document-studio/);assert.match(studio,/getAccessToken/)});
test("guided templates, jurisdiction, readiness, and confirmation are present",()=>{for(const p of [/Residential lease/,/Non-disclosure agreement/,/Birthday invitation/,/Country or legal jurisdiction/,/readiness!=="green"/,/Continue as is/])assert.match(studio,p)});
test("the legal boundary and history/export controls are explicit",()=>{assert.match(studio,/not guaranteed to be complete, legally valid, enforceable/);assert.match(studio,/latest 10 generated documents/);assert.match(studio,/format=\$\{format\}/);assert.match(studio,/"docx"\|"pdf"/)});
test("existing documents can be attached without storing them in client history",()=>{for(const pattern of [/studio-document-file/,/\.pdf,.jpg,.jpeg,.png,.webp,.txt,.rtf,.docx,.odt/,/form\.append\("file",sourceFile\)/,/setHistory\(x=>\[d\.document!,\.\.\.x\]/])assert.match(studio,pattern)});
test("the application visibly identifies the beta period",()=>{assert.match(page,/className="beta-badge"/);assert.match(page,/Beta testing/);assert.match(css,/\.beta-badge/)});
test("workspace remains responsive and scrollbars remain visually hidden",()=>{assert.match(css,/\.template-library::-webkit-scrollbar \{ display: none; \}/);assert.match(css,/@media \(max-width: 620px\)/);assert.match(css,/\.studio-workspace,\.studio-draft-layout \{ grid-template-columns:1fr; \}/)});
