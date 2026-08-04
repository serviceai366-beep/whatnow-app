"use client";

import { getAccessToken } from "./supabase-auth";
import type { FavoriteMode } from "./favorite-mode-store";

const favoriteModes = ["understand", "create", "translate"] as const;

const ANONYMOUS_STORAGE_KEY = "whatnow.favoriteMode";

function storageKey(accountId?: string | null): string {
  return accountId ? `${ANONYMOUS_STORAGE_KEY}.${accountId}` : ANONYMOUS_STORAGE_KEY;
}

function isFavoriteMode(value: unknown): value is Exclude<FavoriteMode, null> {
  return typeof value === "string" && favoriteModes.includes(value as Exclude<FavoriteMode, null>);
}

export function readLocalFavoriteMode(accountId?: string | null): FavoriteMode {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(storageKey(accountId));
    return isFavoriteMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLocalFavoriteMode(accountId: string | null | undefined, favoriteMode: FavoriteMode): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(accountId);
    if (favoriteMode) window.localStorage.setItem(key, favoriteMode);
    else window.localStorage.removeItem(key);
  } catch {
    // Local storage is only an optimistic fallback; the account store remains authoritative.
  }
}

export class FavoriteModeRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "FavoriteModeRequestError";
  }
}

type FavoriteModePayload = { favoriteMode?: unknown; error?: { code?: string; message?: string } };

function parseFavoriteMode(value: unknown): FavoriteMode | null {
  if (value === null) return null;
  return isFavoriteMode(value) ? value : null;
}

async function requestFavoriteMode(method: "GET" | "PATCH", favoriteMode?: FavoriteMode): Promise<FavoriteMode> {
  const token = await getAccessToken();
  if (!token) throw new FavoriteModeRequestError("authentication_required", "Authentication required");
  const response = await fetch("/api/favorite-mode", {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "PATCH" ? JSON.stringify({ favoriteMode }) : undefined,
  });
  const payload = await response.json().catch(() => null) as FavoriteModePayload | null;
  const parsed = parseFavoriteMode(payload?.favoriteMode);
  if (!response.ok || payload?.favoriteMode === undefined || (payload.favoriteMode !== null && parsed === null)) {
    throw new FavoriteModeRequestError(payload?.error?.code ?? "favorite_mode_error", payload?.error?.message ?? "Favorite mode request failed");
  }
  return parsed;
}

export function loadFavoriteMode(): Promise<FavoriteMode> {
  return requestFavoriteMode("GET");
}

export function updateFavoriteMode(favoriteMode: FavoriteMode): Promise<FavoriteMode> {
  return requestFavoriteMode("PATCH", favoriteMode);
}
