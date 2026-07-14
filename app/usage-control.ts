import type { RateLimitResult } from "./security.ts";
import type { QuotaSnapshot, WindowQuota } from "./quota-types.ts";

export type { QuotaSnapshot, WindowQuota } from "./quota-types.ts";

export const USER_24H_ANALYSIS_LIMIT = 3;
export const USER_7D_ANALYSIS_LIMIT = 10;
export const GLOBAL_24H_ANALYSIS_LIMIT = 30;
export const GLOBAL_24H_COST_UNIT_LIMIT = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type AnalysisCostKind = "text" | "image" | "pdf" | "document";
export type QuotaScope = "user_24h" | "user_7d" | "global_24h" | "global_cost_24h" | "unavailable";

export type QuotaDecision = RateLimitResult & {
  backend: "durable" | "memory" | "unavailable";
  scope: QuotaScope | null;
  daily: WindowQuota;
  weekly: WindowQuota;
};

type QuotaLimits = {
  daily: number;
  weekly: number;
  global: number;
  globalCost: number;
};

type ConsumeInput = {
  userKey: string;
  costUnits: number;
  now: number;
  limits: QuotaLimits;
};

export type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown>;
};

export type QuotaStore = {
  backend: "durable" | "memory";
  consume(input: ConsumeInput): Promise<QuotaDecision>;
  read(input: Omit<ConsumeInput, "costUnits">): Promise<QuotaSnapshot>;
};

type UsageEvent = { id: string; userKey: string; costUnits: number; createdAt: number };
type UsageStats = {
  dailyCount: number;
  dailyOldest: number | null;
  weeklyCount: number;
  weeklyOldest: number | null;
  globalCount: number;
  globalOldest: number | null;
  globalCost: number;
  globalCostOldest: number | null;
};

function windowQuota(count: number, oldest: number | null, limit: number, windowMs: number, now: number): WindowQuota {
  return {
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: oldest === null ? now + windowMs : oldest + windowMs,
  };
}

function decisionFromStats(
  stats: UsageStats,
  limits: QuotaLimits,
  now: number,
  backend: "durable" | "memory",
  inserted: boolean,
): QuotaDecision {
  const daily = windowQuota(stats.dailyCount, stats.dailyOldest, limits.daily, DAY_MS, now);
  const weekly = windowQuota(stats.weeklyCount, stats.weeklyOldest, limits.weekly, WEEK_MS, now);
  let scope: QuotaScope | null = null;
  let effective: WindowQuota = daily;
  if (!inserted) {
    const dailyBlocked = stats.dailyCount >= limits.daily;
    const weeklyBlocked = stats.weeklyCount >= limits.weekly;
    if (dailyBlocked || weeklyBlocked) {
      if (dailyBlocked && (!weeklyBlocked || daily.resetAt >= weekly.resetAt)) {
        scope = "user_24h";
        effective = daily;
      } else {
        scope = "user_7d";
        effective = weekly;
      }
    }
    else if (stats.globalCount >= limits.global) {
      scope = "global_24h";
      effective = windowQuota(stats.globalCount, stats.globalOldest, limits.global, DAY_MS, now);
    } else {
      scope = "global_cost_24h";
      effective = windowQuota(stats.globalCost, stats.globalCostOldest, limits.globalCost, DAY_MS, now);
    }
  }
  return {
    allowed: inserted,
    backend,
    scope,
    limit: effective.limit,
    remaining: effective.remaining,
    retryAfterSeconds: inserted ? 0 : Math.max(1, Math.ceil((effective.resetAt - now) / 1000)),
    resetAt: effective.resetAt,
    daily,
    weekly,
  };
}

function snapshotFromStats(
  stats: UsageStats,
  limits: QuotaLimits,
  now: number,
  backend: "durable" | "memory",
): QuotaSnapshot {
  return {
    backend,
    checkedAt: now,
    daily: windowQuota(stats.dailyCount, stats.dailyOldest, limits.daily, DAY_MS, now),
    weekly: windowQuota(stats.weeklyCount, stats.weeklyOldest, limits.weekly, WEEK_MS, now),
  };
}

function statsFromEvents(events: UsageEvent[], userKey: string, now: number): UsageStats {
  const dailyStart = now - DAY_MS;
  const weeklyStart = now - WEEK_MS;
  const dailyEvents = events.filter((event) => event.userKey === userKey && event.createdAt > dailyStart);
  const weeklyEvents = events.filter((event) => event.userKey === userKey && event.createdAt > weeklyStart);
  const globalEvents = events.filter((event) => event.createdAt > dailyStart);
  const oldest = (items: UsageEvent[]) => items.length ? Math.min(...items.map((event) => event.createdAt)) : null;
  return {
    dailyCount: dailyEvents.length,
    dailyOldest: oldest(dailyEvents),
    weeklyCount: weeklyEvents.length,
    weeklyOldest: oldest(weeklyEvents),
    globalCount: globalEvents.length,
    globalOldest: oldest(globalEvents),
    globalCost: globalEvents.reduce((sum, event) => sum + event.costUnits, 0),
    globalCostOldest: oldest(globalEvents),
  };
}

function createMemoryQuotaStore(): QuotaStore {
  let events: UsageEvent[] = [];
  return {
    backend: "memory",
    async consume({ userKey, costUnits, now, limits }) {
      events = events.filter((event) => event.createdAt > now - WEEK_MS);
      let stats = statsFromEvents(events, userKey, now);
      const inserted = stats.dailyCount < limits.daily
        && stats.weeklyCount < limits.weekly
        && stats.globalCount < limits.global
        && stats.globalCost + costUnits <= limits.globalCost;
      if (inserted) {
        events.push({ id: crypto.randomUUID(), userKey, costUnits, createdAt: now });
        stats = statsFromEvents(events, userKey, now);
      }
      return decisionFromStats(stats, limits, now, "memory", inserted);
    },
    async read({ userKey, now, limits }) {
      events = events.filter((event) => event.createdAt > now - WEEK_MS);
      return snapshotFromStats(statsFromEvents(events, userKey, now), limits, now, "memory");
    },
  };
}

const memoryStore = createMemoryQuotaStore();

const INSERT_EVENT_SQL = `
INSERT INTO analysis_usage_events (id, user_key, consumed_at, cost_units)
SELECT ?, ?, ?, ?
WHERE (SELECT COUNT(*) FROM analysis_usage_events WHERE user_key = ? AND consumed_at > ?) < ?
  AND (SELECT COUNT(*) FROM analysis_usage_events WHERE user_key = ? AND consumed_at > ?) < ?
  AND (SELECT COUNT(*) FROM analysis_usage_events WHERE consumed_at > ?) < ?
  AND (SELECT COALESCE(SUM(cost_units), 0) FROM analysis_usage_events WHERE consumed_at > ?) + ? <= ?
RETURNING id
`;

const READ_STATS_SQL = `
SELECT
  SUM(CASE WHEN user_key = ? AND consumed_at > ? THEN 1 ELSE 0 END) AS daily_count,
  MIN(CASE WHEN user_key = ? AND consumed_at > ? THEN consumed_at END) AS daily_oldest,
  SUM(CASE WHEN user_key = ? AND consumed_at > ? THEN 1 ELSE 0 END) AS weekly_count,
  MIN(CASE WHEN user_key = ? AND consumed_at > ? THEN consumed_at END) AS weekly_oldest,
  SUM(CASE WHEN consumed_at > ? THEN 1 ELSE 0 END) AS global_count,
  MIN(CASE WHEN consumed_at > ? THEN consumed_at END) AS global_oldest,
  SUM(CASE WHEN consumed_at > ? THEN cost_units ELSE 0 END) AS global_cost,
  MIN(CASE WHEN consumed_at > ? THEN consumed_at END) AS global_cost_oldest
FROM analysis_usage_events
`;

type D1StatsRow = {
  daily_count: number | null;
  daily_oldest: number | null;
  weekly_count: number | null;
  weekly_oldest: number | null;
  global_count: number | null;
  global_oldest: number | null;
  global_cost: number | null;
  global_cost_oldest: number | null;
};

let durableStorePromise: Promise<QuotaStore | null> | null = null;

function createDurableStore(db: D1DatabaseLike): QuotaStore {
  let initialized: Promise<void> | null = null;
  const initialize = () => {
    initialized ??= (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS analysis_usage_events (
        id TEXT PRIMARY KEY NOT NULL,
        user_key TEXT NOT NULL,
        consumed_at INTEGER NOT NULL,
        cost_units INTEGER NOT NULL
      )`).run();
      await db.batch([
        db.prepare("CREATE INDEX IF NOT EXISTS analysis_usage_events_user_time_idx ON analysis_usage_events (user_key, consumed_at)"),
        db.prepare("CREATE INDEX IF NOT EXISTS analysis_usage_events_time_idx ON analysis_usage_events (consumed_at)"),
      ]);
      await db.prepare("DELETE FROM analysis_usage_events WHERE consumed_at <= ?").bind(Date.now() - WEEK_MS).run();
    })();
    return initialized;
  };

  const readStats = async (userKey: string, now: number): Promise<UsageStats> => {
    const dayStart = now - DAY_MS;
    const weekStart = now - WEEK_MS;
    const row = await db.prepare(READ_STATS_SQL).bind(
      userKey, dayStart, userKey, dayStart,
      userKey, weekStart, userKey, weekStart,
      dayStart, dayStart, dayStart, dayStart,
    ).first<D1StatsRow>();
    return {
      dailyCount: Number(row?.daily_count ?? 0),
      dailyOldest: row?.daily_oldest ?? null,
      weeklyCount: Number(row?.weekly_count ?? 0),
      weeklyOldest: row?.weekly_oldest ?? null,
      globalCount: Number(row?.global_count ?? 0),
      globalOldest: row?.global_oldest ?? null,
      globalCost: Number(row?.global_cost ?? 0),
      globalCostOldest: row?.global_cost_oldest ?? null,
    };
  };

  return {
    backend: "durable",
    async consume({ userKey, costUnits, now, limits }) {
      await initialize();
      const dayStart = now - DAY_MS;
      const weekStart = now - WEEK_MS;
      const inserted = await db.prepare(INSERT_EVENT_SQL).bind(
        crypto.randomUUID(), userKey, now, costUnits,
        userKey, dayStart, limits.daily,
        userKey, weekStart, limits.weekly,
        dayStart, limits.global,
        dayStart, costUnits, limits.globalCost,
      ).first<{ id: string }>();

      const stats = await readStats(userKey, now);
      return decisionFromStats(stats, limits, now, "durable", Boolean(inserted));
    },
    async read({ userKey, now, limits }) {
      await initialize();
      return snapshotFromStats(await readStats(userKey, now), limits, now, "durable");
    },
  };
}

async function resolveQuotaStore(): Promise<QuotaStore | null> {
  durableStorePromise ??= (async () => {
    try {
      const runtime = await import("cloudflare:workers");
      const db = (runtime.env as unknown as { DB?: D1DatabaseLike }).DB;
      if (db) return createDurableStore(db);
    } catch {
      // Local Node tests do not expose Cloudflare bindings.
    }
    if (process.env.NODE_ENV === "production" || process.env.WHATNOW_REQUIRE_DURABLE_LIMITS === "true") return null;
    return memoryStore;
  })();
  return durableStorePromise;
}

function cappedSetting(name: string, safeMaximum: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, safeMaximum) : safeMaximum;
}

function configuredLimits(): QuotaLimits {
  return {
    daily: cappedSetting("WHATNOW_USER_24H_LIMIT", USER_24H_ANALYSIS_LIMIT),
    weekly: cappedSetting("WHATNOW_USER_7D_LIMIT", USER_7D_ANALYSIS_LIMIT),
    global: cappedSetting("WHATNOW_GLOBAL_24H_LIMIT", GLOBAL_24H_ANALYSIS_LIMIT),
    globalCost: cappedSetting("WHATNOW_GLOBAL_24H_COST_UNITS", GLOBAL_24H_COST_UNIT_LIMIT),
  };
}

function unavailableSnapshot(now: number): QuotaSnapshot {
  const unavailable = { limit: 0, remaining: 0, resetAt: now + 60_000 };
  return { backend: "unavailable", checkedAt: now, daily: unavailable, weekly: unavailable };
}

export function analysisCostUnits(kind: AnalysisCostKind): number {
  if (kind === "pdf") return 3;
  if (kind === "image" || kind === "document") return 2;
  return 1;
}

export async function checkAnalysisQuota({
  userKey,
  costKind,
  now = Date.now(),
  store,
}: {
  userKey: string;
  costKind: AnalysisCostKind;
  now?: number;
  store?: QuotaStore;
}): Promise<QuotaDecision> {
  const limits = configuredLimits();
  const quotaStore = store ?? await resolveQuotaStore();
  if (!quotaStore) {
    const snapshot = unavailableSnapshot(now);
    return {
      allowed: false,
      backend: "unavailable",
      scope: "unavailable",
      limit: 0,
      remaining: 0,
      resetAt: snapshot.daily.resetAt,
      retryAfterSeconds: 60,
      daily: snapshot.daily,
      weekly: snapshot.weekly,
    };
  }
  return quotaStore.consume({ userKey, costUnits: analysisCostUnits(costKind), now, limits });
}

export async function readAnalysisQuota({
  userKey,
  now = Date.now(),
  store,
}: {
  userKey: string;
  now?: number;
  store?: QuotaStore;
}): Promise<QuotaSnapshot> {
  const quotaStore = store ?? await resolveQuotaStore();
  if (!quotaStore) return unavailableSnapshot(now);
  return quotaStore.read({ userKey, now, limits: configuredLimits() });
}

export function createMemoryQuotaStoreForTests(): QuotaStore {
  return createMemoryQuotaStore();
}

export function createDurableQuotaStoreForTests(db: D1DatabaseLike): QuotaStore {
  return createDurableStore(db);
}
