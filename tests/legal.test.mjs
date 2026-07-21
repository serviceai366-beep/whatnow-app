import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { hasCurrentLegalAcceptance, legalAcceptanceMetadata, PRIVACY_VERSION, TERMS_VERSION } from "../app/legal.ts";

test("legal pages describe the real service and are linked from registration", async () => {
  const privacy = await readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8");
  const terms = await readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8");
  const widget = await readFile(new URL("../app/account-widget.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  for (const provider of ["Supabase", "OpenAI", "Cloudflare", "Resend", "Google"]) {
    assert.match(privacy, new RegExp(provider));
  }
  assert.match(privacy, /latest 10 analyses/);
  assert.match(privacy, /Latvian Data State Inspectorate/);
  assert.match(privacy, /not responsible or liable for decisions, losses, disputes/);
  assert.match(privacy, /created, edited, reviewed, or explained by the service/);
  assert.match(terms, /informational assistance, not legal, medical, financial/);
  assert.match(terms, /Reminders are a convenience and are not guaranteed/);
  assert.match(widget, /create-account/);
  assert.match(widget, /legalAccepted/);
  assert.match(widget, /href="\/terms"/);
  assert.match(widget, /href="\/privacy"/);
  assert.match(page, /account\.requiresLegalAcceptance/);
  assert.match(page, /Privacy Policy/);
  assert.match(page, /Terms of Service/);
});

test("current legal acceptance is versioned and rejects stale or incomplete metadata", () => {
  const current = legalAcceptanceMetadata("2026-07-17T12:00:00.000Z");
  assert.equal(current.terms_version, TERMS_VERSION);
  assert.equal(current.privacy_version, PRIVACY_VERSION);
  assert.equal(hasCurrentLegalAcceptance(current), true);
  assert.equal(hasCurrentLegalAcceptance({ ...current, terms_version: "old" }), false);
  assert.equal(hasCurrentLegalAcceptance({ terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION }), false);
});

test("new accounts are blocked server-side until the current terms are accepted", async () => {
  const auth = await readFile(new URL("../app/supabase-auth.ts", import.meta.url), "utf8");
  const serverAuth = await readFile(new URL("../app/supabase-server-auth.ts", import.meta.url), "utf8");

  assert.match(auth, /shouldCreateUser:\s*mode === "create-account"/);
  assert.match(auth, /data:\s*mode === "create-account" \? legalAcceptanceMetadata\(\) : undefined/);
  assert.match(auth, /PENDING_LEGAL_ACCEPTANCE_KEY/);
  assert.match(serverAuth, /legal_acceptance_required/);
  assert.match(serverAuth, /createdAt >= Date\.parse\(LEGAL_EFFECTIVE_AT\)/);
  assert.match(serverAuth, /hasCurrentLegalAcceptance\(metadata\)/);
});
