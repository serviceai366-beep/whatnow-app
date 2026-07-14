"use client";

import type { CalendarAction, CalendarState } from "./calendar-types";
import { getAccessToken } from "./supabase-auth";

export class CalendarRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CalendarRequestError";
  }
}

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw new CalendarRequestError("authentication_required", "Authentication required");
  return value;
}

async function request(path: string, init: RequestInit = {}) {
  const accessToken = await token();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(path, { ...init, headers, cache: "no-store", credentials: "same-origin" });
  const payload = await response.json().catch(() => null) as { state?: CalendarState; ok?: boolean; error?: { code?: string; message?: string } } | null;
  if (!response.ok) throw new CalendarRequestError(payload?.error?.code ?? "calendar_error", payload?.error?.message ?? "Calendar request failed");
  return payload;
}

export async function loadCalendarState(from: string, to: string): Promise<CalendarState> {
  const payload = await request(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  if (!payload?.state) throw new CalendarRequestError("invalid_calendar_response", "Calendar response is invalid");
  return payload.state;
}

export async function updateCalendar(action: CalendarAction): Promise<void> {
  await request("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
}
