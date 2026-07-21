import { getAccessToken } from "./supabase-auth";
import type { FollowupConversation, FollowupMessage } from "./followup-types";

type ApiPayload = { conversation?: unknown; error?: { code?: unknown } };

export class FollowupClientError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "FollowupClientError"; this.code = code; }
}

function isMessage(value: unknown): value is FollowupMessage {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.question === "string" && (typeof row.selectedText === "string" || row.selectedText === null)
    && typeof row.answer === "string" && Array.isArray(row.evidenceIds) && row.evidenceIds.every((id) => typeof id === "string")
    && typeof row.uncertain === "boolean" && (typeof row.safetyNotice === "string" || row.safetyNotice === null) && typeof row.createdAt === "number";
}

function parseConversation(value: unknown): FollowupConversation | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const quota = row.quota;
  if (typeof row.analysisId !== "string" || !Array.isArray(row.messages) || !row.messages.every(isMessage) || typeof quota !== "object" || quota === null) return null;
  const q = quota as Record<string, unknown>;
  if ((q.planCode !== "free" && q.planCode !== "pro") || ![q.used, q.limit, q.remaining].every((item) => typeof item === "number" && Number.isSafeInteger(item))) return null;
  return { analysisId: row.analysisId, messages: row.messages, quota: { planCode: q.planCode, used: q.used as number, limit: q.limit as number, remaining: q.remaining as number } };
}

async function request(path: string, init?: RequestInit): Promise<FollowupConversation> {
  const token = await getAccessToken();
  if (!token) throw new FollowupClientError("authentication_required");
  const response = await fetch(path, { ...init, headers: {
    Authorization: `Bearer ${token}`,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...Object.fromEntries(new Headers(init?.headers)),
  } });
  const payload = await response.json().catch(() => null) as ApiPayload | null;
  const conversation = parseConversation(payload?.conversation);
  if (!response.ok || !conversation) throw new FollowupClientError(typeof payload?.error?.code === "string" ? payload.error.code : "followup_unavailable");
  return conversation;
}

export function loadFollowupConversation(analysisId: string): Promise<FollowupConversation> {
  return request(`/api/followups?analysisId=${encodeURIComponent(analysisId)}`);
}

export function askFollowupQuestion(input: { analysisId: string; question: string; selectedText: string | null }): Promise<FollowupConversation> {
  return request("/api/followups", { method: "POST", body: JSON.stringify(input) });
}

export async function deleteFollowupsForAnalysis(analysisId: string, suppliedAccessToken?: string): Promise<void> {
  const token = suppliedAccessToken || await getAccessToken();
  if (!token) return;
  await fetch(`/api/followups?analysisId=${encodeURIComponent(analysisId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
}
