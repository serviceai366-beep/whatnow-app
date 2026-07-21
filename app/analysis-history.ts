import type { AnalysisResult, SupportedLanguage } from "./analysis-schema";
import { supportedLanguages, validateAnalysisResult } from "./analysis-schema";
import { getAccessToken } from "./supabase-auth";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config";
import { deleteFollowupsForAnalysis } from "./followup-client";

export const ANALYSIS_HISTORY_LIMIT = 10;

export type AnalysisHistoryItem = {
  id: string;
  createdAt: string;
  title: string;
  sourceKind: "file" | "text";
  language: SupportedLanguage;
  result: AnalysisResult;
};

type HistoryRow = {
  id?: unknown;
  created_at?: unknown;
  title?: unknown;
  source_kind?: unknown;
  language?: unknown;
  result?: unknown;
};

type HistoryIdRow = { id?: unknown };

function isLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && supportedLanguages.includes(value as SupportedLanguage);
}

function parseRow(row: HistoryRow): AnalysisHistoryItem | null {
  if (
    typeof row.id !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.title !== "string" ||
    (row.source_kind !== "file" && row.source_kind !== "text") ||
    !isLanguage(row.language) ||
    !validateAnalysisResult(row.result)
  ) return null;

  return {
    id: row.id,
    createdAt: row.created_at,
    title: row.title,
    sourceKind: row.source_kind,
    language: row.language,
    result: row.result,
  };
}

async function authenticatedRequest(path: string, init?: RequestInit, suppliedAccessToken?: string): Promise<Response> {
  const accessToken = suppliedAccessToken || await getAccessToken();
  if (!accessToken) throw new Error("not_authenticated");
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function trimAnalysisHistory(suppliedAccessToken?: string): Promise<void> {
  const response = await authenticatedRequest(
    `document_analyses?select=id&order=created_at.desc,id.desc&offset=${ANALYSIS_HISTORY_LIMIT}&limit=100`,
    undefined,
    suppliedAccessToken,
  );
  if (!response.ok) throw new Error("history_trim_load_failed");

  const rows = await response.json() as HistoryIdRow[];
  const ids = Array.isArray(rows)
    ? rows.map((row) => row.id).filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
    : [];
  if (ids.length === 0) return;

  await Promise.all(ids.map((id) => deleteFollowupsForAnalysis(id, suppliedAccessToken)));

  const deletion = await authenticatedRequest(
    `document_analyses?id=in.(${ids.join(",")})`,
    { method: "DELETE" },
    suppliedAccessToken,
  );
  if (!deletion.ok) throw new Error("history_trim_delete_failed");
}

export async function listAnalysisHistory(): Promise<AnalysisHistoryItem[]> {
  await trimAnalysisHistory();
  const response = await authenticatedRequest(
    `document_analyses?select=id,created_at,title,source_kind,language,result&order=created_at.desc,id.desc&limit=${ANALYSIS_HISTORY_LIMIT}`,
  );
  if (!response.ok) throw new Error("history_load_failed");
  const rows = await response.json() as HistoryRow[];
  return Array.isArray(rows) ? rows.map(parseRow).filter((item): item is AnalysisHistoryItem => Boolean(item)) : [];
}

export async function saveAnalysisToHistory(input: {
  title: string;
  sourceKind: "file" | "text";
  language: SupportedLanguage;
  result: AnalysisResult;
  accessToken?: string;
}): Promise<AnalysisHistoryItem> {
  await trimAnalysisHistory(input.accessToken);
  const response = await authenticatedRequest("document_analyses?select=id,created_at,title,source_kind,language,result", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      title: input.title.trim().slice(0, 160) || "WhatNow?",
      source_kind: input.sourceKind,
      language: input.language,
      result: input.result,
    }),
  }, input.accessToken);
  if (!response.ok) throw new Error("history_save_failed");
  const rows = await response.json() as HistoryRow[];
  const item = Array.isArray(rows) ? parseRow(rows[0] ?? {}) : null;
  if (!item) throw new Error("history_invalid_response");
  try {
    await trimAnalysisHistory(input.accessToken);
  } catch (error) {
    await deleteAnalysisFromHistory(item.id, input.accessToken).catch(() => undefined);
    throw error;
  }
  return item;
}

export async function deleteAnalysisFromHistory(id: string, suppliedAccessToken?: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("history_invalid_id");
  await deleteFollowupsForAnalysis(id, suppliedAccessToken);
  const response = await authenticatedRequest(`document_analyses?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  }, suppliedAccessToken);
  if (!response.ok) throw new Error("history_delete_failed");
}
