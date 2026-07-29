import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const widget = await readFile(new URL("../app/account-widget.tsx", import.meta.url), "utf8");
const auth = await readFile(new URL("../app/supabase-auth.ts", import.meta.url), "utf8");

test("new account creation requires accepted legal terms and a fresh bot-protection token", () => {
  assert.match(widget, /!authCaptchaToken \|\| \(authMode === "create-account" && !legalAccepted\)/);
  assert.match(widget, /TurnstileWidget action="account-create"/);
  assert.match(widget, /TurnstileWidget action="account-login"/);
  assert.equal((widget.match(/appearance="always"/g) ?? []).length, 2);
  assert.match(widget, /disabled=\{googleLoading \|\| !authCaptchaToken \|\| \(authMode === "create-account" && !legalAccepted\)\}/);
  assert.match(widget, /createRequirements/);
});

test("Google account creation forwards the CAPTCHA token to Supabase", () => {
  assert.match(auth, /startGoogleSignIn\(mode: AccountAccessMode, acceptedLegalTerms: boolean, captchaToken: string \| null\)/);
  assert.match(auth, /signInWithOAuth\([\s\S]*?captchaToken: captchaToken \?\? undefined/);
  assert.doesNotMatch(widget, /email-sign-in/);
  assert.doesNotMatch(widget, /sendEmailSignInLink/);
});
