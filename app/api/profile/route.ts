import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../../supabase-config.ts";
import { isSameOriginRequest } from "../../security.ts";
import { requestBearerToken, verifySupabaseRequest } from "../../supabase-server-auth.ts";
import {
  parseUserProfilePatch,
  profilePatchToRpcPayload,
  profilePreferencesFromDatabaseRow,
} from "../../profile-validation.ts";

const MAX_BODY_BYTES = 8 * 1024;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function apiError(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status);
}

async function authenticate(request: Request) {
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) return { response: apiError(auth.code, "A confirmed account is required.", auth.status) } as const;
  const token = requestBearerToken(request);
  if (!token) return { response: apiError("authentication_required", "Sign in is required.", 401) } as const;
  return { token } as const;
}

async function supabaseRpc(name: "get_user_profile" | "update_user_profile", token: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
}

function rowFromRpcPayload(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
}

async function profileFromRpc(response: Response) {
  if (!response.ok) return null;
  const row = rowFromRpcPayload(await response.json().catch(() => null));
  return profilePreferencesFromDatabaseRow(row);
}

async function readBoundedJson(request: Request): Promise<unknown | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return null;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (!text || new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return apiError("forbidden", "The request origin was rejected.", 403);
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  try {
    const profile = await profileFromRpc(await supabaseRpc("get_user_profile", auth.token, {}));
    return profile ? jsonResponse({ profile }) : apiError("profile_storage_unavailable", "Profile settings are unavailable.", 503);
  } catch {
    return apiError("profile_storage_unavailable", "Profile settings are unavailable.", 503);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return apiError("forbidden", "The request origin was rejected.", 403);
  const body = await readBoundedJson(request);
  const patch = parseUserProfilePatch(body);
  if (!patch) return apiError("invalid_profile", "Profile settings are invalid.", 400);

  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  try {
    const profile = await profileFromRpc(await supabaseRpc("update_user_profile", auth.token, profilePatchToRpcPayload(patch)));
    return profile ? jsonResponse({ profile }) : apiError("profile_storage_unavailable", "Profile settings are unavailable.", 503);
  } catch {
    return apiError("profile_storage_unavailable", "Profile settings are unavailable.", 503);
  }
}
