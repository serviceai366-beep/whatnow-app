"use client";

import { getAccessToken } from "./supabase-auth";
import type { SupportAction, SupportAttachment, SupportCategory, SupportConversation, SupportConversationDetail, SupportMessage, SupportPriority, SupportSnapshot, SupportStatus } from "./support-types";

export class SupportRequestError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "SupportRequestError";
  }
}

type SupportPayload = { snapshot?: unknown; conversation?: unknown; attachmentWarning?: unknown; notificationWarning?: unknown; error?: { code?: unknown } };
export type SupportUpdateResult = { snapshot: SupportSnapshot; conversation: SupportConversationDetail | null; attachmentWarning: string | null; notificationWarning: string | null };

function string(value: unknown): value is string {
  return typeof value === "string";
}

function category(value: unknown): value is SupportCategory {
  return value === "question" || value === "bug" || value === "feature";
}

function status(value: unknown): value is SupportStatus {
  return value === "open" || value === "waiting_for_user" || value === "resolved";
}

function priority(value: unknown): value is SupportPriority {
  return value === "low" || value === "normal" || value === "high" || value === "urgent";
}

function attachment(value: unknown): value is SupportAttachment {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return string(item.id) && string(item.name) && (item.mimeType === "image/jpeg" || item.mimeType === "image/png" || item.mimeType === "image/webp")
    && typeof item.sizeBytes === "number" && item.sizeBytes > 0 && typeof item.createdAt === "number";
}

function conversation(value: unknown): value is SupportConversation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return string(item.id) && string(item.subject) && category(item.category) && status(item.status) && priority(item.priority)
    && typeof item.createdAt === "number" && typeof item.updatedAt === "number" && typeof item.lastMessageAt === "number"
    && (item.lastMessagePreview === null || string(item.lastMessagePreview))
    && (item.ownerReference === null || string(item.ownerReference));
}

function message(value: unknown): value is SupportMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return string(item.id) && (item.sender === "user" || item.sender === "support") && string(item.body) && typeof item.createdAt === "number"
    && Array.isArray(item.attachments) && item.attachments.every(attachment);
}

function detail(value: unknown): value is SupportConversationDetail {
  return conversation(value) && Array.isArray((value as SupportConversationDetail).messages)
    && (value as SupportConversationDetail).messages.every(message);
}

function snapshot(value: unknown): value is SupportSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.isAdmin === "boolean" && typeof item.emailNotificationsEnabled === "boolean"
    && Array.isArray(item.conversations) && item.conversations.every(conversation);
}

async function request(path: string, init: RequestInit = {}): Promise<SupportUpdateResult> {
  const token = await getAccessToken();
  if (!token) throw new SupportRequestError("authentication_required", 401);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers, cache: "no-store", credentials: "same-origin" });
  const payload = await response.json().catch(() => null) as SupportPayload | null;
  if (!response.ok) throw new SupportRequestError(string(payload?.error?.code) ? payload.error.code : "support_error", response.status);
  if (!snapshot(payload?.snapshot) || (payload?.conversation !== null && payload?.conversation !== undefined && !detail(payload.conversation))) {
    throw new SupportRequestError("invalid_support_response", 502);
  }
  return {
    snapshot: payload.snapshot,
    conversation: detail(payload.conversation) ? payload.conversation : null,
    attachmentWarning: string(payload.attachmentWarning) ? payload.attachmentWarning : null,
    notificationWarning: string(payload.notificationWarning) ? payload.notificationWarning : null,
  };
}

export function loadSupport(conversationId?: string): Promise<SupportUpdateResult> {
  return request(`/api/support${conversationId ? `?conversation=${encodeURIComponent(conversationId)}` : ""}`);
}

export function updateSupport(action: SupportAction, attachments: File[] = []): Promise<SupportUpdateResult> {
  if (attachments.length === 0) {
    return request("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
  }
  const form = new FormData();
  form.set("action", JSON.stringify(action));
  for (const attachment of attachments) form.append("attachments", attachment);
  return request("/api/support", { method: "POST", body: form });
}

export async function openSupportAttachment(id: string, name: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new SupportRequestError("authentication_required", 401);
  const response = await fetch(`/api/support/attachments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", credentials: "same-origin",
  });
  if (!response.ok) throw new SupportRequestError("support_attachment_unavailable", response.status);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
