import type { AnalysisCostKind } from "./usage-control.ts";

export type AnalysisTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
};

export const GPT_5_6_LUNA_INPUT_USD_PER_MILLION = 1;
export const GPT_5_6_LUNA_CACHED_INPUT_USD_PER_MILLION = 0.1;
export const GPT_5_6_LUNA_OUTPUT_USD_PER_MILLION = 6;
export const ANALYSIS_COST_RETENTION_DAYS = 90;

type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike;
  run(): Promise<unknown>;
};

type D1DatabaseLike = {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown>;
};

function nonNegativeInteger(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function estimateOpenAICostMicrousd(usage: AnalysisTokenUsage): number {
  const inputTokens = nonNegativeInteger(usage.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, nonNegativeInteger(usage.cachedInputTokens));
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const outputTokens = nonNegativeInteger(usage.outputTokens);
  return Math.round(
    uncachedInputTokens * GPT_5_6_LUNA_INPUT_USD_PER_MILLION
      + cachedInputTokens * GPT_5_6_LUNA_CACHED_INPUT_USD_PER_MILLION
      + outputTokens * GPT_5_6_LUNA_OUTPUT_USD_PER_MILLION,
  );
}

async function pseudonymousUserKey(userKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userKey));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

let databasePromise: Promise<D1DatabaseLike | null> | null = null;
let initializePromise: Promise<void> | null = null;

async function resolveDatabase(): Promise<D1DatabaseLike | null> {
  databasePromise ??= (async () => {
    try {
      const runtime = await import("cloudflare:workers");
      return ((runtime.env as unknown as { DB?: D1DatabaseLike }).DB ?? null);
    } catch {
      return null;
    }
  })();
  return databasePromise;
}

async function initializeDatabase(db: D1DatabaseLike): Promise<void> {
  initializePromise ??= (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS analysis_cost_events (
      id TEXT PRIMARY KEY NOT NULL,
      user_key_hash TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      model TEXT NOT NULL,
      cost_kind TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      cached_input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      estimated_cost_microusd INTEGER NOT NULL
    )`).run();
    await db.batch([
      db.prepare("CREATE INDEX IF NOT EXISTS analysis_cost_events_time_idx ON analysis_cost_events (recorded_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS analysis_cost_events_user_time_idx ON analysis_cost_events (user_key_hash, recorded_at)"),
    ]);
    await db.prepare("DELETE FROM analysis_cost_events WHERE recorded_at <= ?")
      .bind(Date.now() - ANALYSIS_COST_RETENTION_DAYS * 24 * 60 * 60 * 1000)
      .run();
  })();
  return initializePromise;
}

export async function recordAnalysisCost({
  userKey,
  model,
  costKind,
  usage,
  now = Date.now(),
}: {
  userKey: string;
  model: string;
  costKind: AnalysisCostKind;
  usage: AnalysisTokenUsage | null;
  now?: number;
}): Promise<boolean> {
  if (!usage) return false;
  const db = await resolveDatabase();
  if (!db) return false;
  try {
    await initializeDatabase(db);
    await db.prepare(`INSERT INTO analysis_cost_events (
      id, user_key_hash, recorded_at, model, cost_kind,
      input_tokens, cached_input_tokens, output_tokens, estimated_cost_microusd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(),
      await pseudonymousUserKey(userKey),
      now,
      model,
      costKind,
      nonNegativeInteger(usage.inputTokens),
      Math.min(nonNegativeInteger(usage.inputTokens), nonNegativeInteger(usage.cachedInputTokens)),
      nonNegativeInteger(usage.outputTokens),
      estimateOpenAICostMicrousd(usage),
    ).run();
    return true;
  } catch (error) {
    console.error("[analysis-cost] Failed to record cost telemetry", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return false;
  }
}
