import assert from "node:assert/strict";
import test from "node:test";
import {
  analysisCostUnits,
  checkAnalysisQuota,
  createMemoryQuotaStoreForTests,
} from "../app/usage-control.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

async function consume({ store, userKey, now, costKind = "text" }) {
  return checkAnalysisQuota({ userKey, costKind, now, store });
}

function restoreEnvironment(previous) {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("assigns conservative cost weights to every accepted input kind", () => {
  assert.equal(analysisCostUnits("text"), 1);
  assert.equal(analysisCostUnits("image"), 2);
  assert.equal(analysisCostUnits("document"), 2);
  assert.equal(analysisCostUnits("pdf"), 3);
});

test("allows three requests per rolling 24 hours and rejects the fourth", async () => {
  const store = createMemoryQuotaStoreForTests();
  const now = Date.UTC(2026, 6, 13, 13, 37);

  for (let index = 0; index < 3; index += 1) {
    const decision = await consume({ store, userKey: "daily-user", now });
    assert.equal(decision.allowed, true);
    assert.equal(decision.scope, null);
    assert.equal(decision.daily.remaining, 2 - index);
  }

  const blocked = await consume({ store, userKey: "daily-user", now });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, "user_24h");
  assert.equal(blocked.limit, 3);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.daily.remaining, 0);
  assert.equal(blocked.resetAt, now + DAY_MS);
  assert.equal(blocked.retryAfterSeconds, DAY_MS / 1000);
});

test("the daily window is rolling rather than a UTC calendar day", async () => {
  const store = createMemoryQuotaStoreForTests();
  const startedAt = Date.UTC(2026, 6, 13, 13, 37);
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await consume({ store, userKey: "rolling-user", now: startedAt })).allowed, true);
  }

  const afterUtcMidnight = Date.UTC(2026, 6, 14, 0, 1);
  assert.equal((await consume({ store, userKey: "rolling-user", now: afterUtcMidnight })).allowed, false);

  const oneMillisecondBeforeReset = startedAt + DAY_MS - 1;
  const justBefore = await consume({ store, userKey: "rolling-user", now: oneMillisecondBeforeReset });
  assert.equal(justBefore.allowed, false);
  assert.equal(justBefore.scope, "user_24h");
  assert.equal(justBefore.retryAfterSeconds, 1);

  const atExactBoundary = await consume({ store, userKey: "rolling-user", now: startedAt + DAY_MS });
  assert.equal(atExactBoundary.allowed, true);
  assert.equal(atExactBoundary.daily.remaining, 2);
});

test("allows ten requests per rolling seven days and resets on the exact boundary", async () => {
  const store = createMemoryQuotaStoreForTests();
  const startedAt = Date.UTC(2026, 6, 1, 8, 15);
  const schedule = [
    ...Array(3).fill(startedAt),
    ...Array(3).fill(startedAt + DAY_MS),
    ...Array(3).fill(startedAt + 2 * DAY_MS),
    startedAt + 3 * DAY_MS,
  ];

  for (const now of schedule) {
    assert.equal((await consume({ store, userKey: "weekly-user", now })).allowed, true);
  }

  const blockedAt = startedAt + 3 * DAY_MS;
  const blocked = await consume({ store, userKey: "weekly-user", now: blockedAt });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, "user_7d");
  assert.equal(blocked.limit, 10);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.weekly.remaining, 0);
  assert.equal(blocked.resetAt, startedAt + WEEK_MS);
  assert.equal(blocked.retryAfterSeconds, 4 * DAY_MS / 1000);

  const justBefore = await consume({ store, userKey: "weekly-user", now: startedAt + WEEK_MS - 1 });
  assert.equal(justBefore.allowed, false);
  assert.equal(justBefore.scope, "user_7d");
  assert.equal(justBefore.retryAfterSeconds, 1);

  const atExactBoundary = await consume({ store, userKey: "weekly-user", now: startedAt + WEEK_MS });
  assert.equal(atExactBoundary.allowed, true);
  assert.equal(atExactBoundary.weekly.remaining, 2);
});

test("one user's exhausted quota does not consume another user's personal quota", async () => {
  const store = createMemoryQuotaStoreForTests();
  const now = Date.UTC(2026, 6, 13, 12);
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await consume({ store, userKey: "user-a", now })).allowed, true);
  }
  assert.equal((await consume({ store, userKey: "user-a", now })).allowed, false);

  const otherUser = await consume({ store, userKey: "user-b", now });
  assert.equal(otherUser.allowed, true);
  assert.equal(otherUser.daily.remaining, 2);
  assert.equal(otherUser.weekly.remaining, 9);
});

test("global rolling request cap cannot be bypassed with many user accounts", async () => {
  const store = createMemoryQuotaStoreForTests();
  const now = Date.UTC(2026, 6, 13, 12);
  for (let index = 0; index < 30; index += 1) {
    assert.equal((await consume({ store, userKey: `rotating-user-${index}`, now })).allowed, true);
  }

  const blocked = await consume({ store, userKey: "rotating-user-30", now });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, "global_24h");
  assert.equal(blocked.limit, 30);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.resetAt, now + DAY_MS);
});

test("weighted global cost cap blocks expensive PDFs before the request cap", async () => {
  const store = createMemoryQuotaStoreForTests();
  const now = Date.UTC(2026, 6, 13, 12);
  for (let index = 0; index < 20; index += 1) {
    assert.equal((await consume({ store, userKey: `pdf-user-${index}`, costKind: "pdf", now })).allowed, true);
  }

  const blocked = await consume({ store, userKey: "pdf-user-20", costKind: "pdf", now });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, "global_cost_24h");
  assert.equal(blocked.limit, 60);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.resetAt, now + DAY_MS);
});

test("environment variables may tighten but cannot raise any safety cap", async () => {
  const names = [
    "WHATNOW_USER_24H_LIMIT",
    "WHATNOW_USER_7D_LIMIT",
    "WHATNOW_GLOBAL_24H_LIMIT",
    "WHATNOW_GLOBAL_24H_COST_UNITS",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = "999999";

  try {
    const personalStore = createMemoryQuotaStoreForTests();
    const now = Date.UTC(2026, 6, 13, 12);
    for (let index = 0; index < 3; index += 1) {
      assert.equal((await consume({ store: personalStore, userKey: "env-user", now })).allowed, true);
    }
    assert.equal((await consume({ store: personalStore, userKey: "env-user", now })).scope, "user_24h");

    const weeklyStore = createMemoryQuotaStoreForTests();
    for (let day = 0; day < 4; day += 1) {
      const requests = day < 3 ? 3 : 1;
      for (let index = 0; index < requests; index += 1) {
        assert.equal((await consume({ store: weeklyStore, userKey: "env-weekly-user", now: now + day * DAY_MS })).allowed, true);
      }
    }
    assert.equal(
      (await consume({ store: weeklyStore, userKey: "env-weekly-user", now: now + 3 * DAY_MS })).scope,
      "user_7d",
    );

    const globalCountStore = createMemoryQuotaStoreForTests();
    for (let index = 0; index < 30; index += 1) {
      assert.equal((await consume({ store: globalCountStore, userKey: `env-count-${index}`, now })).allowed, true);
    }
    assert.equal(
      (await consume({ store: globalCountStore, userKey: "env-count-30", now })).scope,
      "global_24h",
    );

    const globalCostStore = createMemoryQuotaStoreForTests();
    for (let index = 0; index < 20; index += 1) {
      assert.equal((await consume({ store: globalCostStore, userKey: `env-cost-${index}`, costKind: "pdf", now })).allowed, true);
    }
    assert.equal(
      (await consume({ store: globalCostStore, userKey: "env-cost-20", costKind: "pdf", now })).scope,
      "global_cost_24h",
    );
  } finally {
    restoreEnvironment(previous);
  }
});
