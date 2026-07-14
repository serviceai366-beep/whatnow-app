"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { SupportedLanguage } from "./analysis-schema";
import {
  isSupabaseConfigured,
  getAccessToken,
  loadAccount,
  sendEmailSignInLink,
  signOutAccount,
  startGoogleSignIn,
  type SupabaseAccount,
} from "./supabase-auth";
import { TurnstileWidget } from "./turnstile";
import type { QuotaSnapshot, WindowQuota } from "./quota-types";

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
    light: "Светлая", dark: "Тёмная", quota: "Ваши лимиты", dailyQuota: "За 24 часа", weeklyQuota: "За 7 дней",
    quotaLoading: "Считаем доступные анализы…", quotaUnavailable: "Не удалось обновить остаток. Ограничения продолжают действовать на сервере.",
    quotaRemaining: "Осталось {remaining} из {limit}", quotaReset: "Обновится {time}",
    accountActions: "Управление аккаунтом",
    captchaWaiting: "Проверка защиты от ботов выполняется автоматически.",
    captchaReady: "Защита подтверждена.", captchaError: "Не удалось выполнить защитную проверку. Обновите её и попробуйте снова.",
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
    light: "Gaišs", dark: "Tumšs", quota: "Jūsu limiti", dailyQuota: "24 stundās", weeklyQuota: "7 dienās",
    quotaLoading: "Aprēķinām pieejamās analīzes…", quotaUnavailable: "Neizdevās atjaunināt atlikumu. Limiti joprojām darbojas serverī.",
    quotaRemaining: "Atlikušas {remaining} no {limit}", quotaReset: "Atjaunosies {time}",
    accountActions: "Konta pārvaldība",
    captchaWaiting: "Aizsardzības pārbaude pret robotiem notiek automātiski.",
    captchaReady: "Aizsardzība apstiprināta.", captchaError: "Neizdevās veikt aizsardzības pārbaudi. Atjaunojiet to un mēģiniet vēlreiz.",
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
    light: "Light", dark: "Dark", quota: "Your limits", dailyQuota: "Per 24 hours", weeklyQuota: "Per 7 days",
    quotaLoading: "Checking available analyses…", quotaUnavailable: "The remaining allowance could not be refreshed. Server limits are still enforced.",
    quotaRemaining: "{remaining} of {limit} remaining", quotaReset: "Refreshes {time}",
    accountActions: "Account management",
    captchaWaiting: "The bot-protection check runs automatically.",
    captchaReady: "Protection verified.", captchaError: "The protection check could not be completed. Refresh it and try again.",
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

function quotaText(template: string, quota: WindowQuota): string {
  return template.replace("{remaining}", String(quota.remaining)).replace("{limit}", String(quota.limit));
}

function quotaResetText(template: string, quota: WindowQuota, locale: SupportedLanguage): string | null {
  if (quota.remaining > 0) return null;
  const languageTag = locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-US";
  const time = new Intl.DateTimeFormat(languageTag, { dateStyle: "short", timeStyle: "short" }).format(quota.resetAt);
  return template.replace("{time}", time);
}

export function AccountWidget({ locale, accountAria, onAccountChange, onOpenHistory, theme, onThemeChange, open, onOpenChange, quotaRefreshKey }: {
  locale: SupportedLanguage;
  accountAria: string;
  onAccountChange?: (account: SupabaseAccount | null) => void;
  onOpenHistory?: () => void;
  theme: ColorTheme;
  onThemeChange: (theme: ColorTheme) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotaRefreshKey: number;
}) {
  const t = copy[locale];
  const [account, setAccount] = useState<SupabaseAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailCaptchaToken, setEmailCaptchaToken] = useState<string | null>(null);
  const [emailCaptchaResetKey, setEmailCaptchaResetKey] = useState(0);
  const [emailCaptchaError, setEmailCaptchaError] = useState(false);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState(false);

  useEffect(() => {
    let active = true;
    loadAccount().then((value) => {
      if (active) { setAccount(value); onAccountChange?.(value); }
    }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [onAccountChange]);

  useEffect(() => {
    if (!account) {
      setQuota(null);
      setQuotaLoading(false);
      setQuotaError(false);
      return;
    }
    let active = true;
    setQuotaLoading(true);
    setQuotaError(false);
    (async () => {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Missing access token");
      const response = await fetch("/api/quota", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await response.json().catch(() => null) as { quota?: QuotaSnapshot } | null;
      if (!response.ok || !payload?.quota) throw new Error("Quota unavailable");
      if (active) setQuota(payload.quota);
    })().catch(() => { if (active) setQuotaError(true); })
      .finally(() => { if (active) setQuotaLoading(false); });
    return () => { active = false; };
  }, [account, quotaRefreshKey]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!emailCaptchaToken) {
      setEmailCaptchaError(true);
      return;
    }
    setError(null); setMessage(null); setSending(true);
    try { await sendEmailSignInLink(email.trim(), emailCaptchaToken); setMessage(t.sent); }
    catch { setError(t.error); }
    finally {
      setSending(false);
      setEmailCaptchaToken(null);
      setEmailCaptchaResetKey((value) => value + 1);
    }
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
                <section className="profile-section quota-summary" aria-labelledby="quota-title">
                  <h3 id="quota-title">{t.quota}</h3>
                  {quotaLoading && !quota ? <p role="status">{t.quotaLoading}</p> : quotaError && !quota ? <p className="quota-error">{t.quotaUnavailable}</p> : quota ? (
                    <div className="quota-grid">
                      {([[t.dailyQuota, quota.daily], [t.weeklyQuota, quota.weekly]] as const).map(([label, item]) => (
                        <div className="quota-row" key={label}>
                          <span><strong>{label}</strong><small>{quotaText(t.quotaRemaining, item)}</small></span>
                          <b aria-label={quotaText(t.quotaRemaining, item)}>{item.remaining}/{item.limit}</b>
                          <progress max={item.limit} value={item.remaining}>{item.remaining}</progress>
                          {quotaResetText(t.quotaReset, item, locale) && <small className="quota-reset">{quotaResetText(t.quotaReset, item, locale)}</small>}
                        </div>
                      ))}
                    </div>
                  ) : <p>{t.quotaUnavailable}</p>}
                  {quotaError && quota && <p className="quota-stale">{t.quotaUnavailable}</p>}
                </section>
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
                  <div className={`captcha-box compact${emailCaptchaError ? " has-error" : ""}`}>
                    <TurnstileWidget action="email-login" language={locale} theme={theme} resetKey={emailCaptchaResetKey}
                      onToken={(token) => { setEmailCaptchaToken(token); if (token) setEmailCaptchaError(false); }}
                      onError={() => setEmailCaptchaError(true)} />
                    <small>{emailCaptchaError ? t.captchaError : emailCaptchaToken ? t.captchaReady : t.captchaWaiting}</small>
                  </div>
                  <button type="submit" disabled={sending || !email.trim() || !emailCaptchaToken}>{sending ? t.sending : t.emailAction}</button>
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
