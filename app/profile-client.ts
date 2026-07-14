"use client";

import { parseUserProfilePreferences } from "./profile-validation";
import { getAccessToken } from "./supabase-auth";
import type { UserProfilePatch, UserProfilePreferences } from "./profile-types";

type ProfilePayload = {
  profile?: unknown;
  error?: { code?: string; message?: string };
};

export class ProfileRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ProfileRequestError";
  }
}

async function profileRequest(method: "GET" | "PATCH", patch?: UserProfilePatch): Promise<UserProfilePreferences> {
  const token = await getAccessToken();
  if (!token) throw new ProfileRequestError("authentication_required", "Authentication required");

  const response = await fetch("/api/profile", {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(patch ? { "Content-Type": "application/json" } : {}),
    },
    body: patch ? JSON.stringify(patch) : undefined,
  });
  const payload = await response.json().catch(() => null) as ProfilePayload | null;
  const profile = parseUserProfilePreferences(payload?.profile);
  if (!response.ok || !profile) {
    throw new ProfileRequestError(
      payload?.error?.code ?? "profile_error",
      payload?.error?.message ?? "Profile request failed",
    );
  }
  return profile;
}

export function loadUserProfile(): Promise<UserProfilePreferences> {
  return profileRequest("GET");
}

export function updateUserProfile(patch: UserProfilePatch): Promise<UserProfilePreferences> {
  return profileRequest("PATCH", patch);
}
