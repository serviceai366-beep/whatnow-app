"use client";

import { useEffect, useState } from "react";
import type { SupportedLanguage } from "./analysis-schema";
import { loadReminderState, updateReminderState } from "./reminder-client";
import { reminderCopy } from "./reminder-copy";
import { supportedReminderTimeZones, type ReminderState } from "./reminder-types";

function localeTag(locale: SupportedLanguage): string {
  return locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-GB";
}

export function ReminderProfileSection({ locale }: { locale: SupportedLanguage }) {
  const copy = reminderCopy[locale];
  const [state, setState] = useState<ReminderState | null>(null);
  const [timezone, setTimezone] = useState("Europe/Riga");
  const [consentChecked, setConsentChecked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadReminderState().then((next) => {
      if (!active) return;
      setState(next);
      setTimezone(next.preference.timezone);
    }).catch(() => { if (active) setError(copy.loadError); });
    return () => { active = false; };
  }, [copy.loadError]);

  if (!state || state.availability !== "available") return null;
  const consented = Boolean(state.preference.consentAt);
  const upcoming = state.reminders.filter((reminder) => reminder.status === "scheduled" || reminder.status === "sending");

  const updatePreference = async (consent: boolean) => {
    setBusy("preference");
    setError(null);
    setNotice(null);
    try {
      const next = await updateReminderState({ action: "preference", consent, timezone });
      setState(next);
      setTimezone(next.preference.timezone);
      setNotice(copy.settingsSaved);
    } catch {
      setError(copy.actionError);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (reminderId: string) => {
    setBusy(reminderId);
    setError(null);
    setNotice(null);
    try {
      const next = await updateReminderState({ action: "cancel", reminderId });
      setState(next);
      setNotice(copy.cancelled);
    } catch {
      setError(copy.actionError);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="profile-section reminder-profile" aria-labelledby="profile-reminder-title">
      <div className="profile-section-heading"><div><h3 id="profile-reminder-title">{copy.profileTitle}</h3><p>{copy.profileIntro}</p></div><span className={consented ? "enabled" : ""}>{consented ? copy.enabled : copy.disabled}</span></div>
      {!consented && <label className="reminder-checkbox compact"><input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} /><span>{copy.consentCheckbox}</span></label>}
      <label className="reminder-field"><span>{copy.timezone}</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}>{supportedReminderTimeZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label>
      <div className="reminder-profile-actions">
        <button type="button" className="reminder-primary" disabled={busy === "preference" || (!consented && !consentChecked)} onClick={() => void updatePreference(true)}>{busy === "preference" ? copy.enabling : consented ? copy.saveTimezone : copy.enable}</button>
        {consented && <button type="button" className="reminder-secondary danger" disabled={busy === "preference"} onClick={() => void updatePreference(false)}>{copy.disable}</button>}
      </div>
      {consented && <div className="reminder-upcoming"><strong>{copy.upcoming}</strong>{upcoming.length === 0 ? <p>{copy.noneUpcoming}</p> : <ul>{upcoming.map((reminder) => <li key={reminder.id}><div><span>{reminder.eventTitle}</span><small>{new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "short", timeStyle: "short", timeZone: reminder.timezone }).format(new Date(reminder.sendAt))}</small></div><button type="button" disabled={busy === reminder.id || reminder.status === "sending"} onClick={() => void cancel(reminder.id)}>{busy === reminder.id ? copy.cancelling : copy.cancel}</button></li>)}</ul>}</div>}
      {notice && <p className="reminder-notice" role="status">✓ {notice}</p>}
      {error && <p className="reminder-error" role="alert">{error}</p>}
    </section>
  );
}
