import { supportCategories, supportPriorities, supportStatuses, type SupportAction, type SupportCategory, type SupportPriority, type SupportStatus } from "./support-types.ts";

export const SUPPORT_SUBJECT_MAX_LENGTH = 140;
export const SUPPORT_MESSAGE_MAX_LENGTH = 4_000;

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!normalized || Array.from(normalized).length > limit) return null;
  return normalized;
}

function supportId(value: unknown): string | null {
  return typeof value === "string" && idPattern.test(value) ? value : null;
}

function category(value: unknown): SupportCategory | null {
  return typeof value === "string" && supportCategories.includes(value as SupportCategory)
    ? value as SupportCategory
    : null;
}

function status(value: unknown): SupportStatus | null {
  return typeof value === "string" && supportStatuses.includes(value as SupportStatus)
    ? value as SupportStatus
    : null;
}

function priority(value: unknown): SupportPriority | null {
  return typeof value === "string" && supportPriorities.includes(value as SupportPriority)
    ? value as SupportPriority
    : null;
}

function locale(value: unknown): "en" | "ru" | "lv" | null {
  return value === "en" || value === "ru" || value === "lv" ? value : null;
}

export function parseSupportAction(value: unknown): SupportAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.action === "create") {
    const subject = cleanText(input.subject, SUPPORT_SUBJECT_MAX_LENGTH);
    const message = cleanText(input.message, SUPPORT_MESSAGE_MAX_LENGTH);
    const parsedCategory = category(input.category);
    const parsedLocale = locale(input.locale);
    return subject && message && parsedCategory && parsedLocale ? { action: "create", subject, category: parsedCategory, message, locale: parsedLocale } : null;
  }
  if (input.action === "reply") {
    const conversationId = supportId(input.conversationId);
    const message = cleanText(input.message, SUPPORT_MESSAGE_MAX_LENGTH);
    const parsedLocale = locale(input.locale);
    return conversationId && message && parsedLocale ? { action: "reply", conversationId, message, locale: parsedLocale } : null;
  }
  if (input.action === "set_status") {
    const conversationId = supportId(input.conversationId);
    const parsedStatus = status(input.status);
    return conversationId && parsedStatus ? { action: "set_status", conversationId, status: parsedStatus } : null;
  }
  if (input.action === "set_priority") {
    const conversationId = supportId(input.conversationId);
    const parsedPriority = priority(input.priority);
    return conversationId && parsedPriority ? { action: "set_priority", conversationId, priority: parsedPriority } : null;
  }
  if (input.action === "delete") {
    const conversationId = supportId(input.conversationId);
    return conversationId ? { action: "delete", conversationId } : null;
  }
  return null;
}
