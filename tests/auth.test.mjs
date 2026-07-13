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

  assert.match(page, /<AccountWidget/);
  assert.match(widget, /startGoogleSignIn/);
  assert.match(widget, /sendEmailSignInLink/);
  assert.match(auth, /\/auth\/v1\/authorize/);
  assert.match(auth, /searchParams\.set\("provider", "google"\)/);
  assert.match(auth, /\/auth\/v1\/otp/);
  assert.match(config, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(`${page}\n${widget}\n${auth}\n${config}`, /GOCSPX|CLIENT_SECRET|service_role/);
  assert.doesNotMatch(auth, /accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com/);
});
