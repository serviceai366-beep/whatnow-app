import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config";

export type SupabaseAccount = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: Record<string, unknown>;
};

const SESSION_KEY = "whatnow.supabase.session.v1";

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function accountFromUser(user: Record<string, unknown>): SupabaseAccount | null {
  const email = typeof user.email === "string" ? user.email : "";
  const id = typeof user.id === "string" ? user.id : "";
  if (!email || !id) return null;

  const metadata = user.user_metadata && typeof user.user_metadata === "object"
    ? user.user_metadata as Record<string, unknown>
    : {};
  const name = [metadata.full_name, metadata.name, metadata.user_name]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const avatar = [metadata.avatar_url, metadata.picture]
    .find((value): value is string => typeof value === "string" && value.startsWith("https://"));

  return {
    id,
    email,
    displayName: name?.trim() || email.split("@")[0] || email,
    avatarUrl: avatar ?? null,
  };
}

function readStoredSession(): StoredSession | null {
  try {
    const value = window.localStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as Partial<StoredSession>;
    if (
      typeof session.accessToken !== "string" ||
      typeof session.refreshToken !== "string" ||
      typeof session.expiresAt !== "number" ||
      !session.user ||
      typeof session.user !== "object"
    ) return null;
    return session as StoredSession;
  } catch {
    return null;
  }
}

function storeSession(session: StoredSession): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}

function sessionFromLocation(): StoredSession | null {
  const parameters = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = parameters.get("access_token");
  const refreshToken = parameters.get("refresh_token");
  const expiresIn = Number(parameters.get("expires_in"));
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) return null;

  const tokenParts = accessToken.split(".");
  if (tokenParts.length !== 3) return null;
  try {
    const encoded = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const userMetadata = payload.user_metadata && typeof payload.user_metadata === "object"
      ? payload.user_metadata
      : {};
    const session: StoredSession = {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
      user: {
        id: payload.sub,
        email: payload.email,
        user_metadata: userMetadata,
      },
    };
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    storeSession(session);
    return session;
  } catch {
    return null;
  }
}

async function refreshSession(session: StoredSession): Promise<StoredSession | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user?: Record<string, unknown>;
    };
    if (!payload.access_token || !payload.refresh_token || !payload.expires_in || !payload.user) return null;
    const refreshed: StoredSession = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + payload.expires_in * 1000,
      user: payload.user,
    };
    storeSession(refreshed);
    return refreshed;
  } catch {
    return null;
  }
}

export async function loadAccount(): Promise<SupabaseAccount | null> {
  if (!isSupabaseConfigured()) return null;
  let session = sessionFromLocation() ?? readStoredSession();
  if (!session) return null;
  if (session.expiresAt <= Date.now() + 60_000) session = await refreshSession(session);
  if (!session) {
    clearSession();
    return null;
  }
  return accountFromUser(session.user);
}

export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  let session = readStoredSession();
  if (!session) return null;
  if (session.expiresAt <= Date.now() + 60_000) session = await refreshSession(session);
  if (!session) {
    clearSession();
    return null;
  }
  return session.accessToken;
}

export function startGoogleSignIn(): void {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const authorizeUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authorizeUrl.searchParams.set("provider", "google");
  authorizeUrl.searchParams.set("redirect_to", redirectTo);
  window.location.assign(authorizeUrl.toString());
}

export async function sendEmailSignInLink(email: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { msg?: string; message?: string } | null;
    throw new Error(payload?.msg || payload?.message || "Email sign-in failed");
  }
}

export async function signOutAccount(): Promise<void> {
  const session = readStoredSession();
  clearSession();
  if (!session || !isSupabaseConfigured()) return;
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.accessToken}` },
    });
  } catch {
    // Local sign-out is complete even if remote cleanup is unavailable.
  }
}
