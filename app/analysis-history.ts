import type { AnalysisResult, SupportedLanguage } from "./analysis-schema";
import { validateAnalysisResult } from "./analysis-schema";
import { getAccessToken } from "./supabase-auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

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

function isLanguage(value: unknown): value is SupportedLanguage {
  return value === "ru" || value === "lv" || value === "en";
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

async function authenticatedRequest(path: string, init?: RequestInit): Promise<Response> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("not_authenticated");
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function listAnalysisHistory(): Promise<AnalysisHistoryItem[]> {
  const response = await authenticatedRequest(
    "document_analyses?select=id,created_at,title,source_kind,language,result&order=created_at.desc&limit=50",
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
}): Promise<AnalysisHistoryItem> {
  const response = await authenticatedRequest("document_analyses?select=id,created_at,title,source_kind,language,result", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      title: input.title.trim().slice(0, 160) || "WhatNow?",
      source_kind: input.sourceKind,
      language: input.language,
      result: input.result,
    }),
  });
  if (!response.ok) throw new Error("history_save_failed");
  const rows = await response.json() as HistoryRow[];
  const item = Array.isArray(rows) ? parseRow(rows[0] ?? {}) : null;
  if (!item) throw new Error("history_invalid_response");
  return item;
}

export async function deleteAnalysisFromHistory(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("history_invalid_id");
  const response = await authenticatedRequest(`document_analyses?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("history_delete_failed");
}
