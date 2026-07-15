import type { SupportedLanguage } from "./analysis-schema";
import type {
  CalendarReminderOffsetMinutes,
  ReminderAvailability,
  ReminderPreference,
} from "./reminder-types";

export const CALENDAR_EVENT_LIMIT = 100;

export type CalendarEventOrigin = "analysis" | "manual";

export type CalendarEventReminder = {
  id: string;
  remindBeforeMinutes: CalendarReminderOffsetMinutes;
  sendAt: string;
  status: "scheduled" | "sending" | "sent" | "failed";
};

export type CalendarEvent = {
  id: string;
  origin: CalendarEventOrigin;
  sourceAnalysisId: string | null;
  sourceEventKey: string | null;
  title: string;
  notes: string | null;
  location: string | null;
  localDate: string;
  localTime: string | null;
  eventAt: string | null;
  timezone: string;
  isAllDay: boolean;
  sourceLanguage: SupportedLanguage;
  createdAt: string;
  updatedAt: string;
  reminder: CalendarEventReminder | null;
};

export type CalendarState = {
  availability: ReminderAvailability;
  preference: ReminderPreference;
  events: CalendarEvent[];
  eventLimit: number;
};

export type CalendarEventFields = {
  eventTitle: string;
  localDate: string;
  localTime: string | null;
  timezone: string;
  isAllDay: boolean;
  location: string | null;
  notes: string | null;
  remindBeforeMinutes: CalendarReminderOffsetMinutes | null;
};

export type ConfirmAnalysisCalendarAction = CalendarEventFields & {
  action: "confirm_analysis";
  analysisId: string;
  eventKey: string;
};

export type CreateManualCalendarAction = CalendarEventFields & {
  action: "create_manual";
  requestId: string;
  sourceLanguage: SupportedLanguage;
};

export type UpdateCalendarAction = CalendarEventFields & {
  action: "update";
  eventId: string;
  expectedUpdatedAt: string;
};

export type DeleteCalendarAction = {
  action: "delete";
  eventId: string;
};

export type SetCalendarReminderAction = {
  action: "set_reminder";
  eventId: string;
  remindBeforeMinutes: CalendarReminderOffsetMinutes | null;
};

export type CalendarAction =
  | ConfirmAnalysisCalendarAction
  | CreateManualCalendarAction
  | UpdateCalendarAction
  | DeleteCalendarAction
  | SetCalendarReminderAction;
