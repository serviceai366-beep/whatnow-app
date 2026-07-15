"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadCalendarState, updateCalendar, CalendarRequestError } from "./calendar-client";
import { updateReminderState } from "./reminder-client";
import type { CalendarEvent, CalendarState } from "./calendar-types";
import { calendarReminderOffsets, supportedReminderTimeZones, type CalendarReminderOffsetMinutes } from "./reminder-types";
import type { ProfileLanguage, UserProfilePreferences } from "./profile-types";

type Props = {
  open: boolean;
  locale: ProfileLanguage;
  preferences: UserProfilePreferences;
  onClose: () => void;
};

type Draft = {
  title: string;
  date: string;
  time: string;
  allDay: boolean;
  timezone: string;
  location: string;
  notes: string;
  reminder: "none" | `${CalendarReminderOffsetMinutes}`;
};

const copy = {
  en: { title: "Calendar", subtitle: "Meetings, deadlines and email reminders in one place.", previous: "Previous month", next: "Next month", today: "Today", close: "Close calendar", add: "Add event", emptyDay: "Nothing planned for this day.", allDay: "All day", at: "at", location: "Location", edit: "Edit", remove: "Delete", deleteConfirm: "Delete this event and cancel its future email reminder?", formNew: "New event", formEdit: "Edit event", eventTitle: "What should we remind you about?", date: "Reminder date", time: "Reminder time", timezone: "Time zone", notes: "Notes", reminder: "When to email", exact: "At the selected time", none: "No email", hour: "1 hour before", day: "1 day before", week: "1 week before", month: "1 month before", consent: "I agree to receive WhatNow? email reminders. I can turn them off in My space.", consentRequired: "Please confirm the one-time email consent below, then save again.", save: "Save event", saving: "Saving…", cancel: "Cancel", loading: "Loading calendar…", loadError: "Could not load the calendar.", saveError: "Could not save this event. Choose a future date and time at least 5 minutes from now.", conflict: "This event changed elsewhere. Reload the calendar and try again.", limit: "The calendar can keep up to 100 active events.", emailOff: "Email reminders are off. Events still stay in your calendar.", emailPilot: "Email delivery is not available for this account yet.", emailOn: "Email reminders are enabled.", scheduled: "Email scheduled", sent: "Email sent", failed: "Email needs attention" },
  ru: { title: "Календарь", subtitle: "Встречи, сроки и email-напоминания в одном месте.", previous: "Предыдущий месяц", next: "Следующий месяц", today: "Сегодня", close: "Закрыть календарь", add: "Добавить событие", emptyDay: "На этот день ничего не запланировано.", allDay: "Весь день", at: "в", location: "Место", edit: "Изменить", remove: "Удалить", deleteConfirm: "Удалить событие и отменить будущее email-напоминание?", formNew: "Новое событие", formEdit: "Изменить событие", eventTitle: "О чём напомнить?", date: "Дата напоминания", time: "Время напоминания", timezone: "Часовой пояс", notes: "Заметки", reminder: "Когда отправить письмо", exact: "В выбранное время", none: "Без письма", hour: "За 1 час", day: "За 1 день", week: "За 1 неделю", month: "За 1 месяц", consent: "Я согласен получать email-напоминания WhatNow?. Их можно отключить в разделе «Моё пространство».", consentRequired: "Подтвердите разовое согласие на письма ниже, затем снова нажмите «Сохранить событие».", save: "Сохранить событие", saving: "Сохраняем…", cancel: "Отмена", loading: "Загружаем календарь…", loadError: "Не удалось загрузить календарь.", saveError: "Не удалось сохранить событие. Выберите будущие дату и время минимум через 5 минут.", conflict: "Событие изменилось на другом устройстве. Обновите календарь.", limit: "В календаре можно хранить до 100 активных событий.", emailOff: "Email-напоминания выключены. События всё равно сохраняются в календаре.", emailPilot: "Отправка писем пока недоступна для этого аккаунта.", emailOn: "Email-напоминания включены.", scheduled: "Письмо запланировано", sent: "Письмо отправлено", failed: "Проверьте письмо" },
  lv: { title: "Kalendārs", subtitle: "Tikšanās, termiņi un e-pasta atgādinājumi vienuviet.", previous: "Iepriekšējais mēnesis", next: "Nākamais mēnesis", today: "Šodien", close: "Aizvērt kalendāru", add: "Pievienot notikumu", emptyDay: "Šajā dienā nekas nav ieplānots.", allDay: "Visu dienu", at: "plkst.", location: "Vieta", edit: "Rediģēt", remove: "Dzēst", deleteConfirm: "Dzēst notikumu un atcelt nākamo e-pasta atgādinājumu?", formNew: "Jauns notikums", formEdit: "Rediģēt notikumu", eventTitle: "Par ko atgādināt?", date: "Atgādinājuma datums", time: "Atgādinājuma laiks", timezone: "Laika josla", notes: "Piezīmes", reminder: "Kad nosūtīt e-pastu", exact: "Izvēlētajā laikā", none: "Bez e-pasta", hour: "1 stundu iepriekš", day: "1 dienu iepriekš", week: "1 nedēļu iepriekš", month: "1 mēnesi iepriekš", consent: "Es piekrītu saņemt WhatNow? e-pasta atgādinājumus. Tos var izslēgt sadaļā Mana telpa.", consentRequired: "Apstipriniet vienreizējo piekrišanu e-pastiem zemāk un pēc tam saglabājiet vēlreiz.", save: "Saglabāt notikumu", saving: "Saglabā…", cancel: "Atcelt", loading: "Ielādē kalendāru…", loadError: "Neizdevās ielādēt kalendāru.", saveError: "Notikumu neizdevās saglabāt. Izvēlieties nākotnes datumu un laiku vismaz pēc 5 minūtēm.", conflict: "Notikums ir mainīts citā ierīcē. Atjauniniet kalendāru.", limit: "Kalendārā var glabāt līdz 100 aktīviem notikumiem.", emailOff: "E-pasta atgādinājumi ir izslēgti. Notikumi joprojām paliek kalendārā.", emailPilot: "E-pasta sūtīšana šim kontam vēl nav pieejama.", emailOn: "E-pasta atgādinājumi ir ieslēgti.", scheduled: "E-pasts ieplānots", sent: "E-pasts nosūtīts", failed: "E-pasts jāpārbauda" },
} as const;

function tag(locale: ProfileLanguage) { return locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-GB"; }
function iso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function startOfGrid(month: Date, monday: boolean) { const date = new Date(month.getFullYear(), month.getMonth(), 1); const day = date.getDay(); date.setDate(date.getDate() - (monday ? (day + 6) % 7 : day)); return date; }
function emptyDraft(date: string, timezone: string, remindersAvailable: boolean): Draft { return { title: "", date, time: "09:00", allDay: false, timezone, location: "", notes: "", reminder: remindersAvailable ? "0" : "none" }; }
function draftFromEvent(event: CalendarEvent): Draft { return { title: event.title, date: event.localDate, time: event.localTime ?? "09:00", allDay: event.isAllDay, timezone: event.timezone, location: event.location ?? "", notes: event.notes ?? "", reminder: event.reminder ? String(event.reminder.remindBeforeMinutes) as Draft["reminder"] : "none" }; }

export function CalendarPanel({ open, locale, preferences, onClose }: Props) {
  const t = copy[locale];
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => iso(new Date()));
  const [state, setState] = useState<CalendarState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(iso(new Date()), "Europe/Riga", false));
  const [consentChecked, setConsentChecked] = useState(false);
  const monday = preferences.weekStartsOn === "monday";
  const gridStart = useMemo(() => startOfGrid(month, monday), [month, monday]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(day.getDate() + index); return day; }), [gridStart]);
  const range = { from: iso(days[0]), to: iso(days[41]) };

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setState(await loadCalendarState(range.from, range.to)); }
    catch { setError(t.loadError); }
    finally { setLoading(false); }
  }, [range.from, range.to, t.loadError]);

  useEffect(() => { if (open) queueMicrotask(() => void refresh()); }, [open, refresh]);
  useEffect(() => { if (!open) return; const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [onClose, open]);
  useEffect(() => { if (!open) return; const current = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth() ? iso(new Date()) : iso(month); queueMicrotask(() => setSelectedDate(current)); }, [month, open]);

  if (!open) return null;
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of state?.events ?? []) byDate.set(event.localDate, [...(byDate.get(event.localDate) ?? []), event]);
  const selected = byDate.get(selectedDate) ?? [];
  const weekdayNames = Array.from({ length: 7 }, (_, index) => { const date = new Date(2026, 0, monday ? 5 + index : 4 + index); return new Intl.DateTimeFormat(tag(locale), { weekday: "short" }).format(date); });

  const openNew = (date = selectedDate) => { setSelectedDate(date); setEditing(null); setDraft(emptyDraft(date, state?.preference.timezone ?? "Europe/Riga", state?.availability === "available")); setConsentChecked(false); setError(null); };
  const openEdit = (event: CalendarEvent) => { setEditing(event); setDraft(draftFromEvent(event)); setError(null); };
  const submit = async () => {
    if (!draft.title.trim()) return;
    const reminder = draft.allDay || draft.reminder === "none" ? null : Number(draft.reminder) as CalendarReminderOffsetMinutes;
    if (reminder !== null && !state?.preference.consentAt && !consentChecked) { setError(t.consentRequired); return; }
    setBusy(true); setError(null);
    const fields = { eventTitle: draft.title.trim(), localDate: draft.date, localTime: draft.allDay ? null : draft.time, timezone: draft.timezone, isAllDay: draft.allDay, location: draft.location.trim() || null, notes: draft.notes.trim() || null, remindBeforeMinutes: reminder };
    try {
      if (reminder && !state?.preference.consentAt) {
        await updateReminderState({ action: "preference", consent: true, timezone: draft.timezone });
      }
      if (editing) await updateCalendar({ action: "update", eventId: editing.id, expectedUpdatedAt: editing.updatedAt, ...fields });
      else await updateCalendar({ action: "create_manual", requestId: crypto.randomUUID(), sourceLanguage: locale, ...fields });
      setEditing(undefined); setConsentChecked(false); await refresh(); setSelectedDate(draft.date);
    } catch (saveError) { setError(saveError instanceof CalendarRequestError && saveError.code === "event_conflict" ? t.conflict : t.saveError); }
    finally { setBusy(false); }
  };
  const remove = async (event: CalendarEvent) => {
    if (!window.confirm(t.deleteConfirm)) return;
    setBusy(true); setError(null);
    try { await updateCalendar({ action: "delete", eventId: event.id }); if (editing?.id === event.id) setEditing(undefined); await refresh(); }
    catch { setError(t.saveError); }
    finally { setBusy(false); }
  };
  const reminderText = (event: CalendarEvent) => event.reminder?.status === "sent" ? t.sent : event.reminder?.status === "failed" ? t.failed : event.reminder ? t.scheduled : null;

  return <div className="hub-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="calendar-panel" role="dialog" aria-modal="true" aria-labelledby="calendar-title">
      <header className="hub-panel-header"><div><p className="eyebrow">WhatNow?</p><h2 id="calendar-title">{t.title}</h2><p>{t.subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label={t.close} type="button">×</button></header>
      <div className="calendar-toolbar"><button type="button" aria-label={t.previous} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{new Intl.DateTimeFormat(tag(locale), { month: "long", year: "numeric" }).format(month)}</strong><button type="button" aria-label={t.next} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button><button type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(iso(now)); }}>{t.today}</button><button className="primary-mini" type="button" onClick={() => openNew()}>+ {t.add}</button></div>
      <div className="calendar-layout">
        <div className="calendar-month" aria-label={t.title}><div className="calendar-weekdays">{weekdayNames.map((name) => <span key={name}>{name}</span>)}</div><div className="calendar-grid">{days.map((day) => { const key = iso(day); const events = byDate.get(key) ?? []; const outside = day.getMonth() !== month.getMonth(); return <button type="button" key={key} className={`${key === selectedDate ? "selected " : ""}${outside ? "outside" : ""}`} onClick={() => openNew(key)} aria-pressed={key === selectedDate}><span>{day.getDate()}</span>{events.length > 0 && <small>{events.length}</small>}</button>; })}</div></div>
        <aside className="calendar-agenda"><div className="agenda-heading"><div><strong>{new Intl.DateTimeFormat(tag(locale), { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDate}T12:00:00`))}</strong><small>{t.limit}</small></div><button type="button" onClick={() => openNew()}>+ {t.add}</button></div>{loading ? <p className="panel-state">{t.loading}</p> : selected.length === 0 ? <p className="panel-state">{t.emptyDay}</p> : <ul>{selected.map((event) => <li key={event.id}><div><strong>{event.title}</strong><span>{event.isAllDay ? t.allDay : `${t.at} ${event.localTime}`}</span>{event.location && <span>{t.location}: {event.location}</span>}{reminderText(event) && <small>{reminderText(event)}</small>}</div><div><button type="button" onClick={() => openEdit(event)}>{t.edit}</button><button className="danger-link" type="button" disabled={busy} onClick={() => void remove(event)}>{t.remove}</button></div></li>)}</ul>}
          {state && <p className="calendar-email-state">{state.availability !== "available" ? t.emailPilot : state.preference.consentAt ? t.emailOn : t.emailOff}</p>}
        </aside>
      </div>
      {editing !== undefined && <div className="event-editor"><div className="event-editor-heading"><h3>{editing ? t.formEdit : t.formNew}</h3><button type="button" onClick={() => setEditing(undefined)}>×</button></div><div className="event-form-grid"><label><span>{t.eventTitle}</span><input autoFocus value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label><span>{t.date}</span><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label><label className="check-field"><input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft({ ...draft, allDay: e.target.checked, reminder: e.target.checked ? "none" : state?.availability === "available" ? "0" : "none" })} /><span>{t.allDay}</span></label><label><span>{t.time}</span><input type="time" disabled={draft.allDay} value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label><label><span>{t.timezone}</span><select value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>{supportedReminderTimeZones.map((zone) => <option value={zone} key={zone}>{zone}</option>)}</select></label><label><span>{t.location}</span><input value={draft.location} maxLength={300} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></label><label><span>{t.reminder}</span><select disabled={draft.allDay || state?.availability !== "available"} value={draft.reminder} onChange={(e) => setDraft({ ...draft, reminder: e.target.value as Draft["reminder"] })}><option value="none">{t.none}</option>{calendarReminderOffsets.map((offset) => <option key={offset} value={offset}>{offset === 0 ? t.exact : offset === 60 ? t.hour : offset === 1_440 ? t.day : offset === 10_080 ? t.week : t.month}</option>)}</select></label><label className="wide"><span>{t.notes}</span><textarea value={draft.notes} maxLength={2000} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>{draft.reminder !== "none" && !draft.allDay && !state?.preference.consentAt && <label className="wide reminder-checkbox compact"><input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} /><span>{t.consent}</span></label>}</div><div className="event-editor-actions"><button type="button" onClick={() => setEditing(undefined)}>{t.cancel}</button><button className="primary-button" disabled={busy || !draft.title.trim() || !draft.date || (!draft.allDay && !draft.time)} type="button" onClick={() => void submit()}>{busy ? t.saving : t.save}</button></div></div>}
      {error && <p className="hub-error" role="alert">{error}</p>}
    </section>
  </div>;
}
