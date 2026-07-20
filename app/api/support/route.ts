import { isSupportAdministrator } from "../../support-admin.ts";
import { drainSupportAttachmentDeletions, saveSupportAttachments, SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_FILES_PER_MESSAGE, SupportAttachmentError, validateSupportAttachmentUploads } from "../../support-attachment-store.ts";
import { sendSupportNotification, supportEmailConfigured } from "../../support-email.ts";
import { getSupportStore, SupportStoreError } from "../../support-store.ts";
import type { SupportSnapshot } from "../../support-types.ts";
import { parseSupportAction } from "../../support-validation.ts";
import { isSameOriginRequest } from "../../security.ts";
import { verifySupabaseRequest } from "../../supabase-server-auth.ts";

export const dynamic = "force-dynamic";

const MAX_JSON_BODY_BYTES = 8 * 1024;
const MAX_MULTIPART_BODY_BYTES = 7 * 1024 * 1024;

const responseHeaders = {
  "Cache-Control": "no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

type SupportErrorCode =
  | "authentication_required"
  | "authentication_invalid"
  | "authentication_unavailable"
  | "legal_acceptance_required"
  | "forbidden"
  | "invalid_request"
  | "support_not_found"
  | "support_conversation_limit"
  | "support_message_limit"
  | "support_rate_limited"
  | "support_attachment_invalid"
  | "support_attachment_too_large"
  | "support_attachment_limit"
  | "support_attachment_unavailable"
  | "support_storage_unavailable";

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { ...responseHeaders, ...Object.fromEntries(new Headers(headers)) } });
}

function error(code: SupportErrorCode, status: number, headers: HeadersInit = {}): Response {
  return json({ error: { code } }, status, headers);
}

async function authenticated(request: Request) {
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) return { response: error(auth.code, auth.status) } as const;
  return { user: auth.user, isAdmin: isSupportAdministrator(auth.user.email) } as const;
}

function snapshot(isAdmin: boolean, conversations: SupportSnapshot["conversations"]): SupportSnapshot {
  return { isAdmin, emailNotificationsEnabled: supportEmailConfigured(), conversations };
}

function storeError(value: unknown): Response {
  if (value instanceof SupportStoreError) {
    return error(value.code, value.status, value.status === 429 ? { "Retry-After": "600" } : {});
  }
  return error("support_storage_unavailable", 503);
}

function attachmentError(value: unknown): SupportErrorCode {
  return value instanceof SupportAttachmentError ? value.code : "support_attachment_unavailable";
}

async function parseRequest(request: Request): Promise<{
  action: ReturnType<typeof parseSupportAction>;
  files: Array<{ name: string; declaredMimeType: string; bytes: Uint8Array }>;
} | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) return null;
  if (contentType.startsWith("application/json")) {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_JSON_BODY_BYTES) return null;
    const value = (() => { try { return JSON.parse(rawBody) as unknown; } catch { return null; } })();
    return { action: parseSupportAction(value), files: [] };
  }
  if (!contentType.startsWith("multipart/form-data") || declaredLength <= 0 || declaredLength > MAX_MULTIPART_BODY_BYTES) return null;
  const form = await request.formData().catch(() => null);
  if (!form || typeof form.get("action") !== "string") return null;
  const value = (() => { try { return JSON.parse(String(form.get("action"))) as unknown; } catch { return null; } })();
  const uploads = form.getAll("attachments");
  if (uploads.length > SUPPORT_ATTACHMENT_MAX_FILES_PER_MESSAGE || !uploads.every((item) => item instanceof File)) return null;
  if ((uploads as File[]).some((file) => file.size <= 0 || file.size > SUPPORT_ATTACHMENT_MAX_BYTES)) return null;
  const files = await Promise.all((uploads as File[]).map(async (file) => ({
    name: file.name,
    declaredMimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  })));
  return { action: parseSupportAction(value), files };
}

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return error("forbidden", 403);
  const auth = await authenticated(request);
  if ("response" in auth) return auth.response;
  const store = await getSupportStore();
  if (!store) return error("support_storage_unavailable", 503);
  if (auth.isAdmin) await drainSupportAttachmentDeletions().catch(() => undefined);
  try {
    const conversations = await store.listConversations(auth.user.id, auth.isAdmin);
    const id = new URL(request.url).searchParams.get("conversation");
    const conversation = id ? await store.getConversation(auth.user.id, id, auth.isAdmin) : null;
    return json({ snapshot: snapshot(auth.isAdmin, conversations), conversation });
  } catch (cause) {
    return storeError(cause);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return error("forbidden", 403);
  const parsed = await parseRequest(request);
  const action = parsed?.action ?? null;
  if (!action) return error("invalid_request", 400);
  if (parsed.files.length > 0 && action.action !== "create" && action.action !== "reply") return error("invalid_request", 400);
  try { validateSupportAttachmentUploads(parsed.files); }
  catch (cause) { return error(attachmentError(cause), cause instanceof SupportAttachmentError ? cause.status : 400); }
  const auth = await authenticated(request);
  if ("response" in auth) return auth.response;
  const store = await getSupportStore();
  if (!store) return error("support_storage_unavailable", 503);
  if (auth.isAdmin) await drainSupportAttachmentDeletions().catch(() => undefined);

  try {
    let conversation;
    let attachmentWarning: SupportErrorCode | null = null;
    let notificationWarning: "support_email_failed" | null = null;
    if (action.action === "create") {
      conversation = await store.createConversation({ userId: auth.user.id, contactEmail: auth.user.email, ...action });
    } else if (action.action === "reply") {
      conversation = await store.addReply({ userId: auth.user.id, conversationId: action.conversationId, message: action.message, locale: action.locale, isAdmin: auth.isAdmin });
    } else if (action.action === "set_status") {
      if (!auth.isAdmin) return error("forbidden", 403);
      conversation = await store.setStatus(action.conversationId, action.status);
      if (!conversation) return error("support_not_found", 404);
    } else if (action.action === "set_priority") {
      if (!auth.isAdmin) return error("forbidden", 403);
      conversation = await store.setPriority(action.conversationId, action.priority);
      if (!conversation) return error("support_not_found", 404);
    } else {
      if (!auth.isAdmin) return error("forbidden", 403);
      const existing = await store.getConversation(auth.user.id, action.conversationId, true);
      if (!existing) return error("support_not_found", 404);
      if (!await store.deleteConversation(action.conversationId)) return error("support_not_found", 404);
      await drainSupportAttachmentDeletions().catch(() => undefined);
      conversation = null;
    }
    if (parsed.files.length > 0 && conversation && (action.action === "create" || action.action === "reply")) {
      const messageId = conversation.messages.at(-1)?.id;
      if (messageId) {
        try {
          await saveSupportAttachments({ conversationId: conversation.id, messageId, files: parsed.files });
          conversation = await store.getConversation(auth.user.id, conversation.id, auth.isAdmin) ?? conversation;
        } catch (cause) {
          attachmentWarning = attachmentError(cause);
        }
      }
    }
    if (conversation && (action.action === "create" || action.action === "reply")) {
      const context = await store.notificationContext(conversation.id);
      if (context) {
        const delivery = await sendSupportNotification({
          kind: action.action === "create" ? "new_ticket" : auth.isAdmin ? "support_reply" : "user_reply",
          contactEmail: context.contactEmail,
          locale: context.locale,
          ticketSubject: context.subject,
          ticketId: conversation.id,
          priority: context.priority,
        });
        if (delivery.configured && !delivery.sent) notificationWarning = "support_email_failed";
      }
    }
    const conversations = await store.listConversations(auth.user.id, auth.isAdmin);
    return json({ snapshot: snapshot(auth.isAdmin, conversations), conversation, attachmentWarning, notificationWarning }, action.action === "create" ? 201 : 200);
  } catch (cause) {
    return storeError(cause);
  }
}
