"use client";

import { useEffect, useState } from "react";
import { loadSubscription, startTestCheckout } from "./subscription-client";
import type { ProfileLanguage } from "./profile-types";
import type { SubscriptionPublicPayload } from "./subscription-types";

const copy = {
  en: { title: "Plan", intro: "Choose how much document analysis you need.", current: "Current plan", free: "Free", freeText: "For occasional important documents.", pro: "WhatNow? Pro", price: "$9.99", month: "per month", daily: "30 analyses every 24 hours", monthly: "300 analyses every 30 days", fair: "Fair-use safeguards for unusually large documents", coming: "Coming soon", testReady: "Open safe test checkout", unavailable: "Payments are not open yet. No card can be charged.", testNotice: "Test mode only — no real payment can be taken.", loading: "Loading plan…", error: "Plan information is temporarily unavailable.", redirecting: "Opening secure test checkout…" },
  ru: { title: "Тариф", intro: "Выберите подходящий объём анализа документов.", current: "Текущий тариф", free: "Бесплатный", freeText: "Для редких важных документов.", pro: "WhatNow? Pro", price: "$9.99", month: "в месяц", daily: "30 анализов за каждые 24 часа", monthly: "300 анализов за каждые 30 дней", fair: "Защита разумного использования для необычно больших документов", coming: "Скоро", testReady: "Открыть безопасную тестовую оплату", unavailable: "Оплата пока не открыта. Списание с карты невозможно.", testNotice: "Только тестовый режим — настоящие деньги списать невозможно.", loading: "Загружаем тариф…", error: "Информация о тарифе временно недоступна.", redirecting: "Открываем безопасную тестовую оплату…" },
  lv: { title: "Plāns", intro: "Izvēlieties vajadzīgo dokumentu analīzes apjomu.", current: "Pašreizējais plāns", free: "Bezmaksas", freeText: "Neregulāriem svarīgiem dokumentiem.", pro: "WhatNow? Pro", price: "$9.99", month: "mēnesī", daily: "30 analīzes katrās 24 stundās", monthly: "300 analīzes katrās 30 dienās", fair: "Godīgas lietošanas aizsardzība neparasti lieliem dokumentiem", coming: "Drīzumā", testReady: "Atvērt drošu testa apmaksu", unavailable: "Maksājumi vēl nav atvērti. No kartes neko nevar iekasēt.", testNotice: "Tikai testa režīms — īstu maksājumu veikt nevar.", loading: "Ielādējam plānu…", error: "Plāna informācija pašlaik nav pieejama.", redirecting: "Atveram drošu testa apmaksu…" },
} as const;

export function SubscriptionPanel({ locale }: { locale: ProfileLanguage }) {
  const t = copy[locale];
  const [payload, setPayload] = useState<SubscriptionPublicPayload | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    loadSubscription().then((value) => { if (active) setPayload(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const checkout = async () => {
    setBusy(true); setError(false);
    try { window.location.assign(await startTestCheckout()); }
    catch { setError(true); setBusy(false); }
  };
  if (!payload && !error) return <p className="panel-state">{t.loading}</p>;
  return <section className="subscription-panel" aria-labelledby="subscription-title">
    <header><h3 id="subscription-title">{t.title}</h3><p>{t.intro}</p></header>
    <div className="subscription-grid">
      <article className="subscription-card current"><span>{t.current}</span><h4>{t.free}</h4><p>{t.freeText}</p></article>
      <article className="subscription-card pro"><span>{payload?.subscription.checkoutAvailable ? "TEST" : t.coming}</span><h4>{t.pro}</h4><p className="subscription-price"><strong>{t.price}</strong> {t.month}</p><ul><li>{t.daily}</li><li>{t.monthly}</li><li>{t.fair}</li></ul><button type="button" disabled={!payload?.subscription.checkoutAvailable || busy} onClick={() => void checkout()}>{busy ? t.redirecting : payload?.subscription.checkoutAvailable ? t.testReady : t.coming}</button></article>
    </div>
    <p className={error ? "hub-error" : "subscription-safety"} role={error ? "alert" : "status"}>{error ? t.error : payload?.subscription.checkoutAvailable ? t.testNotice : t.unavailable}</p>
  </section>;
}
