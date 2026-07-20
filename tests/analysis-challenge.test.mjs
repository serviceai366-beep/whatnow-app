import assert from "node:assert/strict";
import test from "node:test";
import { checkAnalysisChallenge, resetAnalysisChallengeStateForTests } from "../app/analysis-challenge.ts";

function request(score) {
  const value = new Request("https://whatnow-app.com/api/analyze", { method: "POST" });
  if (score !== undefined) Object.defineProperty(value, "cf", { value: { botManagement: { score } } });
  return value;
}

test("adaptive protection stays invisible for normal pacing", async () => {
  resetAnalysisChallengeStateForTests();
  const first = await checkAnalysisChallenge({ request: request(), userKey: "normal-user", token: null, now: 1_000 });
  const second = await checkAnalysisChallenge({ request: request(), userKey: "normal-user", token: null, now: 62_000 });
  assert.deepEqual(first, { ok: true, challenged: false });
  assert.deepEqual(second, { ok: true, challenged: false });
});

test("a low Cloudflare bot score requests a one-time challenge", async () => {
  resetAnalysisChallengeStateForTests();
  const result = await checkAnalysisChallenge({ request: request(10), userKey: "low-score-user", token: null, now: 1_000 });
  assert.deepEqual(result, { ok: false, code: "captcha_required" });
});
