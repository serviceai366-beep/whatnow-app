import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../../supabase-config.ts";
import { supportedLanguages, type SupportedLanguage } from "../../analysis-schema.ts";
import { parseReminderAction } from "../../reminder-validation.ts";
import { REMINDER_ACTIVE_LIMIT, REMINDER_WEEKLY_LIMIT, type ReminderAvailability, type ReminderQuota, type ReminderState, type ScheduledReminder } from "../../reminder-types.ts";
import { isSameOriginRequest } from "../../security.ts";
import { requestBearerToken, verifySupabaseRequest, type VerifiedSupabaseUser } from "../../supabase-server-auth.ts";

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_TIMEZONE = "Europe/Riga";

type SupabaseRow = Record<string, unknown>;

function emptyQuota(): ReminderQuota {
  return { active: 0, activeLimit: REMINDER_ACTIVE_LIMIT, weeklyUsed: 0, weeklyLimit: REMINDER_WEEKLY_LIMIT, weeklyResetAt: null };
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

function apiError(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status);
}

function requestBodyAllowed(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return false;
  const value = request.headers.get("content-length");
  if (!value) return true;
  const length = Number(value);
  return Number.isSafeInteger(length) && length >= 0 && length <= MAX_BODY_BYTES;
}

function availabilityFor(email: string): ReminderAvailability {
  const mode = process.env.WHATNOW_REMINDER_MODE?.trim().toLowerCase();
  if (mode === "public") return "available";
  if (mode !== "pilot") return "not_configured";
  const pilotEmail = process.env.WHATNOW_REMINDER_PILOT_EMAIL?.trim().toLowerCase();
  return pilotEmail && pilotEmail === email.trim().toLowerCase() ? "available" : "pilot_only";
}

async function supabaseRest(path: string, token: string, init: RequestInit = {}): Promise<Response> {
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

function reminderFromRow(row: SupabaseRow): ScheduledReminder | null {
  const offset = Number(row.remind_before_minutes);
  if (
    typeof row.id !== "string" || (row.analysis_id !== null && typeof row.analysis_id !== "string")
    || typeof row.event_key !== "string" || typeof row.event_title !== "string"
    || typeof row.event_at !== "string" || typeof row.send_at !== "string"
    || typeof row.timezone !== "string" || ![0, 60, 1_440, 10_080, 43_200].includes(offset)
    || !supportedLanguages.includes(String(row.source_language) as SupportedLanguage)
    || (row.status !== "scheduled" && row.status !== "sending" && row.status !== "sent" && row.status !== "cancelled" && row.status !== "failed")
    || typeof row.created_at !== "string"
  ) return null;
  return {
    id: row.id,
    analysisId: row.analysis_id,
    eventKey: row.event_key,
    eventTitle: row.event_title,
    eventAt: row.event_at,
    sendAt: row.send_at,
    timezone: row.timezone,
    remindBeforeMinutes: offset as ScheduledReminder["remindBeforeMinutes"],
    sourceLanguage: row.source_language as ScheduledReminder["sourceLanguage"],
    status: row.status,
    createdAt: row.created_at,
  };
}

async function loadReminderState(userId: string, email: string, token: string): Promise<ReminderState> {
  const availability = availabilityFor(email);
  if (availability !== "available") {
    return { availability, preference: { consentAt: null, timezone: DEFAULT_TIMEZONE }, reminders: [], quota: emptyQuota() };
  }

  const filter = encodeURIComponent(userId);
  const windowStart = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [preferenceResponse, remindersResponse, usageResponse] = await Promise.all([
    supabaseRest(`reminder_preferences?select=email_consent_at,timezone&user_id=eq.${filter}&limit=1`, token),
    supabaseRest(`email_reminders?select=id,analysis_id,event_key,event_title,event_at,send_at,timezone,remind_before_minutes,source_language,status,created_at&user_id=eq.${filter}&status=in.(scheduled,sending,sent,failed)&order=send_at.asc&limit=30`, token),
    supabaseRest(`reminder_schedule_usage?select=created_at&user_id=eq.${filter}&created_at=gte.${encodeURIComponent(windowStart)}&order=created_at.asc&limit=${REMINDER_WEEKLY_LIMIT}`, token),
  ]);
  if (!preferenceResponse.ok || !remindersResponse.ok || !usageResponse.ok) throw new Error("storage_unavailable");

  const preferenceRows = await preferenceResponse.json().catch(() => []) as SupabaseRow[];
  const reminderRows = await remindersResponse.json().catch(() => []) as SupabaseRow[];
  const usageRows = await usageResponse.json().catch(() => []) as SupabaseRow[];
  const preference = preferenceRows[0];
  const reminders = reminderRows.map(reminderFromRow).filter((item): item is ScheduledReminder => Boolean(item));
  const oldestUsage = typeof usageRows[0]?.created_at === "string" ? Date.parse(usageRows[0].created_at) : Number.NaN;
  return {
    availability,
    preference: {
      consentAt: typeof preference?.email_consent_at === "string" ? preference.email_consent_at : null,
      timezone: typeof preference?.timezone === "string" ? preference.timezone : DEFAULT_TIMEZONE,
    },
    reminders,
    quota: {
      active: reminders.filter((item) => item.status === "scheduled" || item.status === "sending").length,
      activeLimit: REMINDER_ACTIVE_LIMIT,
      weeklyUsed: usageRows.length,
      weeklyLimit: REMINDER_WEEKLY_LIMIT,
      weeklyResetAt: usageRows.length >= REMINDER_WEEKLY_LIMIT && Number.isFinite(oldestUsage)
        ? new Date(oldestUsage + 7 * 86_400_000).toISOString()
        : null,
    },
  };
}

type AuthenticatedRequest = { user: VerifiedSupabaseUser; token: string } | { response: Response };

async function authenticate(request: Request): Promise<AuthenticatedRequest> {
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) return { response: apiError(auth.code, "Требуется подтверждённый аккаунт.", auth.status) } as const;
  const token = requestBearerToken(request);
  if (!token) return { response: apiError("authentication_required", "Требуется вход в аккаунт.", 401) } as const;
  return { user: auth.user, token } as const;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  try {
    return jsonResponse({ state: await loadReminderState(auth.user.id, auth.user.email, auth.token) });
  } catch {
    return apiError("reminder_storage_unavailable", "Не удалось загрузить напоминания.", 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return apiError("forbidden", "Запрос отклонён проверкой источника.", 403);
  if (!requestBodyAllowed(request)) return apiError("invalid_request", "Некорректный формат запроса.", 415);
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  if (availabilityFor(auth.user.email) !== "available") {
    return apiError("reminders_unavailable", "Email-напоминания пока доступны только в тестовом режиме.", 403);
  }

  const action = parseReminderAction(await request.json().catch(() => null));
  if (!action) return apiError("invalid_request", "Параметры напоминания некорректны.", 400);

  let rpcName: string;
  let rpcBody: Record<string, unknown>;
  if (action.action === "preference") {
    rpcName = "set_reminder_preferences";
    rpcBody = { p_email_consent: action.consent, p_timezone: action.timezone };
  } else if (action.action === "cancel") {
    rpcName = "cancel_email_reminder";
    rpcBody = { p_reminder_id: action.reminderId };
  } else {
    rpcName = "schedule_email_reminder";
    rpcBody = {
      p_analysis_id: action.analysisId,
      p_event_key: action.eventKey,
      p_event_title: action.eventTitle,
      p_event_local_date: action.localDate,
      p_event_local_time: action.localTime,
      p_timezone: action.timezone,
      p_remind_before_minutes: action.remindBeforeMinutes,
      p_source_language: action.sourceLanguage,
    };
  }

  try {
    const rpcResponse = await supabaseRest(`rpc/${rpcName}`, auth.token, {
      method: "POST",
      body: JSON.stringify(rpcBody),
      headers: { Prefer: "return=representation" },
    });
    if (!rpcResponse.ok) {
      const error = await rpcResponse.json().catch(() => null) as { message?: string } | null;
      const knownCode = ["consent_required", "reminder_too_late", "active_reminder_limit", "weekly_reminder_limit", "analysis_not_found", "invalid_timezone"]
        .find((code) => error?.message?.includes(code));
      return apiError(knownCode ?? "reminder_rejected", "Не удалось сохранить напоминание. Проверьте дату, время и согласие.", 409);
    }
    return jsonResponse({ state: await loadReminderState(auth.user.id, auth.user.email, auth.token) });
  } catch {
    return apiError("reminder_storage_unavailable", "Сервис напоминаний временно недоступен.", 503);
  }
}
