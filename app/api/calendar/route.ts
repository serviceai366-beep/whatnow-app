import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../../supabase-config.ts";
import { supportedLanguages, type SupportedLanguage } from "../../analysis-schema.ts";
import { parseCalendarAction, parseCalendarRange } from "../../calendar-validation.ts";
import type { CalendarEvent, CalendarEventReminder, CalendarState } from "../../calendar-types.ts";
import { REMINDER_ACTIVE_LIMIT, REMINDER_WEEKLY_LIMIT, type ReminderAvailability } from "../../reminder-types.ts";
import { isSameOriginRequest } from "../../security.ts";
import { requestBearerToken, verifySupabaseRequest } from "../../supabase-server-auth.ts";

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_TIMEZONE = "Europe/Riga";

type Row = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
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

function error(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

function availabilityFor(email: string): ReminderAvailability {
  const mode = process.env.WHATNOW_REMINDER_MODE?.trim().toLowerCase();
  if (mode === "public") return "available";
  if (mode !== "pilot") return "not_configured";
  return process.env.WHATNOW_REMINDER_PILOT_EMAIL?.trim().toLowerCase() === email.trim().toLowerCase()
    ? "available"
    : "pilot_only";
}

async function authenticate(request: Request) {
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) return { response: error(auth.code, "A confirmed account is required.", auth.status) } as const;
  const token = requestBearerToken(request);
  if (!token) return { response: error("authentication_required", "Sign in is required.", 401) } as const;
  return { user: auth.user, token } as const;
}

async function supabase(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(init.headers)),
    },
  });
}

function reminderFromRow(row: Row): CalendarEventReminder | null {
  const offset = Number(row.remind_before_minutes);
  if (
    typeof row.id !== "string" || typeof row.calendar_event_id !== "string"
    || typeof row.send_at !== "string" || ![0, 60, 1_440, 10_080, 43_200].includes(offset)
    || (row.status !== "scheduled" && row.status !== "sending" && row.status !== "sent" && row.status !== "failed")
  ) return null;
  return {
    id: row.id,
    remindBeforeMinutes: offset as CalendarEventReminder["remindBeforeMinutes"],
    sendAt: row.send_at,
    status: row.status,
  };
}

function eventFromRow(row: Row, reminders: Map<string, CalendarEventReminder>): CalendarEvent | null {
  if (
    typeof row.id !== "string" || (row.origin !== "analysis" && row.origin !== "manual")
    || (row.source_analysis_id !== null && typeof row.source_analysis_id !== "string")
    || (row.source_event_key !== null && typeof row.source_event_key !== "string")
    || typeof row.title !== "string" || (row.notes !== null && typeof row.notes !== "string")
    || (row.location !== null && typeof row.location !== "string") || typeof row.event_local_date !== "string"
    || (row.event_local_time !== null && typeof row.event_local_time !== "string")
    || (row.event_at !== null && typeof row.event_at !== "string") || typeof row.timezone !== "string"
    || typeof row.is_all_day !== "boolean" || !supportedLanguages.includes(String(row.source_language) as SupportedLanguage)
    || typeof row.created_at !== "string" || typeof row.updated_at !== "string"
  ) return null;
  return {
    id: row.id,
    origin: row.origin,
    sourceAnalysisId: row.source_analysis_id,
    sourceEventKey: row.source_event_key,
    title: row.title,
    notes: row.notes,
    location: row.location,
    localDate: row.event_local_date,
    localTime: row.event_local_time ? String(row.event_local_time).slice(0, 5) : null,
    eventAt: row.event_at,
    timezone: row.timezone,
    isAllDay: row.is_all_day,
    sourceLanguage: row.source_language as CalendarEvent["sourceLanguage"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reminder: reminders.get(row.id) ?? null,
  };
}

async function loadState({ userId, email, token, from, to }: {
  userId: string; email: string; token: string; from: string; to: string;
}): Promise<CalendarState> {
  const owner = encodeURIComponent(userId);
  const weeklyStart = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [eventResponse, reminderResponse, preferenceResponse, usageResponse] = await Promise.all([
    supabase(`calendar_events?select=id,origin,source_analysis_id,source_event_key,title,notes,location,event_local_date,event_local_time,event_at,timezone,is_all_day,source_language,created_at,updated_at&user_id=eq.${owner}&status=eq.active&deleted_at=is.null&event_local_date=gte.${from}&event_local_date=lte.${to}&order=event_local_date.asc,event_local_time.asc.nullsfirst&limit=366`, token),
    supabase(`email_reminders?select=id,calendar_event_id,send_at,remind_before_minutes,status&user_id=eq.${owner}&calendar_event_id=not.is.null&status=in.(scheduled,sending,sent,failed)&limit=120`, token),
    supabase(`reminder_preferences?select=email_consent_at,timezone&user_id=eq.${owner}&limit=1`, token),
    supabase(`reminder_schedule_usage?select=created_at&user_id=eq.${owner}&created_at=gte.${encodeURIComponent(weeklyStart)}&order=created_at.asc&limit=${REMINDER_WEEKLY_LIMIT}`, token),
  ]);
  if (!eventResponse.ok || !reminderResponse.ok || !preferenceResponse.ok || !usageResponse.ok) throw new Error("calendar_storage_unavailable");
  const eventRows = await eventResponse.json().catch(() => []) as Row[];
  const reminderRows = await reminderResponse.json().catch(() => []) as Row[];
  const preferenceRows = await preferenceResponse.json().catch(() => []) as Row[];
  const usageRows = await usageResponse.json().catch(() => []) as Row[];
  const reminderMap = new Map<string, CalendarEventReminder>();
  for (const row of reminderRows) {
    const parsed = reminderFromRow(row);
    if (parsed && typeof row.calendar_event_id === "string") reminderMap.set(row.calendar_event_id, parsed);
  }
  const preference = preferenceRows[0];
  const activeReminderCount = reminderRows.filter((row) => row.status === "scheduled" || row.status === "sending").length;
  const oldestUsage = typeof usageRows[0]?.created_at === "string" ? Date.parse(usageRows[0].created_at) : Number.NaN;
  return {
    availability: availabilityFor(email),
    preference: {
      consentAt: typeof preference?.email_consent_at === "string" ? preference.email_consent_at : null,
      timezone: typeof preference?.timezone === "string" ? preference.timezone : DEFAULT_TIMEZONE,
    },
    events: eventRows.map((row) => eventFromRow(row, reminderMap)).filter((item): item is CalendarEvent => Boolean(item)),
    eventLimit: 100,
    reminderQuota: {
      active: activeReminderCount,
      activeLimit: REMINDER_ACTIVE_LIMIT,
      weeklyUsed: usageRows.length,
      weeklyLimit: REMINDER_WEEKLY_LIMIT,
      weeklyResetAt: usageRows.length >= REMINDER_WEEKLY_LIMIT && Number.isFinite(oldestUsage)
        ? new Date(oldestUsage + 7 * 86_400_000).toISOString()
        : null,
    },
  };
}

function boundedJsonAllowed(request: Request): boolean {
  const type = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.startsWith("application/json")) return false;
  const length = Number(request.headers.get("content-length") ?? 0);
  return Number.isSafeInteger(length) && length >= 0 && length <= MAX_BODY_BYTES;
}

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return error("forbidden", "The request origin was rejected.", 403);
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const range = parseCalendarRange(url.searchParams.get("from"), url.searchParams.get("to"));
  if (!range) return error("invalid_range", "Choose a valid calendar range of up to 366 days.", 400);
  try {
    return json({ state: await loadState({ ...auth.user, token: auth.token, ...range, userId: auth.user.id }) });
  } catch {
    return error("calendar_storage_unavailable", "Calendar is temporarily unavailable.", 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return error("forbidden", "The request origin was rejected.", 403);
  if (!boundedJsonAllowed(request)) return error("invalid_request", "The request format is invalid.", 415);
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  const action = parseCalendarAction(await request.json().catch(() => null));
  if (!action) return error("invalid_event", "The event details are invalid.", 400);

  let rpcName: string;
  let body: Record<string, unknown>;
  const reminder = availabilityFor(auth.user.email) === "available" ? ("remindBeforeMinutes" in action ? action.remindBeforeMinutes : null) : null;
  if (action.action === "confirm_analysis") {
    rpcName = "confirm_analysis_calendar_event";
    body = { p_analysis_id: action.analysisId, p_event_key: action.eventKey, p_event_title: action.eventTitle, p_event_local_date: action.localDate, p_event_local_time: action.localTime, p_timezone: action.timezone, p_is_all_day: action.isAllDay, p_location: action.location, p_notes: action.notes, p_remind_before_minutes: reminder };
  } else if (action.action === "create_manual") {
    rpcName = "create_manual_calendar_event_with_reminder";
    body = { p_request_id: action.requestId, p_event_title: action.eventTitle, p_event_local_date: action.localDate, p_event_local_time: action.localTime, p_timezone: action.timezone, p_is_all_day: action.isAllDay, p_location: action.location, p_notes: action.notes, p_source_language: action.sourceLanguage, p_remind_before_minutes: reminder };
  } else if (action.action === "update") {
    rpcName = "update_calendar_event_with_reminder";
    body = { p_event_id: action.eventId, p_expected_updated_at: action.expectedUpdatedAt, p_event_title: action.eventTitle, p_event_local_date: action.localDate, p_event_local_time: action.localTime, p_timezone: action.timezone, p_is_all_day: action.isAllDay, p_location: action.location, p_notes: action.notes, p_remind_before_minutes: reminder };
  } else if (action.action === "delete") {
    rpcName = "delete_calendar_event";
    body = { p_event_id: action.eventId };
  } else {
    rpcName = "set_calendar_event_reminder";
    body = { p_event_id: action.eventId, p_remind_before_minutes: reminder };
  }

  try {
    const response = await supabase(`rpc/${rpcName}`, auth.token, { method: "POST", body: JSON.stringify(body), headers: { Prefer: "return=representation" } });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      const known = ["analysis_not_found", "analysis_event_not_found", "invalid_local_time", "reminder_too_late", "consent_required", "active_event_limit", "active_reminder_limit", "weekly_reminder_limit", "event_conflict", "calendar_event_not_found", "reminder_sending"]
        .find((code) => payload?.message?.includes(code));
      return error(known ?? "calendar_rejected", "The calendar change could not be saved.", known === "event_conflict" ? 409 : 400);
    }
    return json({ ok: true });
  } catch {
    return error("calendar_storage_unavailable", "Calendar is temporarily unavailable.", 503);
  }
}
