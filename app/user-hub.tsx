"use client";

import { useEffect, useState } from "react";
import { FileLibrary } from "./file-library";
import { ProfileSettings } from "./profile-settings";
import { ReminderProfileSection } from "./reminder-profile-section";
import { SubscriptionPanel } from "./subscription-panel";
import type { ProfileLanguage, UserProfilePatch, UserProfilePreferences } from "./profile-types";
import { interfaceCopyFallback } from "./language-options";
import { SlidingSegmentedControl } from "./sliding-segmented-control";

const copy = {
  en: { title: "My space", intro: "Files, preferences, reminders and plan linked to your account.", files: "Files", settings: "Preferences", reminders: "Email reminders", plan: "Plan", close: "Close profile workspace" },
  ru: { title: "Моё пространство", intro: "Файлы, настройки, напоминания и тариф вашего аккаунта.", files: "Файлы", settings: "Настройки", reminders: "Email-напоминания", plan: "Тариф", close: "Закрыть пространство профиля" },
  lv: { title: "Mana telpa", intro: "Jūsu konta faili, iestatījumi, atgādinājumi un plāns.", files: "Faili", settings: "Iestatījumi", reminders: "E-pasta atgādinājumi", plan: "Plāns", close: "Aizvērt profila telpu" },
} as const;

type HubTab = "files" | "settings" | "reminders" | "plan";

export function UserHub({ open, locale, preferences, modelSelectionAvailable, onPreferencesChange, onUseFile, onClose, initialTab = "files" }: {
  open: boolean;
  locale: ProfileLanguage;
  preferences: UserProfilePreferences;
  modelSelectionAvailable: boolean;
  onPreferencesChange: (patch: UserProfilePatch) => Promise<void>;
  onUseFile: (file: File) => void;
  onClose: () => void;
  initialTab?: HubTab;
}) {
  const t = copy[interfaceCopyFallback(locale)];
  const [tab, setTab] = useState<HubTab>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [initialTab, open]);
  useEffect(() => { if (!open) return; const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [onClose, open]);
  if (!open) return null;
  return <div className="hub-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="user-hub" role="dialog" aria-modal="true" aria-labelledby="user-hub-title"><header className="hub-panel-header"><div><p className="eyebrow">WhatNow?</p><h2 id="user-hub-title">{t.title}</h2><p>{t.intro}</p></div><button className="icon-button" type="button" aria-label={t.close} onClick={onClose}>×</button></header><SlidingSegmentedControl className="hub-tabs" activeKey={tab}><button data-tab="files" data-segment-active={tab === "files"} type="button" role="tab" aria-selected={tab === "files"} className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>{t.files}</button><button data-tab="settings" data-segment-active={tab === "settings"} type="button" role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>{t.settings}</button><button data-tab="reminders" data-segment-active={tab === "reminders"} type="button" role="tab" aria-selected={tab === "reminders"} className={tab === "reminders" ? "active" : ""} onClick={() => setTab("reminders")}>{t.reminders}</button><button data-tab="plan" data-segment-active={tab === "plan"} type="button" role="tab" aria-selected={tab === "plan"} className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")}>{t.plan}</button></SlidingSegmentedControl><div className="hub-content">{tab === "files" && <FileLibrary locale={locale} onUseFile={(file) => { onUseFile(file); onClose(); }} />}{tab === "settings" && <ProfileSettings locale={locale} preferences={preferences} modelSelectionAvailable={modelSelectionAvailable} onChange={onPreferencesChange} onOpenPlan={() => setTab("plan")} />}{tab === "reminders" && <ReminderProfileSection locale={locale} />}{tab === "plan" && <SubscriptionPanel locale={locale} />}</div></section></div>;
}
