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

test("uses the Sites-owned ChatGPT routes and does not ship fake external OAuth", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /\/signin-with-chatgpt\?return_to=%2F/);
  assert.match(source, /\/signout-with-chatgpt\?return_to=%2F/);
  assert.doesNotMatch(source, /accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com/);
});
