import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("quota endpoint requires a verified account and returns uncached live data", async () => {
  const route = await readFile(new URL("../app/api/quota/route.ts", import.meta.url), "utf8");
  assert.match(route, /verifySupabaseRequest\(request\)/);
  assert.match(route, /activePlanForUser\(auth\.user\.id(?:,|\))/);
  assert.match(route, /readAnalysisQuota\(\{ userKey: auth\.user\.id, planCode \}\)/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /quota\.backend === "unavailable"/);
  assert.doesNotMatch(route, /OPENAI_API_KEY|api\.openai\.com/);
});
