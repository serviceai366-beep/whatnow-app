import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chatGPTSignInPath, chatGPTSignOutPath } from "../app/auth-paths.ts";

test("builds same-origin ChatGPT sign-in and sign-out paths", () => {
  assert.equal(chatGPTSignInPath("/profile?tab=account"), "/signin-with-chatgpt?return_to=%2Fprofile%3Ftab%3Daccount");
  assert.equal(chatGPTSignOutPath("/"), "/signout-with-chatgpt?return_to=%2F");
});

test("prevents external and reserved authentication return paths", () => {
  assert.equal(chatGPTSignInPath("//attacker.example"), "/signin-with-chatgpt?return_to=%2F");
  assert.equal(chatGPTSignInPath("/callback"), "/signin-with-chatgpt?return_to=%2F");
  assert.equal(chatGPTSignOutPath("https://attacker.example"), "/signout-with-chatgpt?return_to=%2F");
});

test("uses Supabase for Google and passwordless email accounts without shipping provider secrets", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const widget = await readFile(new URL("../app/account-widget.tsx", import.meta.url), "utf8");
  const auth = await readFile(new URL("../app/supabase-auth.ts", import.meta.url), "utf8");
  const config = await readFile(new URL("../app/supabase-config.ts", import.meta.url), "utf8");
  const serverAuth = await readFile(new URL("../app/supabase-server-auth.ts", import.meta.url), "utf8");
  const turnstile = await readFile(new URL("../app/turnstile.tsx", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

  assert.match(page, /<AccountWidget/);
  assert.match(widget, /startGoogleSignIn/);
  assert.match(widget, /sendEmailSignInLink/);
  assert.match(auth, /flowType:\s*"pkce"/);
  assert.match(auth, /signInWithOAuth/);
  assert.match(auth, /provider:\s*"google"/);
  assert.match(auth, /scopes:\s*"openid email profile"/);
  assert.match(auth, /signInWithOtp/);
  assert.match(auth, /captchaToken/);
  assert.match(widget, /TurnstileWidget/);
  assert.match(turnstile, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(auth, /getUser\(\)/);
  assert.match(auth, /new URL\("\/", window\.location\.origin\)/);
  assert.match(auth, /history\.replaceState/);
  assert.match(serverAuth, /\/auth\/v1\/user/);
  assert.match(serverAuth, /email_confirmed_at/);
  assert.match(packageJson, /@supabase\/supabase-js/);
  assert.match(config, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(auth, /atob\(|sessionFromLocation|access_token.*location\.hash/);
  assert.doesNotMatch(`${page}\n${widget}\n${auth}\n${config}\n${serverAuth}`, /GOCSPX|CLIENT_SECRET|service_role/);
  assert.doesNotMatch(auth, /accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com/);
});
