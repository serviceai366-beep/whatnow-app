import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config";

export type SupabaseAccount = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

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
  return {
    id: user.id,
    email,
    displayName: name?.trim() || email.split("@")[0] || email,
    avatarUrl: avatar ?? null,
  };
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
    cleanAuthUrl();
    return null;
  }

  // getUser verifies the access token with Supabase; UI identity never comes
  // from an unverified JWT payload or arbitrary callback fragment.
  const { data, error } = await auth.getUser();
  cleanAuthUrl();
  if (error || !data.user) {
    await auth.signOut({ scope: "local" }).catch(() => undefined);
    return null;
  }
  return accountFromUser(data.user);
}

export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return null;
  const { data, error } = await getClient().auth.getSession();
  return error ? null : data.session?.access_token ?? null;
}

export async function startGoogleSignIn(): Promise<void> {
  const { error } = await getClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authRedirectUrl(),
      scopes: "openid email profile",
    },
  });
  if (error) throw error;
}

export async function sendEmailSignInLink(email: string, captchaToken: string): Promise<void> {
  const { error } = await getClient().auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: authRedirectUrl(),
      shouldCreateUser: true,
      captchaToken,
    },
  });
  if (error) throw error;
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
