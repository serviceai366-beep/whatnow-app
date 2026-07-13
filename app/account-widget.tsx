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

const copy = {
  ru: {
    signIn: "Войти", signOut: "Выйти", title: "Войти в WhatNow?",
    intro: "Один аккаунт для входа с разных устройств. История разборов появится на следующем этапе.",
    google: "Продолжить через Google", divider: "или по email", email: "Email",
    emailPlaceholder: "name@example.com", emailAction: "Получить ссылку для входа", sending: "Отправляем…",
    sent: "Проверьте почту — мы отправили безопасную ссылку для входа.",
    privacy: "Пароль не нужен. Документы не передаются Google или вашему почтовому сервису.",
    close: "Закрыть окно входа", unavailable: "Вход временно не настроен. Попробуйте позже.",
    error: "Не удалось начать вход. Попробуйте ещё раз.",
  },
  lv: {
    signIn: "Pierakstīties", signOut: "Iziet", title: "Pierakstīties WhatNow?",
    intro: "Viens konts darbam dažādās ierīcēs. Analīžu vēsture tiks pievienota nākamajā posmā.",
    google: "Turpināt ar Google", divider: "vai ar e-pastu", email: "E-pasts",
    emailPlaceholder: "vards@piemers.lv", emailAction: "Saņemt pierakstīšanās saiti", sending: "Nosūtām…",
    sent: "Pārbaudiet e-pastu — nosūtījām drošu pierakstīšanās saiti.",
    privacy: "Parole nav vajadzīga. Dokumenti netiek nodoti Google vai e-pasta pakalpojumam.",
    close: "Aizvērt pierakstīšanās logu", unavailable: "Pierakstīšanās pašlaik nav iestatīta. Mēģiniet vēlāk.",
    error: "Neizdevās sākt pierakstīšanos. Mēģiniet vēlreiz.",
  },
  en: {
    signIn: "Sign in", signOut: "Sign out", title: "Sign in to WhatNow?",
    intro: "Use one account across your devices. Analysis history will be added in the next stage.",
    google: "Continue with Google", divider: "or use email", email: "Email",
    emailPlaceholder: "name@example.com", emailAction: "Email me a sign-in link", sending: "Sending…",
    sent: "Check your inbox — we sent you a secure sign-in link.",
    privacy: "No password required. Your documents are not shared with Google or your email provider.",
    close: "Close sign-in window", unavailable: "Sign-in is not configured right now. Try again later.",
    error: "We could not start sign-in. Please try again.",
  },
} as const;

export function AccountWidget({ locale, accountAria }: { locale: SupportedLanguage; accountAria: string }) {
  const t = copy[locale];
  const [account, setAccount] = useState<SupabaseAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadAccount().then((value) => { if (active) setAccount(value); }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSending(true);
    try {
      await sendEmailSignInLink(email.trim());
      setMessage(t.sent);
    } catch {
      setError(t.error);
    } finally {
      setSending(false);
    }
  };

  if (!loaded) return <span className="account-loading" aria-hidden="true" />;

  if (account) {
    return (
      <div className="account-control" aria-label={accountAria}>
        {account.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="account-avatar account-avatar-image" src={account.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="account-avatar" aria-hidden="true">{account.displayName.charAt(0).toUpperCase() || "W"}</span>
        )}
        <span className="account-details">
          <strong title={account.displayName}>{account.displayName}</strong>
          <small title={account.email}>{account.email}</small>
        </span>
        <button className="account-sign-out" type="button" onClick={async () => {
          await signOutAccount();
          setAccount(null);
        }}>{t.signOut}</button>
      </div>
    );
  }

  return (
    <>
      <button className="account-sign-in" type="button" onClick={() => setOpen(true)}>{t.signIn}</button>
      {open && (
        <div className="auth-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="auth-close" type="button" aria-label={t.close} onClick={() => setOpen(false)}>×</button>
            <span className="auth-mark" aria-hidden="true">W</span>
            <h2 id="auth-title">{t.title}</h2>
            <p className="auth-intro">{t.intro}</p>
            <button className="google-sign-in" type="button" onClick={() => {
              setError(null);
              if (!isSupabaseConfigured()) return setError(t.unavailable);
              try { startGoogleSignIn(); } catch { setError(t.error); }
            }}><span aria-hidden="true">G</span>{t.google}</button>
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
          </section>
        </div>
      )}
    </>
  );
}
