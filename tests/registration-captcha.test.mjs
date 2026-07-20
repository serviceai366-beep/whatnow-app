import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const widget = await readFile(new URL("../app/account-widget.tsx", import.meta.url), "utf8");
const auth = await readFile(new URL("../app/supabase-auth.ts", import.meta.url), "utf8");

test("new account creation requires accepted legal terms and a fresh bot-protection token", () => {
  assert.match(widget, /authMode === "create-account" && \(!legalAccepted \|\| !authCaptchaToken\)/);
  assert.match(widget, /TurnstileWidget action="account-create"/);
  assert.match(widget, /disabled=\{googleLoading \|\| \(authMode === "create-account" && \(!legalAccepted \|\| !authCaptchaToken\)\)\}/);
  assert.match(widget, /createRequirements/);
});

test("Google and email account creation forward the CAPTCHA token to Supabase", () => {
  assert.match(auth, /startGoogleSignIn\(mode: AccountAccessMode, acceptedLegalTerms: boolean, captchaToken: string \| null\)/);
  assert.match(auth, /mode === "create-account" && !captchaToken/);
  assert.match(auth, /signInWithOAuth\([\s\S]*?captchaToken: captchaToken \?\? undefined/);
  assert.match(auth, /signInWithOtp\([\s\S]*?captchaToken: captchaToken \?\? undefined/);
});
