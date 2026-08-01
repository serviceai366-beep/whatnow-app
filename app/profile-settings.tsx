"use client";

import { useId, useState } from "react";
import {
  profileReminderMinutes,
  type ProfileDefaultModel,
  type ProfileDensity,
  type ProfileFontScale,
  type ProfileLanguage,
  type ProfileTheme,
  type ProfileTimeFormat,
  type ProfileWeekStartsOn,
  type UserProfilePatch,
  type UserProfilePreferences,
} from "./profile-types";
import type { SupportedLanguage } from "./analysis-schema";
import { interfaceLanguageOptions, responseLanguageOptions } from "./language-options";

type ProfileSettingsProps = {
  locale: ProfileLanguage;
  preferences: UserProfilePreferences;
  modelSelectionAvailable: boolean;
  onChange: (patch: UserProfilePatch) => void | Promise<void>;
  onOpenPlan: () => void;
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
  es: {
    title: "Preferencias", intro: "Estas preferencias siguen a tu cuenta en todos los dispositivos.", language: "Idiomas",
    interfaceLanguage: "Idioma de la interfaz", analysisLanguage: "Idioma predeterminado de la explicación", appearance: "Apariencia",
    theme: "Tema", system: "Usar ajuste del dispositivo", light: "Claro", dark: "Oscuro", fontScale: "Tamaño del texto",
    normal: "Normal", large: "Grande", density: "Espaciado", comfortable: "Cómodo", compact: "Compacto",
    reducedMotion: "Reducir animaciones", planning: "Calendario y recordatorios", weekStartsOn: "La semana empieza el",
    monday: "Lunes", sunday: "Domingo", timeFormat: "Formato de hora", defaultReminder: "Recordatorio de correo predeterminado",
    hour: "1 hora antes", day: "1 día antes", week: "1 semana antes", month: "1 mes antes",
    files: "Archivos", autoSaveFiles: "Guardar automáticamente los archivos subidos en el almacenamiento privado de mi cuenta",
    saving: "Guardando…", saved: "Preferencias guardadas", error: "No se pudieron guardar las preferencias. Inténtalo de nuevo.",
  },
  pt: {
    title: "Preferências", intro: "Estas preferências acompanham a sua conta em todos os dispositivos.", language: "Idiomas",
    interfaceLanguage: "Idioma da interface", analysisLanguage: "Idioma predefinido da explicação", appearance: "Aspeto",
    theme: "Tema", system: "Usar definição do dispositivo", light: "Claro", dark: "Escuro", fontScale: "Tamanho do texto",
    normal: "Normal", large: "Grande", density: "Espaçamento", comfortable: "Confortável", compact: "Compacto",
    reducedMotion: "Reduzir animações", planning: "Calendário e lembretes", weekStartsOn: "A semana começa em",
    monday: "Segunda-feira", sunday: "Domingo", timeFormat: "Formato de hora", defaultReminder: "Lembrete de email predefinido",
    hour: "1 hora antes", day: "1 dia antes", week: "1 semana antes", month: "1 mês antes",
    files: "Ficheiros", autoSaveFiles: "Guardar automaticamente ficheiros enviados no armazenamento privado da minha conta",
    saving: "A guardar…", saved: "Preferências guardadas", error: "Não foi possível guardar as preferências. Tente novamente.",
  },
  fr: {
    title: "Préférences", intro: "Ces préférences suivent votre compte sur tous vos appareils.", language: "Langues",
    interfaceLanguage: "Langue de l’interface", analysisLanguage: "Langue d’explication par défaut", appearance: "Apparence",
    theme: "Thème", system: "Utiliser le réglage de l’appareil", light: "Clair", dark: "Sombre", fontScale: "Taille du texte",
    normal: "Normale", large: "Grande", density: "Espacement", comfortable: "Confortable", compact: "Compact",
    reducedMotion: "Réduire les animations", planning: "Calendrier et rappels", weekStartsOn: "La semaine commence le",
    monday: "Lundi", sunday: "Dimanche", timeFormat: "Format de l’heure", defaultReminder: "Rappel e-mail par défaut",
    hour: "1 heure avant", day: "1 jour avant", week: "1 semaine avant", month: "1 mois avant",
    files: "Fichiers", autoSaveFiles: "Enregistrer automatiquement les fichiers ajoutés dans le stockage privé de mon compte",
    saving: "Enregistrement…", saved: "Préférences enregistrées", error: "Impossible d’enregistrer les préférences. Réessayez.",
  },
  de: {
    title: "Einstellungen", intro: "Diese Einstellungen gelten für dein Konto auf allen Geräten.", language: "Sprachen",
    interfaceLanguage: "Sprache der Oberfläche", analysisLanguage: "Standard-Sprache der Erklärung", appearance: "Darstellung",
    theme: "Design", system: "Geräteeinstellung verwenden", light: "Hell", dark: "Dunkel", fontScale: "Textgröße",
    normal: "Normal", large: "Groß", density: "Abstände", comfortable: "Komfortabel", compact: "Kompakt",
    reducedMotion: "Animationen reduzieren", planning: "Kalender und Erinnerungen", weekStartsOn: "Wochenbeginn",
    monday: "Montag", sunday: "Sonntag", timeFormat: "Zeitformat", defaultReminder: "Standard-E-Mail-Erinnerung",
    hour: "1 Stunde vorher", day: "1 Tag vorher", week: "1 Woche vorher", month: "1 Monat vorher",
    files: "Dateien", autoSaveFiles: "Hochgeladene Dateien automatisch im privaten Kontospeicher sichern",
    saving: "Wird gespeichert…", saved: "Einstellungen gespeichert", error: "Einstellungen konnten nicht gespeichert werden. Bitte erneut versuchen.",
  },
} as const;

const modelCopy: Record<ProfileLanguage, { title: string; label: string; help: string; proOnly: string; upgradeTitle: string; upgradeText: string; upgradeAction: string }> = {
  en: { title: "AI model", label: "Default model", help: "Used automatically for analyses, document creation and editing, and follow-up questions.", proOnly: "Pro", upgradeTitle: "Unlock more AI models", upgradeText: "GPT-5.6 Terra and Sol are available with WhatNow? Pro.", upgradeAction: "View Pro plans" },
  ru: { title: "Модель ИИ", label: "Модель по умолчанию", help: "Автоматически используется для анализа, создания и редактирования документов, а также дополнительных вопросов.", proOnly: "Pro", upgradeTitle: "Откройте больше моделей ИИ", upgradeText: "GPT-5.6 Terra и Sol доступны с подпиской WhatNow? Pro.", upgradeAction: "Посмотреть Pro-тариф" },
  lv: { title: "MI modelis", label: "Noklusējuma modelis", help: "Automātiski tiek izmantots analīzēm, dokumentu izveidei un rediģēšanai, kā arī papildjautājumiem.", proOnly: "Pro", upgradeTitle: "Atbloķējiet vairāk MI modeļu", upgradeText: "GPT-5.6 Terra un Sol ir pieejami ar WhatNow? Pro.", upgradeAction: "Skatīt Pro plānus" },
  es: { title: "Modelo de IA", label: "Modelo predeterminado", help: "Se usa automáticamente para análisis, creación y edición de documentos y preguntas de seguimiento.", proOnly: "Pro", upgradeTitle: "Desbloquea más modelos de IA", upgradeText: "GPT-5.6 Terra y Sol están disponibles con WhatNow? Pro.", upgradeAction: "Ver planes Pro" },
  pt: { title: "Modelo de IA", label: "Modelo predefinido", help: "É utilizado automaticamente para análises, criação e edição de documentos e perguntas de seguimento.", proOnly: "Pro", upgradeTitle: "Desbloqueie mais modelos de IA", upgradeText: "GPT-5.6 Terra e Sol estão disponíveis com WhatNow? Pro.", upgradeAction: "Ver planos Pro" },
  fr: { title: "Modèle IA", label: "Modèle par défaut", help: "Utilisé automatiquement pour les analyses, la création et l’édition de documents et les questions de suivi.", proOnly: "Pro", upgradeTitle: "Débloquez plus de modèles IA", upgradeText: "GPT-5.6 Terra et Sol sont disponibles avec WhatNow? Pro.", upgradeAction: "Voir les offres Pro" },
  de: { title: "KI-Modell", label: "Standardmodell", help: "Wird automatisch für Analysen, die Erstellung und Bearbeitung von Dokumenten sowie Rückfragen verwendet.", proOnly: "Pro", upgradeTitle: "Weitere KI-Modelle freischalten", upgradeText: "GPT-5.6 Terra und Sol sind mit WhatNow? Pro verfügbar.", upgradeAction: "Pro-Angebote ansehen" },
};

const modelDescriptions: Record<ProfileLanguage, Record<ProfileDefaultModel, string>> = {
  en: {
    "gpt-5.6-luna": "Fastest and most affordable",
    "gpt-5.6-terra": "Balanced speed and capability",
    "gpt-5.6-sol": "Smartest for complex tasks",
  },
  ru: {
    "gpt-5.6-luna": "Самая быстрая и доступная",
    "gpt-5.6-terra": "Баланс скорости и качества",
    "gpt-5.6-sol": "Самая умная для сложных задач",
  },
  lv: {
    "gpt-5.6-luna": "Ātrākais un pieejamākais",
    "gpt-5.6-terra": "Līdzsvars starp ātrumu un kvalitāti",
    "gpt-5.6-sol": "Gudrākais sarežģītiem uzdevumiem",
  },
  es: {
    "gpt-5.6-luna": "La más rápida y económica",
    "gpt-5.6-terra": "Equilibrio entre velocidad y capacidad",
    "gpt-5.6-sol": "La más inteligente para tareas complejas",
  },
  pt: {
    "gpt-5.6-luna": "A mais rápida e económica",
    "gpt-5.6-terra": "Equilíbrio entre rapidez e capacidade",
    "gpt-5.6-sol": "A mais inteligente para tarefas complexas",
  },
  fr: {
    "gpt-5.6-luna": "La plus rapide et la plus économique",
    "gpt-5.6-terra": "Équilibre entre rapidité et capacité",
    "gpt-5.6-sol": "La plus intelligente pour les tâches complexes",
  },
  de: {
    "gpt-5.6-luna": "Am schnellsten und am günstigsten",
    "gpt-5.6-terra": "Ausgewogenes Verhältnis von Tempo und Leistung",
    "gpt-5.6-sol": "Am intelligentesten für komplexe Aufgaben",
  },
};

const languageLabels: Record<ProfileLanguage, string> = Object.fromEntries(
  interfaceLanguageOptions.map((option) => [option.code, option.nativeName]),
) as Record<ProfileLanguage, string>;

const models: Array<{ value: ProfileDefaultModel; label: string }> = [
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
];

export function ProfileSettings({ locale, preferences, modelSelectionAvailable, onChange, onOpenPlan, disabled = false }: ProfileSettingsProps) {
  const t = copy[locale];
  const modelT = modelCopy[locale];
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [showModelUpgrade, setShowModelUpgrade] = useState(false);
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

      <fieldset className="settings-card settings-card-languages" disabled={locked}>
        <legend>{t.language}</legend>
        <div className="profile-setting-row">
          <label htmlFor={`${id}-ui-language`}>{t.interfaceLanguage}</label>
          <select id={`${id}-ui-language`} value={preferences.uiLanguage}
            onChange={(event) => void apply("uiLanguage", event.target.value as ProfileLanguage)}>
            {Object.entries(languageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="profile-setting-row">
          <label htmlFor={`${id}-analysis-language`}>{t.analysisLanguage}</label>
          <select id={`${id}-analysis-language`} value={preferences.analysisLanguage}
            onChange={(event) => void apply("analysisLanguage", event.target.value as SupportedLanguage)}>
            {responseLanguageOptions.map((option) => <option key={option.code} value={option.code}>{option.nativeName} — {option.englishName}</option>)}
          </select>
        </div>
      </fieldset>

      <fieldset className="settings-card settings-card-appearance" disabled={locked}>
        <legend>{t.appearance}</legend>
        <div className="profile-setting-row">
          <label htmlFor={`${id}-theme`}>{t.theme}</label>
          <select id={`${id}-theme`} value={preferences.theme}
            onChange={(event) => void apply("theme", event.target.value as ProfileTheme)}>
            <option value="system">{t.system}</option><option value="light">{t.light}</option><option value="dark">{t.dark}</option>
          </select>
        </div>
        <div className="profile-setting-row">
          <label htmlFor={`${id}-font-scale`}>{t.fontScale}</label>
          <select id={`${id}-font-scale`} value={preferences.fontScale}
            onChange={(event) => void apply("fontScale", event.target.value as ProfileFontScale)}>
            <option value="normal">{t.normal}</option><option value="large">{t.large}</option>
          </select>
        </div>
        <div className="profile-setting-row">
          <label htmlFor={`${id}-density`}>{t.density}</label>
          <select id={`${id}-density`} value={preferences.density}
            onChange={(event) => void apply("density", event.target.value as ProfileDensity)}>
            <option value="comfortable">{t.comfortable}</option><option value="compact">{t.compact}</option>
          </select>
        </div>
        <label className="profile-settings-check"><input type="checkbox" checked={preferences.reducedMotion}
          onChange={(event) => void apply("reducedMotion", event.target.checked)} /><span className="settings-toggle" aria-hidden="true"><span /></span><span>{t.reducedMotion}</span></label>
      </fieldset>

      <fieldset className="settings-card settings-card-planning" disabled={locked}>
        <legend>{t.planning}</legend>
        <div className="profile-setting-row">
          <label htmlFor={`${id}-week-start`}>{t.weekStartsOn}</label>
          <select id={`${id}-week-start`} value={preferences.weekStartsOn}
            onChange={(event) => void apply("weekStartsOn", event.target.value as ProfileWeekStartsOn)}>
            <option value="monday">{t.monday}</option><option value="sunday">{t.sunday}</option>
          </select>
        </div>
        <div className="profile-setting-row">
          <label htmlFor={`${id}-time-format`}>{t.timeFormat}</label>
          <select id={`${id}-time-format`} value={preferences.timeFormat}
            onChange={(event) => void apply("timeFormat", event.target.value as ProfileTimeFormat)}>
            <option value="12">12</option><option value="24">24</option>
          </select>
        </div>
        <div className="profile-setting-row">
          <label htmlFor={`${id}-default-reminder`}>{t.defaultReminder}</label>
          <select id={`${id}-default-reminder`} value={preferences.defaultReminderMinutes}
            onChange={(event) => void apply("defaultReminderMinutes", Number(event.target.value) as UserProfilePreferences["defaultReminderMinutes"])}>
            {profileReminderMinutes.map((minutes) => <option value={minutes} key={minutes}>{reminderLabel(minutes)}</option>)}
          </select>
        </div>
      </fieldset>

      <fieldset className="settings-card settings-card-files" disabled={locked}>
        <legend>{t.files}</legend>
        <label className="profile-settings-check"><input type="checkbox" checked={preferences.autoSaveFiles}
          onChange={(event) => void apply("autoSaveFiles", event.target.checked)} /><span className="settings-toggle" aria-hidden="true"><span /></span><span>{t.autoSaveFiles}</span></label>
      </fieldset>

      <fieldset className="settings-card settings-card-model" disabled={locked}>
        <legend>{modelT.title}</legend>
        <div className="profile-model-picker" role="group" aria-label={modelT.label}>
          {models.map((model) => {
            const isProOnly = model.value !== "gpt-5.6-luna";
            const unavailable = isProOnly && !modelSelectionAvailable;
            return <button key={model.value} type="button"
              className={`profile-model-choice${preferences.defaultModel === model.value ? " selected" : ""}${unavailable ? " locked" : ""}`}
              aria-pressed={preferences.defaultModel === model.value}
              onClick={() => {
                if (unavailable) { setShowModelUpgrade(true); return; }
                setShowModelUpgrade(false);
                void apply("defaultModel", model.value);
              }}>
              <span className="profile-model-label">{model.label}</span>
              <small className="profile-model-description">{modelDescriptions[locale][model.value]}</small>
              {unavailable && <small className="profile-model-access">{modelT.proOnly}</small>}
            </button>;
          })}
        </div>
        <p className="profile-setting-help">{modelT.help}</p>
        {showModelUpgrade && !modelSelectionAvailable && <aside className="model-upgrade-prompt" role="status"><div><strong>{modelT.upgradeTitle}</strong><p>{modelT.upgradeText}</p></div><button type="button" onClick={onOpenPlan}>{modelT.upgradeAction} →</button></aside>}
      </fieldset>

      <div className="profile-settings-status" aria-live="polite">
        {saving && <p role="status">{t.saving}</p>}
        {!saving && saved && <p role="status">✓ {t.saved}</p>}
        {!saving && error && <p role="alert">{t.error}</p>}
      </div>
    </section>
  );
}
