import { supportedLanguages, type SupportedLanguage } from "./analysis-schema.ts";
import { isValidLocalDate, isValidLocalTime } from "./reminder-time.ts";
import { isReminderOffset, isSupportedReminderTimeZone, type ReminderOffsetMinutes } from "./reminder-types.ts";

export type ReminderAction =
  | { action: "preference"; consent: boolean; timezone: string }
  | {
      action: "schedule";
      analysisId: string;
      eventKey: string;
      eventTitle: string;
      localDate: string;
      localTime: string;
      timezone: string;
      remindBeforeMinutes: ReminderOffsetMinutes;
      sourceLanguage: SupportedLanguage;
    }
  | { action: "cancel"; reminderId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseReminderAction(value: unknown): ReminderAction | null {
  if (!isRecord(value) || typeof value.action !== "string") return null;

  if (value.action === "preference") {
    if (typeof value.consent !== "boolean" || !isSupportedReminderTimeZone(value.timezone)) return null;
    return { action: "preference", consent: value.consent, timezone: value.timezone };
  }

  if (value.action === "cancel") {
    return isUuid(value.reminderId) ? { action: "cancel", reminderId: value.reminderId } : null;
  }

  if (value.action !== "schedule") return null;
  const eventTitle = typeof value.eventTitle === "string" ? value.eventTitle.trim() : "";
  if (
    !isUuid(value.analysisId)
    || typeof value.eventKey !== "string" || !/^[a-z0-9_-]{1,80}$/.test(value.eventKey)
    || eventTitle.length < 1 || eventTitle.length > 200
    || typeof value.localDate !== "string" || !isValidLocalDate(value.localDate)
    || typeof value.localTime !== "string" || !isValidLocalTime(value.localTime)
    || !isSupportedReminderTimeZone(value.timezone)
    || !isReminderOffset(value.remindBeforeMinutes)
    || typeof value.sourceLanguage !== "string" || !supportedLanguages.includes(value.sourceLanguage as SupportedLanguage)
  ) return null;

  return {
    action: "schedule",
    analysisId: value.analysisId,
    eventKey: value.eventKey,
    eventTitle,
    localDate: value.localDate,
    localTime: value.localTime,
    timezone: value.timezone,
    remindBeforeMinutes: value.remindBeforeMinutes,
    sourceLanguage: value.sourceLanguage as SupportedLanguage,
  };
}
