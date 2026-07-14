"use client";

import { useId, useState } from "react";
import {
  profileReminderMinutes,
  type ProfileDensity,
  type ProfileFontScale,
  type ProfileLanguage,
  type ProfileTheme,
  type ProfileTimeFormat,
  type ProfileWeekStartsOn,
  type UserProfilePatch,
  type UserProfilePreferences,
} from "./profile-types";

type ProfileSettingsProps = {
  locale: ProfileLanguage;
  preferences: UserProfilePreferences;
  onChange: (patch: UserProfilePatch) => void | Promise<void>;
  disabled?: boolean;
};

const copy = {
  en: {
    title: "Preferences", intro: "These settings follow your account across devices.", language: "Languages",
    interfaceLanguage: "Interface language", analysisLanguage: "Default explanation language", appearance: "Appearance",
    theme: "Theme", system: "Use device setting", light: "Light", dark: "Dark", fontScale: "Text size",
    normal: "Normal", large: "Large", density: "Layout spacing", comfortable: "Comfortable", compact: "Compact",
    reducedMotion: "Reduce animations", planning: "Calendar and reminders", weekStartsOn: "Week starts on",
    monday: "Monday", sunday: "Sunday", timeFormat: "Time format", defaultReminder: "Default email reminder",
    hour: "1 hour before", day: "1 day before", week: "1 week before", month: "1 month before",
    files: "Files", autoSaveFiles: "Save uploaded files to my private account storage automatically",
    saving: "Saving…", saved: "Preferences saved", error: "Could not save preferences. Try again.",
  },
  ru: {
    title: "Настройки", intro: "Эти настройки сохраняются в аккаунте и работают на всех устройствах.", language: "Языки",
    interfaceLanguage: "Язык интерфейса", analysisLanguage: "Язык объяснения по умолчанию", appearance: "Внешний вид",
    theme: "Тема", system: "Как на устройстве", light: "Светлая", dark: "Тёмная", fontScale: "Размер текста",
    normal: "Обычный", large: "Крупный", density: "Плотность интерфейса", comfortable: "Просторная", compact: "Компактная",
    reducedMotion: "Уменьшить анимации", planning: "Календарь и напоминания", weekStartsOn: "Первый день недели",
    monday: "Понедельник", sunday: "Воскресенье", timeFormat: "Формат времени", defaultReminder: "Напоминание по умолчанию",
    hour: "За 1 час", day: "За 1 день", week: "За 1 неделю", month: "За 1 месяц",
    files: "Файлы", autoSaveFiles: "Автоматически сохранять загруженные файлы в приватном хранилище аккаунта",
    saving: "Сохраняем…", saved: "Настройки сохранены", error: "Не удалось сохранить настройки. Попробуйте ещё раз.",
  },
  lv: {
    title: "Iestatījumi", intro: "Šie iestatījumi tiek saglabāti kontā un darbojas visās ierīcēs.", language: "Valodas",
    interfaceLanguage: "Saskarnes valoda", analysisLanguage: "Noklusējuma skaidrojuma valoda", appearance: "Izskats",
    theme: "Motīvs", system: "Izmantot ierīces iestatījumu", light: "Gaišs", dark: "Tumšs", fontScale: "Teksta izmērs",
    normal: "Parasts", large: "Liels", density: "Saskarnes atstarpes", comfortable: "Ērtas", compact: "Kompaktas",
    reducedMotion: "Samazināt animācijas", planning: "Kalendārs un atgādinājumi", weekStartsOn: "Nedēļas pirmā diena",
    monday: "Pirmdiena", sunday: "Svētdiena", timeFormat: "Laika formāts", defaultReminder: "Noklusējuma atgādinājums",
    hour: "1 stundu iepriekš", day: "1 dienu iepriekš", week: "1 nedēļu iepriekš", month: "1 mēnesi iepriekš",
    files: "Faili", autoSaveFiles: "Automātiski saglabāt augšupielādētos failus konta privātajā krātuvē",
    saving: "Saglabā…", saved: "Iestatījumi saglabāti", error: "Neizdevās saglabāt iestatījumus. Mēģiniet vēlreiz.",
  },
} as const;

const languageLabels: Record<ProfileLanguage, string> = { en: "English", ru: "Русский", lv: "Latviešu" };

export function ProfileSettings({ locale, preferences, onChange, disabled = false }: ProfileSettingsProps) {
  const t = copy[locale];
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const locked = disabled || saving;

  const apply = async <K extends keyof UserProfilePreferences>(key: K, value: UserProfilePreferences[K]) => {
    setSaving(true);
    setSaved(false);
    setError(false);
    try {
      await onChange({ [key]: value } as UserProfilePatch);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const reminderLabel = (minutes: number) => minutes === 60 ? t.hour : minutes === 1_440 ? t.day : minutes === 10_080 ? t.week : t.month;

  return (
    <section className="profile-settings" aria-labelledby={`${id}-title`} aria-busy={saving}>
      <header><h3 id={`${id}-title`}>{t.title}</h3><p>{t.intro}</p></header>

      <fieldset disabled={locked}>
        <legend>{t.language}</legend>
        <label htmlFor={`${id}-ui-language`}>{t.interfaceLanguage}</label>
        <select id={`${id}-ui-language`} value={preferences.uiLanguage}
          onChange={(event) => void apply("uiLanguage", event.target.value as ProfileLanguage)}>
          {Object.entries(languageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label htmlFor={`${id}-analysis-language`}>{t.analysisLanguage}</label>
        <select id={`${id}-analysis-language`} value={preferences.analysisLanguage}
          onChange={(event) => void apply("analysisLanguage", event.target.value as ProfileLanguage)}>
          {Object.entries(languageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </fieldset>

      <fieldset disabled={locked}>
        <legend>{t.appearance}</legend>
        <label htmlFor={`${id}-theme`}>{t.theme}</label>
        <select id={`${id}-theme`} value={preferences.theme}
          onChange={(event) => void apply("theme", event.target.value as ProfileTheme)}>
          <option value="system">{t.system}</option><option value="light">{t.light}</option><option value="dark">{t.dark}</option>
        </select>
        <label htmlFor={`${id}-font-scale`}>{t.fontScale}</label>
        <select id={`${id}-font-scale`} value={preferences.fontScale}
          onChange={(event) => void apply("fontScale", event.target.value as ProfileFontScale)}>
          <option value="normal">{t.normal}</option><option value="large">{t.large}</option>
        </select>
        <label htmlFor={`${id}-density`}>{t.density}</label>
        <select id={`${id}-density`} value={preferences.density}
          onChange={(event) => void apply("density", event.target.value as ProfileDensity)}>
          <option value="comfortable">{t.comfortable}</option><option value="compact">{t.compact}</option>
        </select>
        <label className="profile-settings-check"><input type="checkbox" checked={preferences.reducedMotion}
          onChange={(event) => void apply("reducedMotion", event.target.checked)} /> <span>{t.reducedMotion}</span></label>
      </fieldset>

      <fieldset disabled={locked}>
        <legend>{t.planning}</legend>
        <label htmlFor={`${id}-week-start`}>{t.weekStartsOn}</label>
        <select id={`${id}-week-start`} value={preferences.weekStartsOn}
          onChange={(event) => void apply("weekStartsOn", event.target.value as ProfileWeekStartsOn)}>
          <option value="monday">{t.monday}</option><option value="sunday">{t.sunday}</option>
        </select>
        <label htmlFor={`${id}-time-format`}>{t.timeFormat}</label>
        <select id={`${id}-time-format`} value={preferences.timeFormat}
          onChange={(event) => void apply("timeFormat", event.target.value as ProfileTimeFormat)}>
          <option value="12">12</option><option value="24">24</option>
        </select>
        <label htmlFor={`${id}-default-reminder`}>{t.defaultReminder}</label>
        <select id={`${id}-default-reminder`} value={preferences.defaultReminderMinutes}
          onChange={(event) => void apply("defaultReminderMinutes", Number(event.target.value) as UserProfilePreferences["defaultReminderMinutes"])}>
          {profileReminderMinutes.map((minutes) => <option value={minutes} key={minutes}>{reminderLabel(minutes)}</option>)}
        </select>
      </fieldset>

      <fieldset disabled={locked}>
        <legend>{t.files}</legend>
        <label className="profile-settings-check"><input type="checkbox" checked={preferences.autoSaveFiles}
          onChange={(event) => void apply("autoSaveFiles", event.target.checked)} /> <span>{t.autoSaveFiles}</span></label>
      </fieldset>

      <div className="profile-settings-status" aria-live="polite">
        {saving && <p role="status">{t.saving}</p>}
        {!saving && saved && <p role="status">✓ {t.saved}</p>}
        {!saving && error && <p role="alert">{t.error}</p>}
      </div>
    </section>
  );
}
