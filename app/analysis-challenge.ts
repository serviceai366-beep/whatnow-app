import type { D1DatabaseLike } from "./usage-control.ts";
import { verifyTurnstileToken } from "./turnstile-server.ts";

const BURST_WINDOW_MS = 60_000;
const BURST_REQUEST_LIMIT = 3;
const CLEARANCE_MS = 24 * 60 * 60 * 1000;
const LOW_BOT_SCORE = 20;

type SecurityState = {
  windowStartedAt: number;
  requestCount: number;
  clearedUntil: number;
};

type StoredSecurityState = {
  window_started_at: number | null;
  request_count: number | null;
  cleared_until: number | null;
};

export type AnalysisChallengeDecision =
  | { ok: true; challenged: boolean }
  | { ok: false; code: "captcha_required" | "captcha_failed" | "captcha_unavailable" };

const memoryStates = new Map<string, SecurityState>();
let databasePromise: Promise<D1DatabaseLike | null> | null = null;
let initializedDatabase: Promise<void> | null = null;

async function resolveDatabase(): Promise<D1DatabaseLike | null> {
  databasePromise ??= (async () => {
    try {
      const runtime = await import("cloudflare:workers");
      return (runtime.env as unknown as { DB?: D1DatabaseLike }).DB ?? null;
    } catch {
      return null;
    }
  })();
  return databasePromise;
}

async function initializeDatabase(db: D1DatabaseLike): Promise<void> {
  initializedDatabase ??= (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS analysis_security_state (
      user_key TEXT PRIMARY KEY NOT NULL,
      window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL,
      cleared_until INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`).run();
    await db.prepare("DELETE FROM analysis_security_state WHERE updated_at <= ?")
      .bind(Date.now() - 30 * CLEARANCE_MS)
      .run();
  })();
  return initializedDatabase;
}

async function readState(userKey: string): Promise<SecurityState | null> {
  const db = await resolveDatabase();
  if (!db) return memoryStates.get(userKey) ?? null;
  await initializeDatabase(db);
  const row = await db.prepare(`SELECT window_started_at, request_count, cleared_until
    FROM analysis_security_state WHERE user_key = ?`).bind(userKey).first<StoredSecurityState>();
  return row ? {
    windowStartedAt: Number(row.window_started_at ?? 0),
    requestCount: Number(row.request_count ?? 0),
    clearedUntil: Number(row.cleared_until ?? 0),
  } : null;
}

async function writeState(userKey: string, state: SecurityState, now: number): Promise<void> {
  const db = await resolveDatabase();
  if (!db) {
    memoryStates.set(userKey, state);
    return;
  }
  await initializeDatabase(db);
  await db.prepare(`INSERT INTO analysis_security_state
      (user_key, window_started_at, request_count, cleared_until, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_key) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      request_count = excluded.request_count,
      cleared_until = excluded.cleared_until,
      updated_at = excluded.updated_at`)
    .bind(userKey, state.windowStartedAt, state.requestCount, state.clearedUntil, now)
    .run();
}

function cloudflareBotScore(request: Request): number | null {
  const cf = (request as Request & { cf?: { botManagement?: { score?: unknown; verifiedBot?: unknown } } }).cf;
  if (cf?.botManagement?.verifiedBot === true) return null;
  const score = cf?.botManagement?.score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

export async function checkAnalysisChallenge({
  request,
  userKey,
  token,
  now = Date.now(),
}: {
  request: Request;
  userKey: string;
  token: FormDataEntryValue | null;
  now?: number;
}): Promise<AnalysisChallengeDecision> {
  const previous = await readState(userKey);
  if (previous && previous.clearedUntil > now) return { ok: true, challenged: false };

  const withinBurst = previous && now - previous.windowStartedAt < BURST_WINDOW_MS;
  const state: SecurityState = {
    windowStartedAt: withinBurst ? previous.windowStartedAt : now,
    requestCount: withinBurst ? previous.requestCount + 1 : 1,
    clearedUntil: 0,
  };
  const score = cloudflareBotScore(request);
  const suspicious = state.requestCount >= BURST_REQUEST_LIMIT || (score !== null && score <= LOW_BOT_SCORE);
  await writeState(userKey, state, now);
  if (!suspicious) return { ok: true, challenged: false };

  const verification = await verifyTurnstileToken({ request, token, action: "analyze" });
  if (!verification.ok) return verification;

  await writeState(userKey, { windowStartedAt: now, requestCount: 0, clearedUntil: now + CLEARANCE_MS }, now);
  return { ok: true, challenged: true };
}

export function resetAnalysisChallengeStateForTests(): void {
  memoryStates.clear();
}
