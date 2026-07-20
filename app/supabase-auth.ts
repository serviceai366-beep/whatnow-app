import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config";
import {
  LEGAL_EFFECTIVE_AT,
  PRIVACY_VERSION,
  TERMS_VERSION,
  hasCurrentLegalAcceptance,
  legalAcceptanceMetadata,
} from "./legal";

export type SupabaseAccount = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  requiresLegalAcceptance: boolean;
};

export type AccountAccessMode = "sign-in" | "create-account";

const PENDING_LEGAL_ACCEPTANCE_KEY = "whatnow.pending-legal-acceptance.v1";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function getClient(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
  if (typeof window === "undefined") throw new Error("Supabase auth is browser-only");
  // Remove the legacy hand-rolled implicit-flow session. It is intentionally
  // not migrated: users authenticate once more through the safer PKCE flow.
  window.localStorage.removeItem("whatnow.supabase.session.v1");
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  });
  return client;
}

function accountFromUser(user: User): SupabaseAccount | null {
  const email = user.email?.trim() ?? "";
  if (!email || !user.id || !user.email_confirmed_at || user.is_anonymous) return null;
  const metadata = user.user_metadata ?? {};
  const name = [metadata.full_name, metadata.name, metadata.user_name]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const avatar = [metadata.avatar_url, metadata.picture]
    .find((value): value is string => typeof value === "string" && value.startsWith("https://"));
  const createdAt = Date.parse(user.created_at ?? "");
  const createdAfterLegalLaunch = Number.isFinite(createdAt) && createdAt >= Date.parse(LEGAL_EFFECTIVE_AT);
  return {
    id: user.id,
    email,
    displayName: name?.trim() || email.split("@")[0] || email,
    avatarUrl: avatar ?? null,
    // Accounts that existed before this feature are grandfathered. Every new
    // account must have the current acceptance metadata before using the app.
    requiresLegalAcceptance: createdAfterLegalLaunch && !hasCurrentLegalAcceptance(metadata),
  };
}

function rememberPendingLegalAcceptance(accepted: boolean): void {
  if (typeof window === "undefined") return;
  if (!accepted) {
    window.sessionStorage.removeItem(PENDING_LEGAL_ACCEPTANCE_KEY);
    return;
  }
  window.sessionStorage.setItem(PENDING_LEGAL_ACCEPTANCE_KEY, JSON.stringify({
    ...legalAcceptanceMetadata(),
    expiresAt: Date.now() + 15 * 60_000,
  }));
}

function takePendingLegalAcceptance(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.sessionStorage.getItem(PENDING_LEGAL_ACCEPTANCE_KEY);
  window.sessionStorage.removeItem(PENDING_LEGAL_ACCEPTANCE_KEY);
  if (!raw) return false;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return value.terms_version === TERMS_VERSION
      && value.privacy_version === PRIVACY_VERSION
      && typeof value.expiresAt === "number"
      && value.expiresAt >= Date.now();
  } catch {
    return false;
  }
}

function authRedirectUrl(): string {
  // Production uses the exact, wildcard-free Site URL configured in Supabase.
  return new URL("/", window.location.origin).toString();
}

function cleanAuthUrl(): void {
  const url = new URL(window.location.href);
  const hadAuthData = url.searchParams.has("code") || url.searchParams.has("auth_return")
    || url.searchParams.has("error") || url.searchParams.has("error_description") || Boolean(url.hash);
  if (!hadAuthData) return;
  url.searchParams.delete("code");
  url.searchParams.delete("auth_return");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

export async function loadAccount(): Promise<SupabaseAccount | null> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return null;
  const auth = getClient().auth;
  const { data: sessionData, error: sessionError } = await auth.getSession();
  if (sessionError || !sessionData.session) {
    if (sessionError) {
      // A revoked or expired refresh token must not remain in local storage and
      // fail again on every page load. This clears only this browser's session.
      await auth.signOut({ scope: "local" }).catch(() => undefined);
    }
    cleanAuthUrl();
    return null;
  }

  // getUser verifies the access token with Supabase; UI identity never comes
  // from an unverified JWT payload or arbitrary callback fragment.
  const { data: verifiedData, error } = await auth.getUser();
  let data = verifiedData;
  cleanAuthUrl();
  if (error || !data.user) {
    await auth.signOut({ scope: "local" }).catch(() => undefined);
    return null;
  }
  if (takePendingLegalAcceptance() && !hasCurrentLegalAcceptance(data.user.user_metadata)) {
    const updated = await auth.updateUser({ data: legalAcceptanceMetadata() });
    if (!updated.error && updated.data.user) data = { user: updated.data.user };
  }
  return accountFromUser(data.user);
}

export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return null;
  const { data, error } = await getClient().auth.getSession();
  return error ? null : data.session?.access_token ?? null;
}

export async function startGoogleSignIn(mode: AccountAccessMode, acceptedLegalTerms: boolean): Promise<void> {
  if (mode === "create-account" && !acceptedLegalTerms) throw new Error("Legal acceptance is required");
  rememberPendingLegalAcceptance(mode === "create-account" && acceptedLegalTerms);
  const { error } = await getClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authRedirectUrl(),
      scopes: "openid email profile",
    },
  });
  if (error) throw error;
}

export async function sendEmailSignInLink(
  email: string,
  captchaToken: string,
  mode: AccountAccessMode,
  acceptedLegalTerms: boolean,
): Promise<void> {
  if (mode === "create-account" && !acceptedLegalTerms) throw new Error("Legal acceptance is required");
  const { error } = await getClient().auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: authRedirectUrl(),
      shouldCreateUser: mode === "create-account",
      data: mode === "create-account" ? legalAcceptanceMetadata() : undefined,
      captchaToken,
    },
  });
  if (error) throw error;
}

export async function acceptCurrentLegalTerms(): Promise<SupabaseAccount> {
  const auth = getClient().auth;
  const { data, error } = await auth.updateUser({ data: legalAcceptanceMetadata() });
  if (error || !data.user) throw error ?? new Error("Account could not be updated");
  const account = accountFromUser(data.user);
  if (!account) throw new Error("Account could not be verified");
  return account;
}

export async function signOutAccount(): Promise<void> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return;
  const auth = getClient().auth;
  const { error } = await auth.signOut();
  if (error) {
    // If the network is unavailable, remove this browser's session anyway.
    await auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
