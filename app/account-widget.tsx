"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ProfileLanguage } from "./profile-types";
import { interfaceCopyFallback } from "./language-options";
import {
  isSupabaseConfigured,
  acceptCurrentLegalTerms,
  getAccessToken,
  loadAccount,
  signOutAccount,
  startGoogleSignIn,
  type SupabaseAccount,
  type AccountAccessMode,
} from "./supabase-auth";
import { TurnstileWidget } from "./turnstile";
import type { QuotaSnapshot, WindowQuota } from "./quota-types";
import { ReminderProfileSection } from "./reminder-profile-section";
import { SlidingSegmentedControl } from "./sliding-segmented-control";

export type ColorTheme = "light" | "dark";

const copy = {
  ru: {
    signIn: "Войти", signOut: "Выйти", title: "Войти в WhatNow?", profile: "Профиль",
    createAccount: "Создать аккаунт", createTitle: "Создайте аккаунт WhatNow?", signInTab: "Вход", createTab: "Регистрация",
    intro: "Один аккаунт для защищённых лимитов, истории и входа с разных устройств.", history: "Открыть историю разборов",
    google: "Продолжить через Google", googleLoading: "Открываем Google…",
    privacy: "Google надёжно подтверждает учётную запись. Документы этому сервису не передаются.",
    close: "Закрыть окно", unavailable: "Вход временно не настроен. Попробуйте позже.",
    error: "Не удалось начать вход. Попробуйте ещё раз.", secure: "Email подтверждён",
    securityText: "Сессия проверяется Supabase перед каждым анализом.", appearance: "Оформление",
    light: "Светлая", dark: "Тёмная", quota: "Ваши лимиты", dailyQuota: "За 24 часа", weeklyQuota: "За 7 дней", monthlyQuota: "За 30 дней",
    quotaLoading: "Считаем доступные анализы…", quotaUnavailable: "Не удалось обновить остаток. Ограничения продолжают действовать на сервере.",
    quotaRemaining: "Осталось {remaining} из {limit}", quotaReset: "Обновится {time}",
    quotaEstimated: "Точный остаток уточняется. Ниже показан лимит вашего тарифа.", quotaAllowance: "До {limit} анализов",
    accountActions: "Управление аккаунтом", proAccount: "WhatNow Pro",
    captchaWaiting: "Проверка защиты от ботов выполняется автоматически.",
    captchaReady: "Защита подтверждена.", captchaError: "Не удалось выполнить защитную проверку. Обновите её и попробуйте снова.",
    legalAgree: "Я принимаю Условия использования и подтверждаю, что прочитал(а) Политику конфиденциальности.",
    terms: "Условия использования", privacyPolicy: "Политика конфиденциальности", legalRequired: "Для создания аккаунта сначала подтвердите условия.", createRequirements: "Чтобы создать аккаунт, сначала согласитесь с политикой конфиденциальности и пройдите проверку от ботов.",
    finishLegalTitle: "Завершите создание аккаунта", finishLegalText: "Чтобы пользоваться WhatNow?, подтвердите действующие условия и политику конфиденциальности.",
    acceptAndContinue: "Принять и продолжить", accepting: "Сохраняем…",
  },
  lv: {
    signIn: "Pierakstīties", signOut: "Iziet", title: "Pierakstīties WhatNow?", profile: "Profils",
    createAccount: "Izveidot kontu", createTitle: "Izveidojiet WhatNow? kontu", signInTab: "Pierakstīties", createTab: "Reģistrēties",
    intro: "Viens konts drošiem limitiem, vēsturei un darbam dažādās ierīcēs.", history: "Atvērt analīžu vēsturi",
    google: "Turpināt ar Google", googleLoading: "Atveram Google…",
    privacy: "Google droši pārbauda kontu. Jūsu dokumenti šim pakalpojumam netiek nodoti.",
    close: "Aizvērt logu", unavailable: "Pierakstīšanās pašlaik nav iestatīta. Mēģiniet vēlāk.",
    error: "Neizdevās sākt pierakstīšanos. Mēģiniet vēlreiz.", secure: "E-pasts apstiprināts",
    securityText: "Supabase pārbauda sesiju pirms katras analīzes.", appearance: "Izskats",
    light: "Gaišs", dark: "Tumšs", quota: "Jūsu limiti", dailyQuota: "24 stundās", weeklyQuota: "7 dienās", monthlyQuota: "30 dienās",
    quotaLoading: "Aprēķinām pieejamās analīzes…", quotaUnavailable: "Neizdevās atjaunināt atlikumu. Limiti joprojām darbojas serverī.",
    quotaRemaining: "Atlikušas {remaining} no {limit}", quotaReset: "Atjaunosies {time}",
    quotaEstimated: "Precīzs atlikums tiek precizēts. Zemāk redzams jūsu plāna limits.", quotaAllowance: "Līdz {limit} analīzēm",
    accountActions: "Konta pārvaldība", proAccount: "WhatNow Pro",
    captchaWaiting: "Aizsardzības pārbaude pret robotiem notiek automātiski.",
    captchaReady: "Aizsardzība apstiprināta.", captchaError: "Neizdevās veikt aizsardzības pārbaudi. Atjaunojiet to un mēģiniet vēlreiz.",
    legalAgree: "Es piekrītu Lietošanas noteikumiem un apliecinu, ka esmu izlasījis Privātuma politiku.",
    terms: "Lietošanas noteikumi", privacyPolicy: "Privātuma politika", legalRequired: "Lai izveidotu kontu, vispirms apstipriniet noteikumus.", createRequirements: "Lai izveidotu kontu, vispirms piekrītiet privātuma politikai un pabeidziet aizsardzības pārbaudi.",
    finishLegalTitle: "Pabeidziet konta izveidi", finishLegalText: "Lai izmantotu WhatNow?, apstipriniet spēkā esošos noteikumus un privātuma politiku.",
    acceptAndContinue: "Piekrītu un turpinu", accepting: "Saglabājam…",
  },
  en: {
    signIn: "Sign in", signOut: "Sign out", title: "Sign in to WhatNow?", profile: "Profile",
    createAccount: "Create account", createTitle: "Create your WhatNow? account", signInTab: "Sign in", createTab: "Create account",
    intro: "One account for protected limits, history, and access across devices.", history: "Open analysis history",
    google: "Continue with Google", googleLoading: "Opening Google…",
    privacy: "Google securely verifies the account. Your documents are not shared with this service.",
    close: "Close window", unavailable: "Sign-in is not configured right now. Try again later.",
    error: "We could not start sign-in. Please try again.", secure: "Email verified",
    securityText: "Supabase verifies the session before every analysis.", appearance: "Appearance",
    light: "Light", dark: "Dark", quota: "Your limits", dailyQuota: "Per 24 hours", weeklyQuota: "Per 7 days", monthlyQuota: "Per 30 days",
    quotaLoading: "Checking available analyses…", quotaUnavailable: "The remaining allowance could not be refreshed. Server limits are still enforced.",
    quotaRemaining: "{remaining} of {limit} remaining", quotaReset: "Refreshes {time}",
    quotaEstimated: "The exact remaining balance is being confirmed. Your plan allowance is shown below.", quotaAllowance: "Up to {limit} analyses",
    accountActions: "Account management", proAccount: "WhatNow Pro",
    captchaWaiting: "The bot-protection check runs automatically.",
    captchaReady: "Protection verified.", captchaError: "The protection check could not be completed. Refresh it and try again.",
    legalAgree: "I agree to the Terms of Service and acknowledge that I have read the Privacy Policy.",
    terms: "Terms of Service", privacyPolicy: "Privacy Policy", legalRequired: "Accept the terms before creating an account.", createRequirements: "To create an account, first agree to the Privacy Policy and complete the bot-protection check.",
    finishLegalTitle: "Finish creating your account", finishLegalText: "To use WhatNow?, accept the current Terms of Service and acknowledge the Privacy Policy.",
    acceptAndContinue: "Accept and continue", accepting: "Saving…",
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

function quotaAllowanceText(template: string, quota: WindowQuota): string {
  return template.replace("{limit}", String(quota.limit));
}

function quotaResetText(template: string, quota: WindowQuota, locale: ProfileLanguage): string | null {
  if (quota.remaining > 0) return null;
  const languageTag = locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-US";
  const time = new Intl.DateTimeFormat(languageTag, { dateStyle: "short", timeStyle: "short" }).format(quota.resetAt);
  return template.replace("{time}", time);
}

export function AccountWidget({ locale, accountAria, onAccountChange, onPlanChange, onOpenHistory, theme, onThemeChange, open, onOpenChange, quotaRefreshKey }: {
  locale: ProfileLanguage;
  accountAria: string;
  onAccountChange?: (account: SupabaseAccount | null) => void;
  onPlanChange?: (plan: "free" | "pro") => void;
  onOpenHistory?: () => void;
  theme: ColorTheme;
  onThemeChange: (theme: ColorTheme) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotaRefreshKey: number;
}) {
  const t = copy[interfaceCopyFallback(locale)];
  const [account, setAccount] = useState<SupabaseAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authCaptchaToken, setAuthCaptchaToken] = useState<string | null>(null);
  const [authCaptchaResetKey, setAuthCaptchaResetKey] = useState(0);
  const [authCaptchaError, setAuthCaptchaError] = useState(false);
  const [authMode, setAuthMode] = useState<AccountAccessMode>("sign-in");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [acceptingLegal, setAcceptingLegal] = useState(false);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const isPro = quota?.planCode === "pro";

  useEffect(() => {
    let active = true;
    loadAccount().then((value) => {
      if (active) { setAccount(value); onAccountChange?.(value); }
    }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [onAccountChange]);

  useEffect(() => {
    if (account?.requiresLegalAcceptance) onOpenChange(true);
  }, [account?.requiresLegalAcceptance, onOpenChange]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let requestTimeout: number | undefined;
    if (!account) {
      queueMicrotask(() => {
        if (!active) return;
        setQuota(null);
        onPlanChange?.("free");
        setQuotaLoading(false);
        setQuotaError(false);
      });
      return () => { active = false; };
    }
    queueMicrotask(() => {
      if (!active) return;
      setQuotaLoading(true);
      setQuotaError(false);
      (async () => {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("Missing access token");
        requestTimeout = window.setTimeout(() => controller.abort(), 18_000);
        const response = await fetch("/api/quota", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as { quota?: QuotaSnapshot } | null;
        if (!response.ok || !payload?.quota) throw new Error("Quota unavailable");
        if (active) { setQuota(payload.quota); onPlanChange?.(payload.quota.planCode === "pro" ? "pro" : "free"); }
      })().catch(() => { if (active) setQuotaError(true); })
        .finally(() => {
          if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
          if (active) setQuotaLoading(false);
        });
    });
    return () => { active = false; controller.abort(); if (requestTimeout !== undefined) window.clearTimeout(requestTimeout); };
  }, [account, onPlanChange, quotaRefreshKey]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  if (!loaded) return <span className="account-loading" aria-hidden="true" />;

  return (
    <>
      {account ? (
        <button className={`account-control${isPro ? " account-control-pro" : ""}`} type="button" aria-label={`${accountAria}: ${account.displayName}${isPro ? `, ${t.proAccount}` : ""}`} onClick={() => onOpenChange(true)}>
          <Avatar account={account} />
          <span className="account-details"><strong>{account.displayName}</strong><small>{isPro ? <span className="account-plan-badge">✦ {t.proAccount}</span> : t.profile}</small></span>
          <span className="account-chevron" aria-hidden="true">⌄</span>
        </button>
      ) : (
        <button className="account-sign-in" type="button" onClick={() => onOpenChange(true)}>{t.signIn}</button>
      )}

      {open && typeof document !== "undefined" ? createPortal(
        <div className="auth-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) onOpenChange(false);
        }}>
          <section className={`auth-dialog${account ? " profile-dialog" : ""}`} role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
            <button className="auth-close" type="button" aria-label={t.close} onClick={() => onOpenChange(false)}>×</button>
            {account?.requiresLegalAcceptance ? (
              <>
                <img className="auth-mark" src="/whatnow-logo.jpg" alt="" />
                <h2 id="account-dialog-title">{t.finishLegalTitle}</h2>
                <p className="auth-intro">{t.finishLegalText}</p>
                <label className="legal-consent">
                  <input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} />
                  <span>{t.legalAgree}</span>
                </label>
                <p className="legal-links"><a href="/terms" target="_blank">{t.terms}</a><span>·</span><a href="/privacy" target="_blank">{t.privacyPolicy}</a></p>
                <button className="legal-accept-button" type="button" disabled={!legalAccepted || acceptingLegal} onClick={async () => {
                  setAcceptingLegal(true); setError(null);
                  try {
                    const updated = await acceptCurrentLegalTerms();
                    setAccount(updated); onAccountChange?.(updated); setLegalAccepted(false); onOpenChange(false);
                  } catch { setError(t.error); }
                  finally { setAcceptingLegal(false); }
                }}>{acceptingLegal ? t.accepting : t.acceptAndContinue}</button>
                {error && <p className="auth-error" role="alert">{error}</p>}
              </>
            ) : account ? (
              <>
                <Avatar account={account} large />
                <h2 id="account-dialog-title">{t.profile}</h2>
                <p className="profile-email">{account.email}</p>
                <div className="profile-security"><span aria-hidden="true">✓</span><div><strong>{t.secure}</strong><small>{t.securityText}</small></div></div>
                <section className="profile-section" aria-labelledby="appearance-title">
                  <h3 id="appearance-title">{t.appearance}</h3>
                  <SlidingSegmentedControl className="theme-switch" activeKey={theme} ariaLabel={t.appearance}>
                    <button type="button" data-segment-active={theme === "light"} className={theme === "light" ? "active" : ""} aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}>☀ {t.light}</button>
                    <button type="button" data-segment-active={theme === "dark"} className={theme === "dark" ? "active" : ""} aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}>☾ {t.dark}</button>
                  </SlidingSegmentedControl>
                </section>
                <section className="profile-section quota-summary" aria-labelledby="quota-title">
                  <h3 id="quota-title">{t.quota}</h3>
                  {quotaLoading && !quota ? <p role="status">{t.quotaLoading}</p> : quotaError && !quota ? <p className="quota-error">{t.quotaUnavailable}</p> : quota ? (
                    <div className="quota-grid">
                      {([[t.dailyQuota, quota.daily], [quota.secondaryWindowDays === 30 ? t.monthlyQuota : t.weeklyQuota, quota.weekly]] as const).map(([label, item]) => (
                        <div className={`quota-row${quota.backend === "unavailable" ? " quota-estimate" : ""}`} key={label}>
                          <span><strong>{label}</strong><small>{quota.backend === "unavailable" ? quotaAllowanceText(t.quotaAllowance, item) : quotaText(t.quotaRemaining, item)}</small></span>
                          {quota.backend === "unavailable" ? <b aria-label={quotaAllowanceText(t.quotaAllowance, item)}>{item.limit}</b> : <><b aria-label={quotaText(t.quotaRemaining, item)}>{item.remaining}/{item.limit}</b><progress max={item.limit} value={item.remaining}>{item.remaining}</progress>{quotaResetText(t.quotaReset, item, locale) && <small className="quota-reset">{quotaResetText(t.quotaReset, item, locale)}</small>}</>}
                        </div>
                      ))}
                    </div>
                  ) : <p>{t.quotaUnavailable}</p>}
                  {(quotaError && quota || quota?.backend === "unavailable") && <p className="quota-stale">{quota?.backend === "unavailable" ? t.quotaEstimated : t.quotaUnavailable}</p>}
                </section>
                <ReminderProfileSection locale={locale} />
                <div className="profile-actions" aria-label={t.accountActions}>
                  <button type="button" className="account-history" onClick={() => { onOpenChange(false); onOpenHistory?.(); }}>{t.history}</button>
                  <button type="button" className="account-sign-out" onClick={async () => {
                    await signOutAccount(); setAccount(null); onAccountChange?.(null); onPlanChange?.("free"); onOpenChange(false);
                  }}>{t.signOut}</button>
                </div>
              </>
            ) : (
              <>
                <img className="auth-mark" src="/whatnow-logo.jpg" alt="" />
                <SlidingSegmentedControl className="auth-mode-switch" activeKey={authMode} ariaLabel={t.title}>
                  <button type="button" role="tab" data-segment-active={authMode === "sign-in"} aria-selected={authMode === "sign-in"} className={authMode === "sign-in" ? "active" : ""} onClick={() => { setAuthMode("sign-in"); setLegalAccepted(false); setAuthCaptchaToken(null); setAuthCaptchaResetKey((value) => value + 1); setError(null); }}>{t.signInTab}</button>
                  <button type="button" role="tab" data-segment-active={authMode === "create-account"} aria-selected={authMode === "create-account"} className={authMode === "create-account" ? "active" : ""} onClick={() => { setAuthMode("create-account"); setAuthCaptchaToken(null); setAuthCaptchaResetKey((value) => value + 1); setError(null); }}>{t.createTab}</button>
                </SlidingSegmentedControl>
                <h2 id="account-dialog-title">{authMode === "create-account" ? t.createTitle : t.title}</h2>
                <p className="auth-intro">{t.intro}</p>
                {authMode === "create-account" && <>
                  <label className="legal-consent">
                    <input type="checkbox" checked={legalAccepted} onChange={(event) => { setLegalAccepted(event.target.checked); if (event.target.checked) setError(null); }} />
                    <span>{t.legalAgree}</span>
                  </label>
                  <p className="legal-links"><a href="/terms" target="_blank">{t.terms}</a><span>·</span><a href="/privacy" target="_blank">{t.privacyPolicy}</a></p>
                  <div className={`captcha-box compact${authCaptchaError ? " has-error" : ""}`}>
                    <TurnstileWidget action="account-create" language={locale} theme={theme} resetKey={authCaptchaResetKey} appearance="always"
                      onToken={(token) => { setAuthCaptchaToken(token); if (token) setAuthCaptchaError(false); }}
                      onError={() => setAuthCaptchaError(true)} />
                    <small>{authCaptchaError ? t.captchaError : authCaptchaToken ? t.captchaReady : t.captchaWaiting}</small>
                  </div>
                  {(!legalAccepted || !authCaptchaToken) && <p className="auth-requirements" role="status">{t.createRequirements}</p>}
                </>}
                {authMode === "sign-in" && <div className={`captcha-box compact${authCaptchaError ? " has-error" : ""}`}>
                  <TurnstileWidget action="account-login" language={locale} theme={theme} resetKey={authCaptchaResetKey} appearance="always"
                    onToken={(token) => { setAuthCaptchaToken(token); if (token) setAuthCaptchaError(false); }}
                    onError={() => setAuthCaptchaError(true)} />
                  <small>{authCaptchaError ? t.captchaError : authCaptchaToken ? t.captchaReady : t.captchaWaiting}</small>
                </div>}
                <button className="google-sign-in" type="button" disabled={googleLoading || !authCaptchaToken || (authMode === "create-account" && !legalAccepted)} onClick={async () => {
                  setError(null);
                  if (!authCaptchaToken || (authMode === "create-account" && !legalAccepted)) return setError(t.createRequirements);
                  if (!isSupabaseConfigured()) return setError(t.unavailable);
                  setGoogleLoading(true);
                  try { await startGoogleSignIn(authMode, legalAccepted, authCaptchaToken); } catch { setError(t.error); setGoogleLoading(false); }
                }}><span aria-hidden="true">G</span>{googleLoading ? t.googleLoading : t.google}</button>
                {error && <p className="auth-error" role="alert">{error}</p>}
                <p className="auth-privacy">{t.privacy}</p>
              </>
            )}
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
