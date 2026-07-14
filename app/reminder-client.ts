"use client";

import { getAccessToken } from "./supabase-auth";
import type { ReminderAction } from "./reminder-validation";
import type { ReminderState } from "./reminder-types";

type ReminderPayload = {
  state?: ReminderState;
  error?: { code?: string; message?: string };
};

export class ReminderRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ReminderRequestError";
  }
}

async function reminderRequest(method: "GET" | "POST", action?: ReminderAction): Promise<ReminderState> {
  const token = await getAccessToken();
  if (!token) throw new ReminderRequestError("authentication_required", "Authentication required");
  const response = await fetch("/api/reminders", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(action ? { "Content-Type": "application/json" } : {}),
    },
    body: action ? JSON.stringify(action) : undefined,
  });
  const payload = await response.json().catch(() => null) as ReminderPayload | null;
  if (!response.ok || !payload?.state) {
    throw new ReminderRequestError(payload?.error?.code ?? "reminder_error", payload?.error?.message ?? "Reminder request failed");
  }
  return payload.state;
}

export function loadReminderState(): Promise<ReminderState> {
  return reminderRequest("GET");
}

export function updateReminderState(action: ReminderAction): Promise<ReminderState> {
  return reminderRequest("POST", action);
}
