"use client";

import { getAccessToken } from "./supabase-auth";
import type { FileStorageSnapshot, StoredUserFile } from "./file-store";

type ApiErrorPayload = {
  error?: { code?: string; retryable?: boolean };
};

export class FileClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "FileClientError";
  }
}

async function accessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new FileClientError("authentication_required", 401, false);
  return token;
}

async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  if (response.ok) return response;
  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  throw new FileClientError(
    payload?.error?.code ?? "file_storage_unavailable",
    response.status,
    payload?.error?.retryable === true,
  );
}

function isStoredFile(value: unknown): value is StoredUserFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return typeof file.id === "string" && typeof file.originalName === "string"
    && typeof file.extension === "string" && typeof file.mimeType === "string"
    && typeof file.sizeBytes === "number" && typeof file.sha256 === "string"
    && typeof file.createdAt === "number";
}

function parseSnapshot(value: unknown): FileStorageSnapshot {
  if (!value || typeof value !== "object") throw new FileClientError("invalid_storage_response", 502, true);
  const payload = value as Record<string, unknown>;
  const usage = payload.usage as Record<string, unknown> | undefined;
  if (!Array.isArray(payload.files) || !payload.files.every(isStoredFile) || !usage) {
    throw new FileClientError("invalid_storage_response", 502, true);
  }
  const fields = ["count", "countLimit", "remainingCount", "bytes", "bytesLimit", "remainingBytes"] as const;
  if (!fields.every((field) => typeof usage[field] === "number" && Number.isFinite(usage[field]))) {
    throw new FileClientError("invalid_storage_response", 502, true);
  }
  return {
    files: payload.files,
    usage: {
      count: usage.count as number,
      countLimit: usage.countLimit as number,
      remainingCount: usage.remainingCount as number,
      bytes: usage.bytes as number,
      bytesLimit: usage.bytesLimit as number,
      remainingBytes: usage.remainingBytes as number,
    },
  };
}

export async function loadStoredFiles(): Promise<FileStorageSnapshot> {
  const response = await apiRequest("/api/files");
  return parseSnapshot(await response.json());
}

export async function uploadStoredFile(file: File): Promise<{ file: StoredUserFile; deduplicated: boolean }> {
  const body = new FormData();
  body.set("file", file);
  const response = await apiRequest("/api/files", { method: "POST", body });
  const payload = await response.json().catch(() => null) as { file?: unknown; deduplicated?: unknown } | null;
  if (!isStoredFile(payload?.file) || typeof payload?.deduplicated !== "boolean") {
    throw new FileClientError("invalid_storage_response", 502, true);
  }
  return { file: payload.file, deduplicated: payload.deduplicated };
}

export async function deleteStoredFile(id: string): Promise<void> {
  await apiRequest(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function downloadStoredFile(file: StoredUserFile): Promise<void> {
  const response = await apiRequest(`/api/files/${encodeURIComponent(file.id)}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.originalName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function loadStoredFile(file: StoredUserFile): Promise<File> {
  const response = await apiRequest(`/api/files/${encodeURIComponent(file.id)}`);
  const blob = await response.blob();
  return new File([blob], file.originalName, { type: file.mimeType, lastModified: file.createdAt });
}
