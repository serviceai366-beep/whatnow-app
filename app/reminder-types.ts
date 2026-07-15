import type { SupportedLanguage } from "./analysis-schema";

export const reminderOffsets = [60, 1_440, 10_080, 43_200] as const;
export type ReminderOffsetMinutes = (typeof reminderOffsets)[number];

// Manual calendar items may send their email at the selected event time.
// Document-derived reminders keep the conservative before-event choices above.
export const calendarReminderOffsets = [0, ...reminderOffsets] as const;
export type CalendarReminderOffsetMinutes = (typeof calendarReminderOffsets)[number];

export const supportedReminderTimeZones = [
  "Europe/Riga",
  "Europe/Vilnius",
  "Europe/Tallinn",
  "Europe/Helsinki",
  "Europe/Warsaw",
  "Europe/Berlin",
  "Europe/London",
  "UTC",
] as const;

export type ReminderAvailability = "available" | "pilot_only" | "not_configured";

export type ReminderPreference = {
  consentAt: string | null;
  timezone: string;
};

export const REMINDER_ACTIVE_LIMIT = 3;
export const REMINDER_WEEKLY_LIMIT = 10;

export type ReminderQuota = {
  active: number;
  activeLimit: typeof REMINDER_ACTIVE_LIMIT;
  weeklyUsed: number;
  weeklyLimit: typeof REMINDER_WEEKLY_LIMIT;
  weeklyResetAt: string | null;
};

export function reminderQuotaBlocked(quota: ReminderQuota): boolean {
  return quota.active >= quota.activeLimit || quota.weeklyUsed >= quota.weeklyLimit;
}

export type ScheduledReminder = {
  id: string;
  analysisId: string | null;
  eventKey: string;
  eventTitle: string;
  eventAt: string;
  sendAt: string;
  timezone: string;
  remindBeforeMinutes: CalendarReminderOffsetMinutes;
  sourceLanguage: SupportedLanguage;
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed";
  createdAt: string;
};

export type ReminderState = {
  availability: ReminderAvailability;
  preference: ReminderPreference;
  reminders: ScheduledReminder[];
  quota: ReminderQuota;
};

export function isReminderOffset(value: unknown): value is ReminderOffsetMinutes {
  return typeof value === "number" && reminderOffsets.includes(value as ReminderOffsetMinutes);
}

export function isCalendarReminderOffset(value: unknown): value is CalendarReminderOffsetMinutes {
  return typeof value === "number" && calendarReminderOffsets.includes(value as CalendarReminderOffsetMinutes);
}

export function isSupportedReminderTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}
