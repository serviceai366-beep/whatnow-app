"use client";

import { useEffect, useState } from "react";
import { loadSubscription, openTestSubscriptionPortal, startTestCheckout } from "./subscription-client";
import type { ProfileLanguage } from "./profile-types";
import type { SubscriptionPublicPayload } from "./subscription-types";

const copy = {
  en: { title: "Plan", intro: "Choose how much document analysis you need.", current: "Current plan", active: "Active in test mode", manage: "Manage test subscription", free: "Free", freeText: "For occasional important documents.", pro: "WhatNow? Pro", price: "$9.99", month: "per month", daily: "30 analyses every 24 hours", monthly: "300 analyses every 30 days", fair: "Fair-use safeguards for unusually large documents", coming: "Coming soon", testReady: "Open safe test checkout", unavailable: "Payments are not open yet. No card can be charged.", testNotice: "Test mode only — no real payment can be taken.", loading: "Loading plan…", error: "Plan information is temporarily unavailable.", redirecting: "Opening secure Stripe page…" },
  ru: { title: "Тариф", intro: "Выберите подходящий объём анализа документов.", current: "Текущий тариф", active: "Активен в тестовом режиме", manage: "Управлять тестовой подпиской", free: "Бесплатный", freeText: "Для редких важных документов.", pro: "WhatNow? Pro", price: "$9.99", month: "в месяц", daily: "30 анализов за каждые 24 часа", monthly: "300 анализов за каждые 30 дней", fair: "Защита разумного использования для необычно больших документов", coming: "Скоро", testReady: "Открыть безопасную тестовую оплату", unavailable: "Оплата пока не открыта. Списание с карты невозможно.", testNotice: "Только тестовый режим — настоящие деньги списать невозможно.", loading: "Загружаем тариф…", error: "Информация о тарифе временно недоступна.", redirecting: "Открываем безопасную страницу Stripe…" },
  lv: { title: "Plāns", intro: "Izvēlieties vajadzīgo dokumentu analīzes apjomu.", current: "Pašreizējais plāns", active: "Aktīvs testa režīmā", manage: "Pārvaldīt testa abonementu", free: "Bezmaksas", freeText: "Neregulāriem svarīgiem dokumentiem.", pro: "WhatNow? Pro", price: "$9.99", month: "mēnesī", daily: "30 analīzes katrās 24 stundās", monthly: "300 analīzes katrās 30 dienās", fair: "Godīgas lietošanas aizsardzība neparasti lieliem dokumentiem", coming: "Drīzumā", testReady: "Atvērt drošu testa apmaksu", unavailable: "Maksājumi vēl nav atvērti. No kartes neko nevar iekasēt.", testNotice: "Tikai testa režīms — īstu maksājumu veikt nevar.", loading: "Ielādējam plānu…", error: "Plāna informācija pašlaik nav pieejama.", redirecting: "Atveram drošu Stripe lapu…" },
} as const;

export function SubscriptionPanel({ locale }: { locale: ProfileLanguage }) {
  const t = copy[locale];
  const [payload, setPayload] = useState<SubscriptionPublicPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    loadSubscription().then((value) => { if (active) setPayload(value); }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error && "code" in cause ? `${String(cause.code)}: ${cause.message}` : "subscription_error");
    });
    return () => { active = false; };
  }, []);
  const checkout = async () => {
    setBusy(true); setError(null);
    try { window.location.assign(await startTestCheckout()); }
    catch (cause: unknown) { setError(cause instanceof Error && "code" in cause ? `${String(cause.code)}: ${cause.message}` : "checkout_error"); setBusy(false); }
  };
  const manage = async () => {
    setBusy(true); setError(null);
    try { window.location.assign(await openTestSubscriptionPortal()); }
    catch (cause: unknown) { setError(cause instanceof Error && "code" in cause ? `${String(cause.code)}: ${cause.message}` : "portal_error"); setBusy(false); }
  };
  if (!payload && !error) return <p className="panel-state">{t.loading}</p>;
  const subscriptionsOpen = Boolean(payload?.subscription.checkoutAvailable || payload?.subscription.managementAvailable);
  const active = subscriptionsOpen && payload?.subscription.planCode === "pro" && payload.subscription.state === "active";
  return <section className="subscription-panel" aria-labelledby="subscription-title">
    <header><h3 id="subscription-title">{t.title}</h3><p>{t.intro}</p></header>
    <div className="subscription-grid">
      <article className={`subscription-card${active ? "" : " current"}`}><span>{active ? t.free : t.current}</span><h4>{t.free}</h4><p>{t.freeText}</p></article>
      <article className={`subscription-card pro${active ? " current" : ""}`}><span>{active ? t.current : payload?.subscription.checkoutAvailable ? "TEST" : t.coming}</span><h4>{t.pro}</h4><p className="subscription-price"><strong>{t.price}</strong> {t.month}</p><ul><li>{t.daily}</li><li>{t.monthly}</li><li>{t.fair}</li></ul>{active ? <><p className="subscription-active">✓ {t.active}</p><button type="button" disabled={!payload?.subscription.managementAvailable || busy} onClick={() => void manage()}>{busy ? t.redirecting : t.manage}</button></> : <button type="button" disabled={!payload?.subscription.checkoutAvailable || busy} onClick={() => void checkout()}>{busy ? t.redirecting : payload?.subscription.checkoutAvailable ? t.testReady : t.coming}</button>}</article>
    </div>
    <p className={error ? "hub-error" : "subscription-safety"} role={error ? "alert" : "status"}>{error ? <>{t.error}<span className="sr-only"> Error code: {error}</span></> : payload?.subscription.checkoutAvailable ? t.testNotice : t.unavailable}</p>
  </section>;
}
