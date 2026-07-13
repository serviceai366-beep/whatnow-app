"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { SupportedLanguage } from "./analysis-schema";
import {
  isSupabaseConfigured,
  loadAccount,
  sendEmailSignInLink,
  signOutAccount,
  startGoogleSignIn,
  type SupabaseAccount,
} from "./supabase-auth";

export type ColorTheme = "light" | "dark";

const copy = {
  ru: {
    signIn: "Войти", signOut: "Выйти", title: "Войти в WhatNow?", profile: "Профиль",
    intro: "Один аккаунт для защищённых лимитов, истории и входа с разных устройств.", history: "Открыть историю разборов",
    google: "Продолжить через Google", googleLoading: "Открываем Google…", divider: "или по email", email: "Email",
    emailPlaceholder: "name@example.com", emailAction: "Получить ссылку для входа", sending: "Отправляем…",
    sent: "Проверьте почту — ссылка одноразовая и подтвердит, что ящик принадлежит вам. Откройте её на этом устройстве.",
    privacy: "Знания адреса недостаточно: Google проверяет свой аккаунт, а вход по email возможен только по секретной ссылке из почты. Документы этим сервисам не передаются.",
    close: "Закрыть окно", unavailable: "Вход временно не настроен. Попробуйте позже.",
    error: "Не удалось начать вход. Попробуйте ещё раз.", secure: "Email подтверждён",
    securityText: "Сессия проверяется Supabase перед каждым анализом.", appearance: "Оформление",
    light: "Светлая", dark: "Тёмная", quota: "Ваши лимиты", quotaText: "3 анализа за 24 часа · 10 за 7 дней",
    accountActions: "Управление аккаунтом",
  },
  lv: {
    signIn: "Pierakstīties", signOut: "Iziet", title: "Pierakstīties WhatNow?", profile: "Profils",
    intro: "Viens konts drošiem limitiem, vēsturei un darbam dažādās ierīcēs.", history: "Atvērt analīžu vēsturi",
    google: "Turpināt ar Google", googleLoading: "Atveram Google…", divider: "vai ar e-pastu", email: "E-pasts",
    emailPlaceholder: "vards@piemers.lv", emailAction: "Saņemt pierakstīšanās saiti", sending: "Nosūtām…",
    sent: "Pārbaudiet e-pastu — vienreizējā saite apliecinās, ka pastkaste pieder jums. Atveriet to šajā ierīcē.",
    privacy: "Ar adreses zināšanu nepietiek: Google pārbauda kontu, bet e-pasta ieeja darbojas tikai ar slepeno saiti. Dokumenti šiem pakalpojumiem netiek nodoti.",
    close: "Aizvērt logu", unavailable: "Pierakstīšanās pašlaik nav iestatīta. Mēģiniet vēlāk.",
    error: "Neizdevās sākt pierakstīšanos. Mēģiniet vēlreiz.", secure: "E-pasts apstiprināts",
    securityText: "Supabase pārbauda sesiju pirms katras analīzes.", appearance: "Izskats",
    light: "Gaišs", dark: "Tumšs", quota: "Jūsu limiti", quotaText: "3 analīzes 24 stundās · 10 analīzes 7 dienās",
    accountActions: "Konta pārvaldība",
  },
  en: {
    signIn: "Sign in", signOut: "Sign out", title: "Sign in to WhatNow?", profile: "Profile",
    intro: "One account for protected limits, history, and access across devices.", history: "Open analysis history",
    google: "Continue with Google", googleLoading: "Opening Google…", divider: "or use email", email: "Email",
    emailPlaceholder: "name@example.com", emailAction: "Email me a sign-in link", sending: "Sending…",
    sent: "Check your inbox — the one-time link proves that you control the mailbox. Open it on this device.",
    privacy: "Knowing an address is not enough: Google verifies its account, and email sign-in requires the secret inbox link. Your documents are not shared with either provider.",
    close: "Close window", unavailable: "Sign-in is not configured right now. Try again later.",
    error: "We could not start sign-in. Please try again.", secure: "Email verified",
    securityText: "Supabase verifies the session before every analysis.", appearance: "Appearance",
    light: "Light", dark: "Dark", quota: "Your limits", quotaText: "3 analyses per 24 hours · 10 per 7 days",
    accountActions: "Account management",
  },
} as const;

function Avatar({ account, large = false }: { account: SupabaseAccount; large?: boolean }) {
  return account.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`account-avatar account-avatar-image${large ? " large" : ""}`} src={account.avatarUrl} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className={`account-avatar${large ? " large" : ""}`} aria-hidden="true">{account.displayName.charAt(0).toUpperCase() || "W"}</span>
  );
}

export function AccountWidget({ locale, accountAria, onAccountChange, onOpenHistory, theme, onThemeChange, open, onOpenChange }: {
  locale: SupportedLanguage;
  accountAria: string;
  onAccountChange?: (account: SupabaseAccount | null) => void;
  onOpenHistory?: () => void;
  theme: ColorTheme;
  onThemeChange: (theme: ColorTheme) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = copy[locale];
  const [account, setAccount] = useState<SupabaseAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadAccount().then((value) => {
      if (active) { setAccount(value); onAccountChange?.(value); }
    }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [onAccountChange]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null); setMessage(null); setSending(true);
    try { await sendEmailSignInLink(email.trim()); setMessage(t.sent); }
    catch { setError(t.error); }
    finally { setSending(false); }
  };

  if (!loaded) return <span className="account-loading" aria-hidden="true" />;

  return (
    <>
      {account ? (
        <button className="account-control" type="button" aria-label={`${accountAria}: ${account.displayName}`} onClick={() => onOpenChange(true)}>
          <Avatar account={account} />
          <span className="account-details"><strong>{account.displayName}</strong><small>{t.profile}</small></span>
          <span className="account-chevron" aria-hidden="true">⌄</span>
        </button>
      ) : (
        <button className="account-sign-in" type="button" onClick={() => onOpenChange(true)}>{t.signIn}</button>
      )}

      {open && (
        <div className="auth-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) onOpenChange(false);
        }}>
          <section className={`auth-dialog${account ? " profile-dialog" : ""}`} role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
            <button className="auth-close" type="button" aria-label={t.close} onClick={() => onOpenChange(false)}>×</button>
            {account ? (
              <>
                <Avatar account={account} large />
                <h2 id="account-dialog-title">{t.profile}</h2>
                <p className="profile-email">{account.email}</p>
                <div className="profile-security"><span aria-hidden="true">✓</span><div><strong>{t.secure}</strong><small>{t.securityText}</small></div></div>
                <section className="profile-section" aria-labelledby="appearance-title">
                  <h3 id="appearance-title">{t.appearance}</h3>
                  <div className="theme-switch" role="group" aria-label={t.appearance}>
                    <button type="button" className={theme === "light" ? "active" : ""} aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}>☀ {t.light}</button>
                    <button type="button" className={theme === "dark" ? "active" : ""} aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}>☾ {t.dark}</button>
                  </div>
                </section>
                <section className="profile-section quota-summary" aria-labelledby="quota-title"><h3 id="quota-title">{t.quota}</h3><p>{t.quotaText}</p></section>
                <div className="profile-actions" aria-label={t.accountActions}>
                  <button type="button" className="account-history" onClick={() => { onOpenChange(false); onOpenHistory?.(); }}>{t.history}</button>
                  <button type="button" className="account-sign-out" onClick={async () => {
                    await signOutAccount(); setAccount(null); onAccountChange?.(null); onOpenChange(false);
                  }}>{t.signOut}</button>
                </div>
              </>
            ) : (
              <>
                <span className="auth-mark" aria-hidden="true">W</span>
                <h2 id="account-dialog-title">{t.title}</h2>
                <p className="auth-intro">{t.intro}</p>
                <button className="google-sign-in" type="button" disabled={googleLoading} onClick={async () => {
                  setError(null);
                  if (!isSupabaseConfigured()) return setError(t.unavailable);
                  setGoogleLoading(true);
                  try { await startGoogleSignIn(); } catch { setError(t.error); setGoogleLoading(false); }
                }}><span aria-hidden="true">G</span>{googleLoading ? t.googleLoading : t.google}</button>
                <div className="auth-divider"><span>{t.divider}</span></div>
                <form className="email-sign-in" onSubmit={submitEmail}>
                  <label htmlFor="account-email">{t.email}</label>
                  <input id="account-email" type="email" value={email} required autoComplete="email"
                    placeholder={t.emailPlaceholder} onChange={(event) => setEmail(event.target.value)} />
                  <button type="submit" disabled={sending || !email.trim()}>{sending ? t.sending : t.emailAction}</button>
                </form>
                {message && <p className="auth-message" role="status">{message}</p>}
                {error && <p className="auth-error" role="alert">{error}</p>}
                <p className="auth-privacy">{t.privacy}</p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
