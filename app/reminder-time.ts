import { reminderOffsets, type ReminderOffsetMinutes } from "./reminder-types.ts";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function isValidLocalDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidLocalTime(value: string): boolean {
  const match = TIME_PATTERN.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

export function zonedLocalDateTimeToUtc(localDate: string, localTime: string, timeZone: string): Date | null {
  if (!isValidLocalDate(localDate) || !isValidLocalTime(localTime)) return null;
  try {
    const [year, month, day] = localDate.split("-").map(Number);
    const [hour, minute] = localTime.split(":").map(Number);
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    let guess = targetAsUtc;

    for (let index = 0; index < 4; index += 1) {
      const observed = localParts(new Date(guess), timeZone);
      const observedAsUtc = Date.UTC(
        observed.year,
        observed.month - 1,
        observed.day,
        observed.hour,
        observed.minute,
        observed.second,
      );
      const correction = targetAsUtc - observedAsUtc;
      guess += correction;
      if (correction === 0) break;
    }

    const verified = localParts(new Date(guess), timeZone);
    if (
      verified.year !== year || verified.month !== month || verified.day !== day
      || verified.hour !== hour || verified.minute !== minute
    ) return null;
    return new Date(guess);
  } catch {
    return null;
  }
}

export function availableReminderOffsets({
  localDate,
  localTime,
  timeZone,
  now = new Date(),
  minimumLeadMinutes = 5,
}: {
  localDate: string;
  localTime: string;
  timeZone: string;
  now?: Date;
  minimumLeadMinutes?: number;
}): ReminderOffsetMinutes[] {
  const eventAt = zonedLocalDateTimeToUtc(localDate, localTime, timeZone);
  if (!eventAt) return [];
  const earliestSend = now.getTime() + minimumLeadMinutes * 60_000;
  return reminderOffsets.filter((offset) => eventAt.getTime() - offset * 60_000 > earliestSend);
}
