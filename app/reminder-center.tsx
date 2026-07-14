"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult, DocumentEvent, SupportedLanguage } from "./analysis-schema";
import { loadReminderState, ReminderRequestError, updateReminderState } from "./reminder-client";
import { reminderCopy } from "./reminder-copy";
import { availableReminderOffsets, zonedLocalDateTimeToUtc } from "./reminder-time";
import {
  isSupportedReminderTimeZone,
  reminderOffsets,
  supportedReminderTimeZones,
  type ReminderOffsetMinutes,
  type ReminderState,
  type ScheduledReminder,
} from "./reminder-types";

function localeTag(locale: SupportedLanguage): string {
  return locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-GB";
}

function displayEvents(result: AnalysisResult): DocumentEvent[] {
  if (result.events?.length) return result.events.slice(0, 8);
  return result.deadlines.slice(0, 8).map((deadline, index) => ({
    id: `deadline_${index + 1}`,
    title: deadline.meaning || deadline.dateText || "Deadline",
    kind: "deadline",
    dateText: deadline.dateText,
    localDate: deadline.normalizedDate,
    localTime: null,
    documentTimeZone: null,
    location: null,
    status: deadline.status,
    evidenceIds: deadline.evidenceIds,
    confidence: deadline.confidence,
    basis: deadline.basis,
  }));
}

function offsetLabel(offset: ReminderOffsetMinutes, copy: (typeof reminderCopy)[SupportedLanguage]): string {
  if (offset === 60) return copy.hour;
  if (offset === 1_440) return copy.day;
  if (offset === 10_080) return copy.week;
  return copy.month;
}

function reminderStatus(reminder: ScheduledReminder, copy: (typeof reminderCopy)[SupportedLanguage]): string {
  if (reminder.status === "sent") return copy.sent;
  if (reminder.status === "failed") return copy.failed;
  if (reminder.status === "sending") return copy.sending;
  return copy.scheduled;
}

export function ReminderCenter({
  result,
  analysisId,
  locale,
}: {
  result: AnalysisResult;
  analysisId: string | null;
  locale: SupportedLanguage;
}) {
  const copy = reminderCopy[locale];
  const events = useMemo(() => displayEvents(result), [result]);
  const [state, setState] = useState<ReminderState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [preferenceTimezone, setPreferenceTimezone] = useState("Europe/Riga");
  const [eventDates, setEventDates] = useState<Record<string, string>>(() => Object.fromEntries(events.map((event) => [event.id, event.localDate ?? ""])));
  const [eventTimes, setEventTimes] = useState<Record<string, string>>(() => Object.fromEntries(events.map((event) => [event.id, event.localTime ?? ""])));
  const [eventTimezones, setEventTimezones] = useState<Record<string, string>>({});
  const [selectedOffsets, setSelectedOffsets] = useState<Record<string, ReminderOffsetMinutes>>(() => Object.fromEntries(events.map((event) => [event.id, 1_440])));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const autoAttempted = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadReminderState();
      setState(next);
      setPreferenceTimezone(next.preference.timezone);
      setEventTimezones((current) => {
        const updated = { ...current };
        for (const event of events) {
          if (!updated[event.id]) {
            updated[event.id] = event.documentTimeZone && isSupportedReminderTimeZone(event.documentTimeZone)
              ? event.documentTimeZone
              : next.preference.timezone;
          }
        }
        return updated;
      });
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError, events]);

  useEffect(() => { void refresh(); }, [refresh]);

  const applyAction = useCallback(async (action: Parameters<typeof updateReminderState>[0], successMessage?: string) => {
    setError(null);
    setNotice(null);
    try {
      const next = await updateReminderState(action);
      setState(next);
      setPreferenceTimezone(next.preference.timezone);
      if (successMessage) setNotice(successMessage);
      return next;
    } catch (actionError) {
      setError(actionError instanceof ReminderRequestError && actionError.code === "reminder_too_late" ? copy.noAvailableOffsets : copy.actionError);
      return null;
    }
  }, [copy.actionError, copy.noAvailableOffsets]);

  const existingFor = useCallback((event: DocumentEvent) => state?.reminders.find((reminder) => reminder.analysisId === analysisId && reminder.eventKey === event.id), [analysisId, state]);

  const scheduleEvent = useCallback(async (event: DocumentEvent, offset: ReminderOffsetMinutes, automatic = false) => {
    if (!analysisId) return null;
    const localDate = eventDates[event.id] || event.localDate || "";
    const localTime = eventTimes[event.id] || event.localTime || "";
    const timezone = eventTimezones[event.id] || state?.preference.timezone || "Europe/Riga";
    if (!localDate || !localTime) {
      setError(!localDate ? copy.dateMissing : copy.timeMissing);
      return null;
    }
    setBusyKey(event.id);
    const sourceLanguage = result.sourceLanguage === "ru" || result.sourceLanguage === "lv" || result.sourceLanguage === "en"
      ? result.sourceLanguage
      : result.outputLanguage;
    const next = await applyAction({
      action: "schedule",
      analysisId,
      eventKey: event.id,
      eventTitle: event.title,
      localDate,
      localTime,
      timezone,
      remindBeforeMinutes: offset,
      sourceLanguage,
    }, automatic ? copy.autoScheduled : copy.saved);
    setBusyKey(null);
    return next;
  }, [analysisId, applyAction, copy.autoScheduled, copy.dateMissing, copy.saved, copy.timeMissing, eventDates, eventTimes, eventTimezones, result.outputLanguage, result.sourceLanguage, state?.preference.timezone]);

  useEffect(() => {
    if (!state?.preference.consentAt || !analysisId || busyKey) return;
    const candidate = events.find((event) => {
      const key = `${analysisId}:${event.id}`;
      if (autoAttempted.current.has(key) || existingFor(event) || !event.localDate || !event.localTime) return false;
      const timezone = eventTimezones[event.id] || state.preference.timezone;
      return availableReminderOffsets({ localDate: event.localDate, localTime: event.localTime, timeZone: timezone }).includes(1_440);
    });
    if (!candidate) return;
    autoAttempted.current.add(`${analysisId}:${candidate.id}`);
    void scheduleEvent(candidate, 1_440, true);
  }, [analysisId, busyKey, eventTimezones, events, existingFor, scheduleEvent, state]);

  const enableConsent = async () => {
    if (!consentChecked) return;
    setBusyKey("consent");
    await applyAction({ action: "preference", consent: true, timezone: preferenceTimezone });
    setBusyKey(null);
  };

  const cancelReminder = async (reminder: ScheduledReminder) => {
    setBusyKey(reminder.eventKey);
    await applyAction({ action: "cancel", reminderId: reminder.id }, copy.cancelled);
    setBusyKey(null);
  };

  if (loading) return <section className="reminder-card reminder-loading" aria-busy="true"><p>{copy.eyebrow}</p><div /></section>;
  if (!state) return <section className="reminder-card"><p className="reminder-error" role="alert">{error || copy.loadError}</p></section>;
  if (state.availability !== "available") return null;

  return (
    <section className="reminder-card" aria-labelledby="reminder-title">
      <header className="reminder-heading">
        <span className="reminder-icon" aria-hidden="true">◷</span>
        <div><p className="result-label">{copy.eyebrow}</p><h2 id="reminder-title">{copy.title}</h2><p>{copy.intro}</p></div>
      </header>

      {!state.preference.consentAt ? (
        <div className="reminder-consent">
          <div><strong>{copy.consentTitle}</strong><p>{copy.consentText}</p></div>
          <label className="reminder-checkbox"><input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} /> <span>{copy.consentCheckbox}</span></label>
          <label className="reminder-field"><span>{copy.timezone}</span><select value={preferenceTimezone} onChange={(event) => setPreferenceTimezone(event.target.value)}>{supportedReminderTimeZones.map((zone) => <option value={zone} key={zone}>{zone}</option>)}</select><small>{copy.timezoneHelp}</small></label>
          <button className="reminder-primary" type="button" disabled={!consentChecked || busyKey === "consent"} onClick={() => void enableConsent()}>{busyKey === "consent" ? copy.enabling : copy.enable}</button>
        </div>
      ) : !analysisId ? <p className="reminder-state">{copy.savingAnalysis}</p> : events.length === 0 ? <p className="reminder-state">{copy.noEvents}</p> : (
        <div className="reminder-events">
          <p className="reminder-default-note"><span aria-hidden="true">i</span>{copy.defaultNote}</p>
          {events.map((event) => {
            const existing = existingFor(event);
            const localDate = eventDates[event.id] || "";
            const localTime = eventTimes[event.id] || "";
            const timezone = eventTimezones[event.id] || state.preference.timezone;
            const offsets = localDate && localTime ? availableReminderOffsets({ localDate, localTime, timeZone: timezone }) : [];
            const selected = offsets.includes(selectedOffsets[event.id]) ? selectedOffsets[event.id] : offsets[0];
            const eventAt = localDate && localTime ? zonedLocalDateTimeToUtc(localDate, localTime, timezone) : null;
            const sendAt = eventAt && selected ? new Date(eventAt.getTime() - selected * 60_000) : null;
            const zoneOptions = Array.from(new Set([...supportedReminderTimeZones, timezone]));
            const locked = existing?.status === "sent" || existing?.status === "sending";
            return (
              <article className="reminder-event" key={event.id}>
                <div className="reminder-event-title"><div><strong>{event.title}</strong><small>{event.dateText || copy.verify}</small></div>{existing && <span className={`reminder-status status-${existing.status}`}>{reminderStatus(existing, copy)}</span>}</div>
                <div className="reminder-fields">
                  <label className="reminder-field"><span>{copy.date}</span><input type="date" value={localDate} disabled={locked} onChange={(change) => setEventDates((current) => ({ ...current, [event.id]: change.target.value }))} />{!event.localDate && <small>{copy.dateMissing}</small>}</label>
                  <label className="reminder-field"><span>{copy.time}</span><input type="time" value={localTime} disabled={locked} onChange={(change) => setEventTimes((current) => ({ ...current, [event.id]: change.target.value }))} />{!event.localTime && <small>{copy.timeMissing}</small>}</label>
                  <label className="reminder-field"><span>{copy.eventTimezone}</span><select value={timezone} disabled={locked} onChange={(change) => setEventTimezones((current) => ({ ...current, [event.id]: change.target.value }))}>{zoneOptions.map((zone) => <option value={zone} key={zone}>{zone}</option>)}</select></label>
                </div>
                {!locked && <fieldset className="reminder-options"><legend>{copy.remindWhen}</legend><div>{reminderOffsets.map((offset) => <button type="button" key={offset} disabled={!offsets.includes(offset)} className={selected === offset ? "active" : ""} aria-pressed={selected === offset} onClick={() => setSelectedOffsets((current) => ({ ...current, [event.id]: offset }))}>{offsetLabel(offset, copy)}</button>)}</div></fieldset>}
                {sendAt && !locked ? <p className="reminder-send-time">{copy.willSend}: <strong>{new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(sendAt)}</strong></p> : !locked && localTime && <p className="reminder-warning">{copy.noAvailableOffsets}</p>}
                <div className="reminder-actions">
                  {!locked && selected && <button className="reminder-primary" type="button" disabled={busyKey === event.id || !localDate || !localTime} onClick={() => void scheduleEvent(event, selected)}>{busyKey === event.id ? copy.scheduling : existing ? copy.replace : copy.schedule}</button>}
                  {existing?.status === "scheduled" && <button className="reminder-secondary" type="button" disabled={busyKey === event.id} onClick={() => void cancelReminder(existing)}>{busyKey === event.id ? copy.cancelling : copy.cancel}</button>}
                </div>
              </article>
            );
          })}
          <p className="reminder-footnote">{copy.sourceLanguage} {copy.verify}</p>
        </div>
      )}
      {notice && <p className="reminder-notice" role="status">✓ {notice}</p>}
      {error && <p className="reminder-error" role="alert">{error}</p>}
    </section>
  );
}
