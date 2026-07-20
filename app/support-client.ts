"use client";

import { getAccessToken } from "./supabase-auth";
import type { SupportAction, SupportCategory, SupportConversation, SupportConversationDetail, SupportMessage, SupportSnapshot, SupportStatus } from "./support-types";

export class SupportRequestError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "SupportRequestError";
  }
}

type SupportPayload = { snapshot?: unknown; conversation?: unknown; error?: { code?: unknown } };

function string(value: unknown): value is string {
  return typeof value === "string";
}

function category(value: unknown): value is SupportCategory {
  return value === "question" || value === "bug" || value === "feature";
}

function status(value: unknown): value is SupportStatus {
  return value === "open" || value === "waiting_for_user" || value === "resolved";
}

function conversation(value: unknown): value is SupportConversation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return string(item.id) && string(item.subject) && category(item.category) && status(item.status)
    && typeof item.createdAt === "number" && typeof item.updatedAt === "number" && typeof item.lastMessageAt === "number"
    && (item.lastMessagePreview === null || string(item.lastMessagePreview))
    && (item.ownerReference === null || string(item.ownerReference));
}

function message(value: unknown): value is SupportMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return string(item.id) && (item.sender === "user" || item.sender === "support") && string(item.body) && typeof item.createdAt === "number";
}

function detail(value: unknown): value is SupportConversationDetail {
  return conversation(value) && Array.isArray((value as SupportConversationDetail).messages)
    && (value as SupportConversationDetail).messages.every(message);
}

function snapshot(value: unknown): value is SupportSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.isAdmin === "boolean" && Array.isArray(item.conversations) && item.conversations.every(conversation);
}

async function request(path: string, init: RequestInit = {}): Promise<{ snapshot: SupportSnapshot; conversation: SupportConversationDetail | null }> {
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
  return { snapshot: payload.snapshot, conversation: detail(payload.conversation) ? payload.conversation : null };
}

export function loadSupport(conversationId?: string): Promise<{ snapshot: SupportSnapshot; conversation: SupportConversationDetail | null }> {
  return request(`/api/support${conversationId ? `?conversation=${encodeURIComponent(conversationId)}` : ""}`);
}

export function updateSupport(action: SupportAction): Promise<{ snapshot: SupportSnapshot; conversation: SupportConversationDetail | null }> {
  return request("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
}
