"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnalysisResult, DocumentEvent, SupportedLanguage } from "./analysis-schema";
import { CalendarRequestError, updateCalendar } from "./calendar-client";
import { loadReminderState, updateReminderState } from "./reminder-client";
import { reminderOffsets, reminderQuotaBlocked, supportedReminderTimeZones, type ReminderOffsetMinutes } from "./reminder-types";
import type { UserProfilePreferences } from "./profile-types";

const copy = {
  en: { eyebrow: "Plan it", title: "Add important dates to your calendar", intro: "Review the date and time first. Nothing is added until you confirm.", date: "Date", time: "Time", allDay: "All day / time unknown", timezone: "Time zone", reminder: "Email reminder", none: "No email", hour: "1 hour before", day: "1 day before", week: "1 week before", month: "1 month before", consent: "I agree to receive WhatNow? email reminders. I can turn them off in My space.", add: "Add to calendar", adding: "Adding…", added: "Added to calendar", saveFirst: "Saving the analysis first…", verify: "Check this against the original document.", error: "Could not add the event. Check the date, time and reminder consent.", noEvents: "No clear dated events were found." },
  ru: { eyebrow: "Запланируйте", title: "Добавьте важные даты в календарь", intro: "Сначала проверьте дату и время. Без вашего подтверждения ничего не добавляется.", date: "Дата", time: "Время", allDay: "Весь день / время неизвестно", timezone: "Часовой пояс", reminder: "Email-напоминание", none: "Без письма", hour: "За 1 час", day: "За 1 день", week: "За 1 неделю", month: "За 1 месяц", consent: "Я согласен получать email-напоминания WhatNow?. Их можно отключить в разделе «Моё пространство».", add: "Добавить в календарь", adding: "Добавляем…", added: "Добавлено в календарь", saveFirst: "Сначала сохраняем разбор…", verify: "Сверьте данные с исходным документом.", error: "Не удалось добавить событие. Проверьте дату, время и согласие на письма.", noEvents: "Чётких событий с датой не найдено." },
  lv: { eyebrow: "Ieplānojiet", title: "Pievienojiet svarīgos datumus kalendāram", intro: "Vispirms pārbaudiet datumu un laiku. Nekas netiek pievienots bez jūsu apstiprinājuma.", date: "Datums", time: "Laiks", allDay: "Visu dienu / laiks nav zināms", timezone: "Laika josla", reminder: "E-pasta atgādinājums", none: "Bez e-pasta", hour: "1 stundu iepriekš", day: "1 dienu iepriekš", week: "1 nedēļu iepriekš", month: "1 mēnesi iepriekš", consent: "Es piekrītu saņemt WhatNow? e-pasta atgādinājumus. Tos var izslēgt sadaļā Mana telpa.", add: "Pievienot kalendāram", adding: "Pievieno…", added: "Pievienots kalendāram", saveFirst: "Vispirms saglabā analīzi…", verify: "Salīdziniet ar sākotnējo dokumentu.", error: "Neizdevās pievienot notikumu. Pārbaudiet datumu, laiku un piekrišanu.", noEvents: "Skaidri datēti notikumi netika atrasti." },
} as const;

function eventsFrom(result: AnalysisResult): DocumentEvent[] {
  if (result.events?.length) return result.events.filter((event) => event.status !== "not_found").slice(0, 8);
  return result.deadlines.filter((deadline) => deadline.status !== "not_found").slice(0, 8).map((deadline, index) => ({ id: `deadline_${index + 1}`, title: deadline.meaning || deadline.dateText || "Deadline", kind: "deadline", dateText: deadline.dateText, localDate: deadline.normalizedDate, localTime: null, documentTimeZone: null, location: null, status: deadline.status, evidenceIds: deadline.evidenceIds, confidence: deadline.confidence, basis: deadline.basis }));
}

function limitText(locale: SupportedLanguage) {
  return locale === "ru" ? "Лимит email-напоминаний достигнут: максимум 3 активных и 10 за 7 дней. Событие можно добавить без письма." : locale === "lv" ? "E-pasta atgādinājumu limits sasniegts: ne vairāk kā 3 aktīvi un 10 septiņās dienās. Notikumu var pievienot bez e-pasta." : "The email reminder limit is reached: up to 3 active and 10 in 7 days. You can still add the event without email.";
}

export function EventSuggestions({ result, analysisId, locale, preferences }: { result: AnalysisResult; analysisId: string | null; locale: SupportedLanguage; preferences: UserProfilePreferences }) {
  const t = copy[locale];
  const events = useMemo(() => eventsFrom(result), [result]);
  const [dates, setDates] = useState<Record<string, string>>(() => Object.fromEntries(events.map((event) => [event.id, event.localDate ?? ""])));
  const [times, setTimes] = useState<Record<string, string>>(() => Object.fromEntries(events.map((event) => [event.id, event.localTime ?? ""])));
  const [allDay, setAllDay] = useState<Record<string, boolean>>(() => Object.fromEntries(events.map((event) => [event.id, !event.localTime])));
  const [zones, setZones] = useState<Record<string, string>>(() => Object.fromEntries(events.map((event) => [event.id, event.documentTimeZone && supportedReminderTimeZones.includes(event.documentTimeZone as never) ? event.documentTimeZone : "Europe/Riga"])));
  const [offsets, setOffsets] = useState<Record<string, "none" | `${ReminderOffsetMinutes}`>>(() => Object.fromEntries(events.map((event) => [event.id, event.localTime ? String(preferences.defaultReminderMinutes) : "none"])));
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [remindersAvailable, setRemindersAvailable] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [consented, setConsented] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  useEffect(() => {
    let active = true;
    loadReminderState().then((state) => {
      if (!active) return;
      const blocked = reminderQuotaBlocked(state.quota);
      setRemindersAvailable(state.availability === "available" && !blocked);
      setLimitReached(blocked);
      setConsented(Boolean(state.preference.consentAt));
      if (state.availability !== "available" || blocked) setOffsets((current) => Object.fromEntries(Object.keys(current).map((key) => [key, "none"])));
    }).catch(() => { if (active) setRemindersAvailable(false); });
    return () => { active = false; };
  }, []);

  if (!events.length) return null;
  const label = (offset: ReminderOffsetMinutes) => offset === 60 ? t.hour : offset === 1_440 ? t.day : offset === 10_080 ? t.week : t.month;

  const confirm = async (event: DocumentEvent) => {
    if (!analysisId) return;
    setBusy(event.id); setError(null);
    const isAllDay = allDay[event.id];
    try {
      const reminder = isAllDay || offsets[event.id] === "none" ? null : Number(offsets[event.id]) as ReminderOffsetMinutes;
      if (reminder && !consented) {
        if (!consentChecked) { setError(t.consent); return; }
        await updateReminderState({ action: "preference", consent: true, timezone: zones[event.id] });
        setConsented(true);
      }
      await updateCalendar({
        action: "confirm_analysis",
        analysisId,
        eventKey: event.id,
        eventTitle: event.title,
        localDate: dates[event.id],
        localTime: isAllDay ? null : times[event.id],
        timezone: zones[event.id],
        isAllDay,
        location: event.location,
        notes: event.dateText ? `${t.verify} ${event.dateText}` : t.verify,
        remindBeforeMinutes: reminder,
      });
      setAdded((current) => new Set(current).add(event.id));
      try {
        const latest = await loadReminderState();
        const blocked = reminderQuotaBlocked(latest.quota);
        setRemindersAvailable(latest.availability === "available" && !blocked);
        setLimitReached(blocked);
        if (blocked) setOffsets((current) => Object.fromEntries(Object.keys(current).map((key) => [key, "none"])));
      } catch {
        // The event was already saved; a non-critical quota refresh must not report it as failed.
      }
    } catch (saveError) { setError(saveError instanceof CalendarRequestError && (saveError.code === "active_reminder_limit" || saveError.code === "weekly_reminder_limit") ? limitText(locale) : t.error); }
    finally { setBusy(null); }
  };

  return <section className="event-suggestions" aria-labelledby="event-suggestions-title"><header><span className="calendar-spark" aria-hidden="true">□</span><div><p className="result-label">{t.eyebrow}</p><h2 id="event-suggestions-title">{t.title}</h2><p>{t.intro}</p></div></header>{limitReached && <p className="reminder-error" role="status">{limitText(locale)}</p>}<div className="suggestion-list">{events.map((event) => { const done = added.has(event.id); const isAllDay = allDay[event.id]; const wantsReminder = !isAllDay && offsets[event.id] !== "none"; return <article key={event.id}><div className="suggestion-title"><div><strong>{event.title}</strong><small>{event.dateText || t.verify}</small></div>{done && <span>✓ {t.added}</span>}</div><div className="suggestion-fields"><label><span>{t.date}</span><input type="date" value={dates[event.id]} onChange={(e) => setDates({ ...dates, [event.id]: e.target.value })} /></label><label><span>{t.time}</span><input type="time" disabled={isAllDay} value={times[event.id]} onChange={(e) => setTimes({ ...times, [event.id]: e.target.value })} /></label><label><span>{t.timezone}</span><select value={zones[event.id]} onChange={(e) => setZones({ ...zones, [event.id]: e.target.value })}>{supportedReminderTimeZones.map((zone) => <option key={zone}>{zone}</option>)}</select></label><label><span>{t.reminder}</span><select disabled={isAllDay || !remindersAvailable} value={remindersAvailable ? offsets[event.id] : "none"} onChange={(e) => setOffsets({ ...offsets, [event.id]: e.target.value as "none" | `${ReminderOffsetMinutes}` })}><option value="none">{t.none}</option>{reminderOffsets.map((offset) => <option key={offset} value={offset}>{label(offset)}</option>)}</select></label></div><label className="suggestion-all-day"><input type="checkbox" checked={isAllDay} onChange={(e) => { const value = e.target.checked; setAllDay({ ...allDay, [event.id]: value }); if (value) setOffsets({ ...offsets, [event.id]: "none" }); }} /><span>{t.allDay}</span></label>{wantsReminder && !consented && <label className="reminder-checkbox compact suggestion-consent"><input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} /><span>{t.consent}</span></label>}<div className="suggestion-actions"><button type="button" className="reminder-primary" disabled={!analysisId || busy === event.id || done || !dates[event.id] || (!isAllDay && !times[event.id])} onClick={() => void confirm(event)}>{!analysisId ? t.saveFirst : busy === event.id ? t.adding : done ? t.added : t.add}</button><small>{t.verify}</small></div></article>; })}</div>{error && <p className="reminder-error" role="alert">{error}</p>}</section>;
}
