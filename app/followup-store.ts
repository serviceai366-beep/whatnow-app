import type { D1DatabaseLike, D1StatementLike } from "./file-store.ts";
import type { FollowupAnswer, FollowupMessage, FollowupQuota } from "./followup-types.ts";
import { FREE_FOLLOWUP_LIMIT, PRO_FOLLOWUP_LIMIT } from "./followup-types.ts";
import type { SubscriptionPlanCode } from "./subscription-types.ts";

const GLOBAL_24H_DEFAULT_LIMIT = 500;
const RAPID_WINDOW_MS = 10 * 60 * 1_000;
const RAPID_USER_LIMIT = 12;
const PENDING_TTL_MS = 10 * 60 * 1_000;

type FollowupRow = {
  id: string;
  user_id: string;
  analysis_id: string;
  question: string;
  selected_text: string | null;
  answer: string | null;
  evidence_ids: string | null;
  uncertain: number | null;
  safety_notice: string | null;
  status: string;
  created_at: number;
  updated_at: number;
};

export class FollowupStoreError extends Error {
  readonly code: "followup_limit_reached" | "followup_rate_limited" | "followup_service_limit" | "followup_not_found" | "followup_storage_unavailable";
  readonly status: 404 | 429 | 503;

  constructor(code: FollowupStoreError["code"], status: FollowupStoreError["status"]) {
    super(code);
    this.name = "FollowupStoreError";
    this.code = code;
    this.status = status;
  }
}

function planLimit(planCode: SubscriptionPlanCode): number {
  return planCode === "pro" ? PRO_FOLLOWUP_LIMIT : FREE_FOLLOWUP_LIMIT;
}

function globalLimit(): number {
  const configured = Number(process.env.WHATNOW_FOLLOWUP_GLOBAL_24H_LIMIT);
  return Number.isSafeInteger(configured) && configured >= 10 && configured <= 10_000 ? configured : GLOBAL_24H_DEFAULT_LIMIT;
}

async function allRows<T>(statement: D1StatementLike): Promise<T[]> {
  const result = await statement.all<T>();
  return Array.isArray(result) ? result : Array.isArray(result.results) ? result.results : [];
}

function messageFromRow(row: FollowupRow): FollowupMessage | null {
  if (row.status !== "completed" || typeof row.id !== "string" || typeof row.question !== "string"
    || typeof row.answer !== "string" || !Number.isSafeInteger(row.created_at)) return null;
  let evidenceIds: string[] = [];
  try {
    const parsed = JSON.parse(row.evidence_ids ?? "[]") as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) evidenceIds = parsed;
  } catch {
    evidenceIds = [];
  }
  return {
    id: row.id,
    question: row.question,
    selectedText: typeof row.selected_text === "string" ? row.selected_text : null,
    answer: row.answer,
    evidenceIds,
    uncertain: row.uncertain === 1,
    safetyNotice: typeof row.safety_notice === "string" ? row.safety_notice : null,
    createdAt: row.created_at,
  };
}

export type FollowupStore = {
  list(userId: string, analysisId: string): Promise<FollowupMessage[]>;
  quota(userId: string, analysisId: string, planCode: SubscriptionPlanCode): Promise<FollowupQuota>;
  reserve(input: { userId: string; analysisId: string; question: string; selectedText: string | null; planCode: SubscriptionPlanCode; now?: number }): Promise<string>;
  complete(userId: string, id: string, answer: FollowupAnswer, now?: number): Promise<void>;
  release(userId: string, id: string): Promise<void>;
  deleteForAnalysis(userId: string, analysisId: string): Promise<void>;
};

function createStore(db: D1DatabaseLike): FollowupStore {
  let initialization: Promise<void> | null = null;
  const initialize = () => {
    initialization ??= (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS document_followups (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        analysis_id TEXT NOT NULL,
        question TEXT NOT NULL,
        selected_text TEXT,
        answer TEXT,
        evidence_ids TEXT,
        uncertain INTEGER,
        safety_notice TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`).run();
      await db.batch([
        db.prepare("CREATE INDEX IF NOT EXISTS document_followups_owner_analysis_idx ON document_followups (user_id, analysis_id, created_at ASC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS document_followups_created_idx ON document_followups (created_at DESC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS document_followups_owner_created_idx ON document_followups (user_id, created_at DESC)"),
      ]);
    })();
    return initialization;
  };

  const usedCount = async (userId: string, analysisId: string) => {
    const row = await db.prepare("SELECT COUNT(*) AS count FROM document_followups WHERE user_id = ? AND analysis_id = ?")
      .bind(userId, analysisId).first<{ count: number | null }>();
    return Math.max(0, Number(row?.count ?? 0));
  };

  const cleanupStaleReservations = (now: number) => db.prepare(
    "DELETE FROM document_followups WHERE status = 'pending' AND updated_at <= ?",
  ).bind(now - PENDING_TTL_MS).run();

  return {
    async list(userId, analysisId) {
      await initialize();
      const rows = await allRows<FollowupRow>(db.prepare(`SELECT id,user_id,analysis_id,question,selected_text,answer,evidence_ids,uncertain,safety_notice,status,created_at,updated_at
        FROM document_followups WHERE user_id = ? AND analysis_id = ? AND status = 'completed' ORDER BY created_at ASC, id ASC LIMIT ?`)
        .bind(userId, analysisId, PRO_FOLLOWUP_LIMIT));
      return rows.map(messageFromRow).filter((item): item is FollowupMessage => Boolean(item));
    },
    async quota(userId, analysisId, planCode) {
      await initialize();
      await cleanupStaleReservations(Date.now());
      const limit = planLimit(planCode);
      const used = Math.min(await usedCount(userId, analysisId), limit);
      return { planCode, used, limit, remaining: Math.max(0, limit - used) };
    },
    async reserve({ userId, analysisId, question, selectedText, planCode, now = Date.now() }) {
      await initialize();
      await cleanupStaleReservations(now);
      const limit = planLimit(planCode);
      const cutoff24h = now - 24 * 60 * 60 * 1_000;
      const rapidCutoff = now - RAPID_WINDOW_MS;
      const id = crypto.randomUUID();
      const inserted = await db.prepare(`INSERT INTO document_followups
        (id,user_id,analysis_id,question,selected_text,status,created_at,updated_at)
        SELECT ?,?,?,?,?,'pending',?,?
        WHERE (SELECT COUNT(*) FROM document_followups WHERE user_id = ? AND analysis_id = ?) < ?
          AND (SELECT COUNT(*) FROM document_followups WHERE created_at > ?) < ?
          AND (SELECT COUNT(*) FROM document_followups WHERE user_id = ? AND created_at > ?) < ?
        RETURNING id`).bind(
        id, userId, analysisId, question, selectedText, now, now,
        userId, analysisId, limit,
        cutoff24h, globalLimit(),
        userId, rapidCutoff, RAPID_USER_LIMIT,
      ).first<{ id: string }>();
      if (inserted?.id === id) return id;
      if (await usedCount(userId, analysisId) >= limit) throw new FollowupStoreError("followup_limit_reached", 429);
      const rapid = await db.prepare("SELECT COUNT(*) AS count FROM document_followups WHERE user_id = ? AND created_at > ?")
        .bind(userId, rapidCutoff).first<{ count: number | null }>();
      if (Number(rapid?.count ?? 0) >= RAPID_USER_LIMIT) throw new FollowupStoreError("followup_rate_limited", 429);
      throw new FollowupStoreError("followup_service_limit", 503);
    },
    async complete(userId, id, answer, now = Date.now()) {
      await initialize();
      const updated = await db.prepare(`UPDATE document_followups SET answer = ?, evidence_ids = ?, uncertain = ?, safety_notice = ?, status = 'completed', updated_at = ?
        WHERE id = ? AND user_id = ? AND status = 'pending' RETURNING id`).bind(
        answer.answer, JSON.stringify(answer.evidenceIds), answer.uncertain ? 1 : 0, answer.safetyNotice, now, id, userId,
      ).first<{ id: string }>();
      if (updated?.id !== id) throw new FollowupStoreError("followup_not_found", 404);
    },
    async release(userId, id) {
      await initialize();
      await db.prepare("DELETE FROM document_followups WHERE id = ? AND user_id = ? AND status = 'pending'").bind(id, userId).run();
    },
    async deleteForAnalysis(userId, analysisId) {
      await initialize();
      await db.prepare("DELETE FROM document_followups WHERE user_id = ? AND analysis_id = ?").bind(userId, analysisId).run();
    },
  };
}

let storePromise: Promise<FollowupStore | null> | null = null;

export async function getFollowupStore(): Promise<FollowupStore | null> {
  storePromise ??= (async () => {
    try {
      const runtime = await import("cloudflare:workers");
      const db = (runtime.env as unknown as { DB?: D1DatabaseLike }).DB;
      return db ? createStore(db) : null;
    } catch {
      return null;
    }
  })();
  return storePromise;
}

export function createFollowupStoreForTests(db: D1DatabaseLike): FollowupStore {
  return createStore(db);
}
