import { supportedLanguages, type SupportedLanguage } from "./analysis-schema.ts";
import type { CalendarAction, CalendarEventFields } from "./calendar-types.ts";
import { isValidLocalDate, isValidLocalTime } from "./reminder-time.ts";
import {
  isReminderOffset,
  isSupportedReminderTimeZone,
  type ReminderOffsetMinutes,
} from "./reminder-types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_KEY_PATTERN = /^[a-z0-9_-]{1,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCalendarUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function optionalTrimmed(value: unknown, maximum: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length <= maximum ? trimmed || null : undefined;
}

function parseFields(value: Record<string, unknown>): CalendarEventFields | null {
  const eventTitle = typeof value.eventTitle === "string" ? value.eventTitle.trim() : "";
  const location = optionalTrimmed(value.location, 300);
  const notes = optionalTrimmed(value.notes, 2_000);
  const isAllDay = value.isAllDay;
  const localTime = value.localTime === null || value.localTime === "" ? null : value.localTime;
  const reminder = value.remindBeforeMinutes === null
    ? null
    : isReminderOffset(value.remindBeforeMinutes)
      ? value.remindBeforeMinutes
      : undefined;

  if (
    eventTitle.length < 1 || eventTitle.length > 200
    || typeof value.localDate !== "string" || !isValidLocalDate(value.localDate)
    || typeof isAllDay !== "boolean"
    || (isAllDay ? localTime !== null : typeof localTime !== "string" || !isValidLocalTime(localTime))
    || !isSupportedReminderTimeZone(value.timezone)
    || location === undefined || notes === undefined || reminder === undefined
    || (isAllDay && reminder !== null)
  ) return null;

  return {
    eventTitle,
    localDate: value.localDate,
    localTime: localTime as string | null,
    timezone: value.timezone as string,
    isAllDay,
    location,
    notes,
    remindBeforeMinutes: reminder as ReminderOffsetMinutes | null,
  };
}

export function parseCalendarAction(value: unknown): CalendarAction | null {
  if (!isRecord(value) || typeof value.action !== "string") return null;

  if (value.action === "delete") {
    return isCalendarUuid(value.eventId) ? { action: "delete", eventId: value.eventId } : null;
  }

  if (value.action === "set_reminder") {
    const reminder = value.remindBeforeMinutes === null
      ? null
      : isReminderOffset(value.remindBeforeMinutes)
        ? value.remindBeforeMinutes
        : undefined;
    return isCalendarUuid(value.eventId) && reminder !== undefined
      ? { action: "set_reminder", eventId: value.eventId, remindBeforeMinutes: reminder }
      : null;
  }

  const fields = parseFields(value);
  if (!fields) return null;

  if (value.action === "confirm_analysis") {
    if (!isCalendarUuid(value.analysisId) || typeof value.eventKey !== "string" || !EVENT_KEY_PATTERN.test(value.eventKey)) return null;
    return {
      action: "confirm_analysis",
      analysisId: value.analysisId,
      eventKey: value.eventKey,
      ...fields,
    };
  }

  if (value.action === "create_manual") {
    if (
      !isCalendarUuid(value.requestId)
      || typeof value.sourceLanguage !== "string"
      || !supportedLanguages.includes(value.sourceLanguage as SupportedLanguage)
    ) return null;
    return {
      action: "create_manual",
      requestId: value.requestId,
      sourceLanguage: value.sourceLanguage as SupportedLanguage,
      ...fields,
    };
  }

  if (value.action === "update") {
    if (
      !isCalendarUuid(value.eventId)
      || typeof value.expectedUpdatedAt !== "string"
      || !Number.isFinite(Date.parse(value.expectedUpdatedAt))
    ) return null;
    return {
      action: "update",
      eventId: value.eventId,
      expectedUpdatedAt: value.expectedUpdatedAt,
      ...fields,
    };
  }

  return null;
}

export function parseCalendarRange(from: string | null, to: string | null): { from: string; to: string } | null {
  if (!from || !to || !isValidLocalDate(from) || !isValidLocalDate(to)) return null;
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((toTime - fromTime) / 86_400_000);
  return days >= 0 && days <= 366 ? { from, to } : null;
}

