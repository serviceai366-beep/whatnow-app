import type { RateLimitResult } from "./security.ts";

export const CLIENT_DAILY_ANALYSIS_LIMIT = 8;
export const GLOBAL_DAILY_ANALYSIS_LIMIT = 30;
export const GLOBAL_DAILY_COST_UNIT_LIMIT = 60;

export type AnalysisCostKind = "text" | "image" | "pdf";
export type QuotaScope = "client_daily" | "global_daily" | "global_cost" | "unavailable";

export type QuotaDecision = RateLimitResult & {
  backend: "durable" | "memory" | "unavailable";
  scope: QuotaScope | null;
};

type D1ResultRow = { count: number; reset_at: number };

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
  consume(key: string, limit: number, amount: number, resetAt: number, now: number): Promise<RateLimitResult>;
};

function createMemoryQuotaStore(): QuotaStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    backend: "memory",
    async consume(key, limit, amount, resetAt, now) {
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt };
        buckets.set(key, bucket);
      }

      if (bucket.count + amount > limit) {
        return {
          allowed: false,
          limit,
          remaining: Math.max(0, limit - bucket.count),
          retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
          resetAt: bucket.resetAt,
        };
      }

      bucket.count += amount;
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSeconds: 0,
        resetAt: bucket.resetAt,
      };
    },
  };
}

const memoryStore = createMemoryQuotaStore();

const UPSERT_BUCKET_SQL = `
INSERT INTO analysis_rate_limits (bucket_key, count, reset_at, updated_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(bucket_key) DO UPDATE SET
  count = CASE
    WHEN analysis_rate_limits.reset_at <= excluded.updated_at THEN excluded.count
    ELSE analysis_rate_limits.count + excluded.count
  END,
  reset_at = CASE
    WHEN analysis_rate_limits.reset_at <= excluded.updated_at THEN excluded.reset_at
    ELSE analysis_rate_limits.reset_at
  END,
  updated_at = excluded.updated_at
WHERE analysis_rate_limits.reset_at <= excluded.updated_at
   OR analysis_rate_limits.count + excluded.count <= ?
RETURNING count, reset_at
`;

let durableStorePromise: Promise<QuotaStore | null> | null = null;

function createDurableStore(db: D1DatabaseLike): QuotaStore {
  let initialized: Promise<void> | null = null;

  const initialize = () => {
    initialized ??= (async () => {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS analysis_rate_limits (
          bucket_key TEXT PRIMARY KEY NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          reset_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS analysis_rate_limits_reset_at_idx ON analysis_rate_limits (reset_at)"),
      ]);
      await db.prepare("DELETE FROM analysis_rate_limits WHERE reset_at < ?")
        .bind(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .run();
    })();
    return initialized;
  };

  return {
    backend: "durable",
    async consume(key, limit, amount, resetAt, now) {
      await initialize();
      const row = await db.prepare(UPSERT_BUCKET_SQL)
        .bind(key, amount, resetAt, now, limit)
        .first<D1ResultRow>();

      if (!row) {
        const existing = await db.prepare(
          "SELECT count, reset_at FROM analysis_rate_limits WHERE bucket_key = ?",
        ).bind(key).first<D1ResultRow>();
        const actualResetAt = existing?.reset_at ?? resetAt;
        return {
          allowed: false,
          limit,
          remaining: Math.max(0, limit - (existing?.count ?? limit)),
          retryAfterSeconds: Math.max(1, Math.ceil((actualResetAt - now) / 1000)),
          resetAt: actualResetAt,
        };
      }

      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - row.count),
        retryAfterSeconds: 0,
        resetAt: row.reset_at,
      };
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
      // Node tests and non-Cloudflare local tooling do not expose cloudflare:workers.
    }

    if (process.env.NODE_ENV === "production" || process.env.WHATNOW_REQUIRE_DURABLE_LIMITS === "true") {
      return null;
    }
    return memoryStore;
  })();
  return durableStorePromise;
}

function positiveIntegerSetting(name: string, fallback: number, maximum: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

export function analysisCostUnits(kind: AnalysisCostKind): number {
  if (kind === "pdf") return 3;
  if (kind === "image") return 2;
  return 1;
}

function utcDay(now: number): { key: string; resetAt: number } {
  const date = new Date(now);
  const key = date.toISOString().slice(0, 10);
  const resetAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return { key, resetAt };
}

export async function checkAnalysisQuota({
  clientKey,
  costKind,
  now = Date.now(),
  store,
}: {
  clientKey: string;
  costKind: AnalysisCostKind;
  now?: number;
  store?: QuotaStore;
}): Promise<QuotaDecision> {
  const quotaStore = store ?? await resolveQuotaStore();
  if (!quotaStore) {
    return {
      allowed: false,
      backend: "unavailable",
      scope: "unavailable",
      limit: 0,
      remaining: 0,
      retryAfterSeconds: 60,
      resetAt: now + 60_000,
    };
  }

  const { key: dayKey, resetAt } = utcDay(now);
  const clientLimit = positiveIntegerSetting("WHATNOW_CLIENT_DAILY_LIMIT", CLIENT_DAILY_ANALYSIS_LIMIT, 100);
  const globalLimit = positiveIntegerSetting("WHATNOW_GLOBAL_DAILY_LIMIT", GLOBAL_DAILY_ANALYSIS_LIMIT, 10_000);
  const costLimit = positiveIntegerSetting("WHATNOW_GLOBAL_DAILY_COST_UNITS", GLOBAL_DAILY_COST_UNIT_LIMIT, 20_000);

  const checks: Array<{ key: string; limit: number; amount: number; scope: Exclude<QuotaScope, "unavailable"> }> = [
    { key: `client:${dayKey}:${clientKey}`, limit: clientLimit, amount: 1, scope: "client_daily" },
    { key: `global:${dayKey}`, limit: globalLimit, amount: 1, scope: "global_daily" },
    { key: `cost:${dayKey}`, limit: costLimit, amount: analysisCostUnits(costKind), scope: "global_cost" },
  ];

  let last: RateLimitResult | null = null;
  for (const check of checks) {
    last = await quotaStore.consume(check.key, check.limit, check.amount, resetAt, now);
    if (!last.allowed) return { ...last, backend: quotaStore.backend, scope: check.scope };
  }

  return { ...last!, backend: quotaStore.backend, scope: null };
}

export function createMemoryQuotaStoreForTests(): QuotaStore {
  return createMemoryQuotaStore();
}
