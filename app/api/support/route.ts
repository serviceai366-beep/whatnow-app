import { isSupportAdministrator } from "../../support-admin.ts";
import { getSupportStore, SupportStoreError } from "../../support-store.ts";
import type { SupportSnapshot } from "../../support-types.ts";
import { parseSupportAction } from "../../support-validation.ts";
import { isSameOriginRequest } from "../../security.ts";
import { verifySupabaseRequest } from "../../supabase-server-auth.ts";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

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
  return { isAdmin, conversations };
}

function storeError(value: unknown): Response {
  if (value instanceof SupportStoreError) {
    return error(value.code, value.status, value.status === 429 ? { "Retry-After": "600" } : {});
  }
  return error("support_storage_unavailable", 503);
}

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return error("forbidden", 403);
  const auth = await authenticated(request);
  if ("response" in auth) return auth.response;
  const store = await getSupportStore();
  if (!store) return error("support_storage_unavailable", 503);
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
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return error("invalid_request", 415);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return error("invalid_request", 413);
  const action = parseSupportAction((() => {
    try { return JSON.parse(rawBody) as unknown; }
    catch { return null; }
  })());
  if (!action) return error("invalid_request", 400);
  const auth = await authenticated(request);
  if ("response" in auth) return auth.response;
  const store = await getSupportStore();
  if (!store) return error("support_storage_unavailable", 503);

  try {
    let conversation;
    if (action.action === "create") {
      conversation = await store.createConversation({ userId: auth.user.id, ...action });
    } else if (action.action === "reply") {
      conversation = await store.addReply({ userId: auth.user.id, conversationId: action.conversationId, message: action.message, isAdmin: auth.isAdmin });
    } else {
      if (!auth.isAdmin) return error("forbidden", 403);
      conversation = await store.setStatus(action.conversationId, action.status);
      if (!conversation) return error("support_not_found", 404);
    }
    const conversations = await store.listConversations(auth.user.id, auth.isAdmin);
    return json({ snapshot: snapshot(auth.isAdmin, conversations), conversation }, action.action === "create" ? 201 : 200);
  } catch (cause) {
    return storeError(cause);
  }
}
