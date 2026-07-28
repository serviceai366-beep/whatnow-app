"use client";

import { parseUserProfilePreferences } from "./profile-validation";
import { getAccessToken } from "./supabase-auth";
import type { UserProfilePatch, UserProfilePreferences } from "./profile-types";

type ProfilePayload = {
  profile?: unknown;
  modelSelectionAvailable?: unknown;
  error?: { code?: string; message?: string };
};

export class ProfileRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ProfileRequestError";
  }
}

export type LoadedUserProfile = { preferences: UserProfilePreferences; modelSelectionAvailable: boolean };

async function profileRequest(method: "GET" | "PATCH", patch?: UserProfilePatch): Promise<LoadedUserProfile> {
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
  return { preferences: profile, modelSelectionAvailable: payload?.modelSelectionAvailable === true };
}

export function loadUserProfile(): Promise<UserProfilePreferences> {
  return profileRequest("GET").then(({ preferences }) => preferences);
}

export function loadUserProfileWithAccess(): Promise<LoadedUserProfile> {
  return profileRequest("GET");
}

export function updateUserProfile(patch: UserProfilePatch): Promise<UserProfilePreferences> {
  return profileRequest("PATCH", patch).then(({ preferences }) => preferences);
}
