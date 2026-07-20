"use client";

import { useEffect, useState } from "react";
import { FileLibrary } from "./file-library";
import { ProfileSettings } from "./profile-settings";
import { ReminderProfileSection } from "./reminder-profile-section";
import { SubscriptionPanel } from "./subscription-panel";
import type { ProfileLanguage, UserProfilePatch, UserProfilePreferences } from "./profile-types";
import { interfaceCopyFallback } from "./language-options";

const copy = {
  en: { title: "My space", intro: "Files, preferences, reminders and plan linked to your account.", files: "Files", settings: "Preferences", reminders: "Email reminders", plan: "Plan", close: "Close profile workspace" },
  ru: { title: "Моё пространство", intro: "Файлы, настройки, напоминания и тариф вашего аккаунта.", files: "Файлы", settings: "Настройки", reminders: "Email-напоминания", plan: "Тариф", close: "Закрыть пространство профиля" },
  lv: { title: "Mana telpa", intro: "Jūsu konta faili, iestatījumi, atgādinājumi un plāns.", files: "Faili", settings: "Iestatījumi", reminders: "E-pasta atgādinājumi", plan: "Plāns", close: "Aizvērt profila telpu" },
} as const;

export function UserHub({ open, locale, preferences, onPreferencesChange, onUseFile, onClose }: {
  open: boolean;
  locale: ProfileLanguage;
  preferences: UserProfilePreferences;
  onPreferencesChange: (patch: UserProfilePatch) => Promise<void>;
  onUseFile: (file: File) => void;
  onClose: () => void;
}) {
  const t = copy[interfaceCopyFallback(locale)];
  const [tab, setTab] = useState<"files" | "settings" | "reminders" | "plan">("files");
  useEffect(() => { if (!open) return; const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [onClose, open]);
  if (!open) return null;
  return <div className="hub-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="user-hub" role="dialog" aria-modal="true" aria-labelledby="user-hub-title"><header className="hub-panel-header"><div><p className="eyebrow">WhatNow?</p><h2 id="user-hub-title">{t.title}</h2><p>{t.intro}</p></div><button className="icon-button" type="button" aria-label={t.close} onClick={onClose}>×</button></header><div className="hub-tabs" role="tablist"><button data-tab="files" type="button" role="tab" aria-selected={tab === "files"} className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>{t.files}</button><button data-tab="settings" type="button" role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>{t.settings}</button><button data-tab="reminders" type="button" role="tab" aria-selected={tab === "reminders"} className={tab === "reminders" ? "active" : ""} onClick={() => setTab("reminders")}>{t.reminders}</button><button data-tab="plan" type="button" role="tab" aria-selected={tab === "plan"} className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")}>{t.plan}</button></div><div className="hub-content">{tab === "files" && <FileLibrary locale={locale} onUseFile={(file) => { onUseFile(file); onClose(); }} />}{tab === "settings" && <ProfileSettings locale={locale} preferences={preferences} onChange={onPreferencesChange} />}{tab === "reminders" && <ReminderProfileSection locale={locale} />}{tab === "plan" && <SubscriptionPanel locale={locale} />}</div></section></div>;
}
