import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.ts";

export type VerifiedSupabaseUser = { id: string; email: string };

export type SupabaseAuthResult =
  | { ok: true; user: VerifiedSupabaseUser }
  | { ok: false; code: "authentication_required" | "authentication_invalid" | "authentication_unavailable"; status: 401 | 503 };

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  if (!match || match[1].length > 4096) return null;
  return match[1];
}

export async function verifySupabaseRequest(
  request: Request,
  fetchImpl: typeof fetch = fetch,
): Promise<SupabaseAuthResult> {
  const token = bearerToken(request);
  if (!token) return { ok: false, code: "authentication_required", status: 401 };
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, code: "authentication_unavailable", status: 503 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, code: "authentication_invalid", status: 401 };
    }
    if (!response.ok) return { ok: false, code: "authentication_unavailable", status: 503 };

    const user = await response.json().catch(() => null) as Record<string, unknown> | null;
    const id = typeof user?.id === "string" ? user.id : "";
    const email = typeof user?.email === "string" ? user.email.trim() : "";
    const confirmed = typeof user?.email_confirmed_at === "string" || typeof user?.confirmed_at === "string";
    if (!id || !email || !confirmed || user?.is_anonymous === true) {
      return { ok: false, code: "authentication_invalid", status: 401 };
    }
    return { ok: true, user: { id, email } };
  } catch {
    return { ok: false, code: "authentication_unavailable", status: 503 };
  } finally {
    clearTimeout(timeout);
  }
}
