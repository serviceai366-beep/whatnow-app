import assert from "node:assert/strict";
import test from "node:test";
import {
  analysisCostUnits,
  checkAnalysisQuota,
  createMemoryQuotaStoreForTests,
} from "../app/usage-control.ts";

test("assigns conservative cost weights to expensive document types", () => {
  assert.equal(analysisCostUnits("text"), 1);
  assert.equal(analysisCostUnits("image"), 2);
  assert.equal(analysisCostUnits("pdf"), 3);
});

test("enforces the per-client daily limit across repeated requests", async () => {
  const store = createMemoryQuotaStoreForTests();
  const now = Date.UTC(2026, 6, 13, 12);
  const decisions = [];
  for (let index = 0; index < 9; index += 1) {
    decisions.push(await checkAnalysisQuota({ clientKey: "same-client", costKind: "text", now, store }));
  }
  assert.equal(decisions.slice(0, 8).every((decision) => decision.allowed), true);
  assert.equal(decisions[8].allowed, false);
  assert.equal(decisions[8].scope, "client_daily");
  assert.ok(decisions[8].retryAfterSeconds > 0);
});

test("global daily limit cannot be bypassed by rotating client addresses", async () => {
  const store = createMemoryQuotaStoreForTests();
  const now = Date.UTC(2026, 6, 13, 12);
  let last;
  for (let index = 0; index < 31; index += 1) {
    last = await checkAnalysisQuota({ clientKey: `rotating-client-${index}`, costKind: "text", now, store });
  }
  assert.equal(last.allowed, false);
  assert.equal(last.scope, "global_daily");
});

test("weighted global cost budget stops expensive PDFs before request count limit", async () => {
  const store = createMemoryQuotaStoreForTests();
  const now = Date.UTC(2026, 6, 13, 12);
  let last;
  for (let index = 0; index < 21; index += 1) {
    last = await checkAnalysisQuota({ clientKey: `pdf-client-${index}`, costKind: "pdf", now, store });
  }
  assert.equal(last.allowed, false);
  assert.equal(last.scope, "global_cost");
});

test("daily quotas reset at the next UTC day", async () => {
  const store = createMemoryQuotaStoreForTests();
  const firstDay = Date.UTC(2026, 6, 13, 23, 59);
  for (let index = 0; index < 8; index += 1) {
    assert.equal((await checkAnalysisQuota({ clientKey: "daily-client", costKind: "text", now: firstDay, store })).allowed, true);
  }
  assert.equal((await checkAnalysisQuota({ clientKey: "daily-client", costKind: "text", now: firstDay, store })).allowed, false);
  assert.equal((await checkAnalysisQuota({ clientKey: "daily-client", costKind: "text", now: Date.UTC(2026, 6, 14, 0, 1), store })).allowed, true);
});
