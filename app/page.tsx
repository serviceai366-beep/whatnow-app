"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  formatFileSize,
  MAX_TEXT_LENGTH,
  validateDocumentFile,
  type DocumentKind,
} from "./file-validation";
import type { AnalysisResult, Deadline, Finding, SupportedLanguage } from "./analysis-schema";
import { apiErrorKeyByCode, translations, type UiCopy } from "./i18n";
import { AccountWidget, type ColorTheme } from "./account-widget";
import { saveAnalysisToHistory, type AnalysisHistoryItem } from "./analysis-history";
import { HistoryPanel } from "./history-panel";
import { getAccessToken, type SupabaseAccount } from "./supabase-auth";
import { TurnstileWidget } from "./turnstile";

const languages = [
  { code: "ru", label: "Русский", short: "RU" },
  { code: "lv", label: "Latviešu", short: "LV" },
  { code: "en", label: "English", short: "EN" },
] as const;

const historyCopy = {
  ru: { save: "Повторить сохранение", saving: "Сохраняем в историю…", saved: "Автоматически сохранено в истории", signIn: "Войдите, чтобы последние 10 разборов сохранялись в аккаунте.", error: "Не удалось сохранить разбор. Нажмите, чтобы повторить." },
  lv: { save: "Mēģināt saglabāt vēlreiz", saving: "Saglabājam vēsturē…", saved: "Automātiski saglabāts vēsturē", signIn: "Pierakstieties, lai kontā saglabātu pēdējās 10 analīzes.", error: "Neizdevās saglabāt analīzi. Nospiediet, lai mēģinātu vēlreiz." },
  en: { save: "Retry saving", saving: "Saving to history…", saved: "Automatically saved to history", signIn: "Sign in to keep your latest 10 analyses in your account.", error: "We could not save this analysis. Select retry to try again." },
} as const;

type LimitNoticeData = {
  scope: "user_24h" | "user_7d";
  resetAt: number;
  observedAt: number;
  daily: { limit: number; remaining: number; resetAt: number };
  weekly: { limit: number; remaining: number; resetAt: number };
};

const limitCopy = {
  ru: { title: "Лимит анализов исчерпан", daily: "Использованы 3 анализа за 24 часа.", weekly: "Использованы 10 анализов за 7 дней.", available: "Новый анализ будет доступен", left: "Осталось", close: "Закрыть уведомление", now: "уже сейчас" },
  lv: { title: "Analīžu limits ir sasniegts", daily: "Izmantotas 3 analīzes 24 stundās.", weekly: "Izmantotas 10 analīzes 7 dienās.", available: "Nākamā analīze būs pieejama", left: "Atlikušais laiks", close: "Aizvērt paziņojumu", now: "jau tagad" },
  en: { title: "Analysis limit reached", daily: "You used 3 analyses in 24 hours.", weekly: "You used 10 analyses in 7 days.", available: "A new analysis will be available", left: "Time remaining", close: "Close notification", now: "now" },
} as const;

type SelectedDocument = {
  file: File;
  kind: DocumentKind;
  previewUrl: string;
};

function fingerprintText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

function scrollToResult() {
  window.setTimeout(() => {
    document.getElementById("analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

function getInitialTheme(): ColorTheme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem("whatnow.theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage can be unavailable in hardened browser modes; the system theme remains a safe fallback.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function Home() {
  const [language, setLanguage] = useState<SupportedLanguage>("ru");
  const [inputMode, setInputMode] = useState<"file" | "text">("file");
  const [showResult, setShowResult] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [account, setAccount] = useState<SupabaseAccount | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savingHistory, setSavingHistory] = useState(false);
  const [savedHistoryId, setSavedHistoryId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ColorTheme>(getInitialTheme);
  const [authOpen, setAuthOpen] = useState(false);
  const [limitNotice, setLimitNotice] = useState<LimitNoticeData | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastAnalysisRef = useRef<{ fingerprint: string; result: AnalysisResult } | null>(null);
  const accountIdRef = useRef<string | null | undefined>(undefined);
  const t = translations[language];
  const h = historyCopy[language];

  const handleAccountChange = useCallback((value: SupabaseAccount | null) => {
    const nextId = value?.id ?? null;
    if (accountIdRef.current !== undefined && accountIdRef.current !== nextId) {
      lastAnalysisRef.current = null;
      setAnalysis(null);
      setShowResult(false);
      setSelectedDocument(null);
      setDocumentText("");
      setFileError(null);
      setTextError(null);
      setAnalysisError(null);
      setSavedHistoryId(null);
      setSavingHistory(false);
      setHistoryError(null);
      setLimitNotice(null);
      setCaptchaToken(null);
      setCaptchaResetKey((current) => current + 1);
      setCaptchaError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    accountIdRef.current = nextId;
    setAccount(value);
    if (!value) setHistoryOpen(false);
  }, []);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { window.localStorage.setItem("whatnow.theme", theme); } catch { /* Theme persistence is optional. */ }
  }, [theme]);

  useEffect(() => {
    return () => {
      if (selectedDocument) URL.revokeObjectURL(selectedDocument.previewUrl);
    };
  }, [selectedDocument]);

  const selectDocument = (file: File) => {
    const validation = validateDocumentFile(file);
    setShowResult(false);
    setAnalysis(null);
    setSavedHistoryId(null);
    setHistoryError(null);
    setAnalysisError(null);

    if (validation.ok === false) {
      setSelectedDocument(null);
      setFileError(
        validation.code === "empty"
          ? t.fileEmpty
          : validation.code === "too_large"
            ? t.fileTooLarge
            : t.fileUnsupported,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedDocument({ file, kind: validation.kind, previewUrl: URL.createObjectURL(file) });
    setFileError(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) selectDocument(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) selectDocument(file);
  };

  const clearSelectedDocument = () => {
    setSelectedDocument(null);
    setFileError(null);
    setAnalysis(null);
    setAnalysisError(null);
    setShowResult(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const persistAnalysisHistory = async (
    result: AnalysisResult,
    sourceKind: "file" | "text",
    outputLanguage: SupportedLanguage,
    accessToken?: string,
  ) => {
    if (!account || savingHistory) return;
    const accountId = account.id;
    setSavingHistory(true);
    setHistoryError(null);
    try {
      const title = result.documentType.value || result.summary || "WhatNow?";
      const item = await saveAnalysisToHistory({ title, sourceKind, language: outputLanguage, result, accessToken });
      if (accountIdRef.current === accountId) setSavedHistoryId(item.id);
    } catch {
      if (accountIdRef.current === accountId) setHistoryError(historyCopy[outputLanguage].error);
    } finally {
      if (accountIdRef.current === accountId) setSavingHistory(false);
    }
  };

  const analyzeDocument = async () => {
    if (isAnalyzing) return;
    if (!account) {
      setAnalysisError(t.errorAuthenticationRequired);
      setAuthOpen(true);
      return;
    }
    if (inputMode === "file" && !selectedDocument) {
      setFileError(t.fileMissing);
      return;
    }

    if (inputMode === "text" && !documentText.trim()) {
      setTextError(t.textMissing);
      return;
    }
    if (!captchaToken) {
      setCaptchaError(t.errorCaptchaRequired);
      return;
    }

    setFileError(null);
    setTextError(null);
    setAnalysisError(null);
    setLimitNotice(null);

    const fingerprint = inputMode === "file"
      ? `${language}:file:${selectedDocument!.file.name}:${selectedDocument!.file.size}:${selectedDocument!.file.lastModified}`
      : `${language}:text:${fingerprintText(documentText.trim())}`;

    if (lastAnalysisRef.current?.fingerprint === fingerprint) {
      setAnalysis(lastAnalysisRef.current.result);
      setShowResult(true);
      scrollToResult();
      return;
    }

    const formData = new FormData();
    formData.set("language", language);
    formData.set("mode", inputMode);
    formData.set("turnstileToken", captchaToken);
    if (inputMode === "file") formData.set("file", selectedDocument!.file);
    else formData.set("text", documentText.trim());

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    setIsAnalyzing(true);
    setAnalysis(null);
    setShowResult(false);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setAnalysisError(t.errorAuthenticationInvalid);
        setAuthOpen(true);
        return;
      }
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (response.headers.has("X-RateLimit-Limit-24h")) {
        setQuotaRefreshKey((current) => current + 1);
      }
      const payload = await response.json().catch(() => null) as
        | { result?: AnalysisResult; error?: { code?: string; scope?: string; resetAt?: number; limits?: LimitNoticeData extends { daily: infer D; weekly: infer W } ? { daily: D; weekly: W } : never } }
        | null;

      if (!response.ok || !payload?.result) {
        const limit = payload?.error;
        if (
          limit?.code === "user_limit_reached"
          && (limit.scope === "user_24h" || limit.scope === "user_7d")
          && typeof limit.resetAt === "number"
          && limit.limits?.daily && limit.limits?.weekly
        ) {
          setLimitNotice({ scope: limit.scope, resetAt: limit.resetAt, observedAt: Date.now(), daily: limit.limits.daily, weekly: limit.limits.weekly });
          return;
        }
        if (limit?.code === "authentication_required" || limit?.code === "authentication_invalid") {
          setAuthOpen(true);
        }
        const errorKey = payload?.error?.code ? apiErrorKeyByCode[payload.error.code] : undefined;
        throw new Error(errorKey ? t[errorKey] : t.genericError);
      }

      lastAnalysisRef.current = { fingerprint, result: payload.result };
      setAnalysis(payload.result);
      setSavedHistoryId(null);
      setShowResult(true);
      scrollToResult();
      void persistAnalysisHistory(payload.result, inputMode, language, accessToken);
    } catch (error) {
      setAnalysisError(
        error instanceof Error && error.name === "AbortError"
          ? t.errorTimeout
          : error instanceof Error
            ? error.message
            : t.genericError,
      );
    } finally {
      window.clearTimeout(timeout);
      setIsAnalyzing(false);
      setCaptchaToken(null);
      setCaptchaResetKey((current) => current + 1);
    }
  };

  const resetAnalysis = () => {
    clearSelectedDocument();
    lastAnalysisRef.current = null;
    setDocumentText("");
    setTextError(null);
    setAnalysis(null);
    setAnalysisError(null);
    setShowResult(false);
    setSavedHistoryId(null);
    setHistoryError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openHistoryItem = (item: AnalysisHistoryItem) => {
    setLanguage(item.language);
    setInputMode(item.sourceKind);
    setAnalysis(item.result);
    setShowResult(true);
    setSavedHistoryId(item.id);
    setHistoryError(null);
    setHistoryOpen(false);
    scrollToResult();
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label={t.homeAria}>
          <span className="brand-mark" aria-hidden="true">W</span>
          <span>WhatNow?</span>
        </a>
        <div className="header-actions">
          <span className="prototype-badge">{t.badge}</span>
          <AccountWidget locale={language} accountAria={t.accountAria} onAccountChange={handleAccountChange}
            onOpenHistory={() => setHistoryOpen(true)} theme={theme} onThemeChange={setTheme} open={authOpen} onOpenChange={setAuthOpen}
            quotaRefreshKey={quotaRefreshKey} />
        </div>
      </header>

      {limitNotice && <LimitToast key={`${limitNotice.scope}:${limitNotice.observedAt}`} data={limitNotice} locale={language} onClose={() => setLimitNotice(null)} />}

      {showResult && analysis ? (
        <AnalysisResultView result={analysis} onRestart={resetAnalysis} t={t} locale={language}
          account={account} onSave={() => void persistAnalysisHistory(analysis, inputMode, language)} saving={savingHistory} saved={Boolean(savedHistoryId)} historyError={historyError} h={h} />
      ) : (
        <>
      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">{t.heroEyebrow}</p>
          <h1>{t.heroTitle}</h1>
          <p className="hero-lead">{t.heroLead}</p>
          <div className="trust-row">
            <span><span className="check" aria-hidden="true">✓</span> {t.featureFiles}</span>
            <span><span className="check" aria-hidden="true">✓</span> {t.featureLanguages}</span>
          </div>
        </div>

        <div className="analyzer-card" aria-labelledby="analyzer-title">
          <div className="card-heading">
            <div>
              <p className="step-label">{t.stepOne}</p>
              <h2 id="analyzer-title">{t.addDocument}</h2>
            </div>
            <span className="secure-label"><span aria-hidden="true">●</span> {t.confidential}</span>
          </div>

          <fieldset className="language-fieldset">
            <legend>{t.explanationLanguage}</legend>
            <div className="language-switcher">
              {languages.map((item) => (
                <button
                  className={language === item.code ? "active" : ""}
                  key={item.code}
                  onClick={() => {
                    setLanguage(item.code);
                    setAnalysis(null);
                    setAnalysisError(null);
                    setShowResult(false);
                  }}
                  type="button"
                  aria-pressed={language === item.code}
                  disabled={isAnalyzing}
                >
                  <span className="language-short">{item.short}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="source-tabs" role="tablist" aria-label={t.sourceMethod}>
            <button
              className={inputMode === "file" ? "active" : ""}
              onClick={() => {
                setInputMode("file");
                setTextError(null);
                setShowResult(false);
              }}
              type="button"
              role="tab"
              aria-selected={inputMode === "file"}
              disabled={isAnalyzing}
            >
              {t.uploadFile}
            </button>
            <button
              className={inputMode === "text" ? "active" : ""}
              onClick={() => {
                setInputMode("text");
                setFileError(null);
                setShowResult(false);
              }}
              type="button"
              role="tab"
              aria-selected={inputMode === "text"}
              disabled={isAnalyzing}
            >
              {t.pasteText}
            </button>
          </div>

          {inputMode === "file" ? (
            <div role="tabpanel">
              <input
                ref={fileInputRef}
                className="visually-hidden"
                data-testid="document-file-input"
                aria-label={t.chooseDocument}
                tabIndex={-1}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,application/rtf,text/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,.pdf,.jpg,.jpeg,.png,.webp,.txt,.rtf,.docx,.odt"
                onChange={handleFileChange}
                disabled={isAnalyzing}
              />
              {selectedDocument ? (
                <FilePreview document={selectedDocument} onRemove={clearSelectedDocument} t={t} locale={language} />
              ) : (
                <div
                  className={`dropzone${isDragging ? " is-dragging" : ""}${fileError ? " has-error" : ""}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
                  }}
                  onDrop={handleDrop}
                >
                  <div className="document-icon" aria-hidden="true"><span>DOC</span></div>
                  <strong>{isDragging ? t.releaseHere : t.dropHere}</strong>
                  <p>{t.orChoose}</p>
                  <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
                    {t.chooseFile}
                  </button>
                  <small>{t.allowedFiles}</small>
                </div>
              )}
              {fileError && <p className="input-error" role="alert">{fileError}</p>}
            </div>
          ) : (
            <div className="text-panel" role="tabpanel">
              <label htmlFor="document-text">{t.textLabel}</label>
              <textarea
                id="document-text"
                value={documentText}
                maxLength={MAX_TEXT_LENGTH}
                placeholder={t.textPlaceholder}
                aria-describedby={`text-help text-counter${textError ? " text-error" : ""}`}
                aria-invalid={Boolean(textError)}
                disabled={isAnalyzing}
                onChange={(event) => {
                  setDocumentText(event.target.value);
                  setTextError(null);
                  setAnalysis(null);
                  setAnalysisError(null);
                  setShowResult(false);
                }}
              />
              <div className="text-meta">
                <small id="text-help">{t.textPrivacy}</small>
                <small id="text-counter">{documentText.length.toLocaleString(localeTag(language))} / 50 000</small>
              </div>
              {textError && <p className="input-error" id="text-error" role="alert">{textError}</p>}
            </div>
          )}

          <div className="privacy-notice" aria-labelledby="privacy-title">
            <span className="privacy-notice-icon" aria-hidden="true">i</span>
            <div>
              <strong id="privacy-title">{t.privacyTitle}</strong>
              <p>{t.privacyAppStorage}</p>
              <p>{t.serverPrivacy}</p>
              <details>
                <summary>{t.privacyMore}</summary>
                <div>
                  <p>{t.privacyOpenAI}</p>
                  <p>{t.privacyTraining}</p>
                  <p>{t.privacyMinimize}</p>
                </div>
              </details>
            </div>
          </div>

          <div className="professional-notice">
            <span aria-hidden="true">!</span>
            <p><strong>{t.professionalTitle}</strong><br />{t.professionalText}</p>
          </div>

          <div className={`captcha-box${captchaError ? " has-error" : ""}`}>
            <div><strong>{t.captchaTitle}</strong><small>{captchaError || (captchaToken ? t.captchaReady : t.captchaWaiting)}</small></div>
            <TurnstileWidget action="analyze" language={language} theme={theme} resetKey={captchaResetKey}
              onToken={(token) => { setCaptchaToken(token); if (token) setCaptchaError(null); }}
              onError={() => setCaptchaError(t.errorCaptchaUnavailable)} />
          </div>

          <button className="primary-button" type="button" onClick={analyzeDocument} disabled={isAnalyzing || !captchaToken}>
            {isAnalyzing
              ? t.analyzing
              : inputMode === "file"
                ? t.analyzeFile
                : t.analyzeText} {!isAnalyzing && <span aria-hidden="true">→</span>}
          </button>
          {isAnalyzing && <AnalysisProgress t={t} />}
          {analysisError && <p className="input-error analysis-error" role="alert">{analysisError}</p>}

        </div>
      </section>

      <section className="benefits" aria-labelledby="benefits-title">
        <div className="section-heading">
          <p className="eyebrow">{t.benefitsEyebrow}</p>
          <h2 id="benefits-title">{t.benefitsTitle}</h2>
        </div>
        <div className="benefit-grid">
          <article><span className="benefit-number">01</span><h3>{t.benefitSummary}</h3><p>{t.benefitSummaryText}</p></article>
          <article><span className="benefit-number">02</span><h3>{t.benefitDeadline}</h3><p>{t.benefitDeadlineText}</p></article>
          <article><span className="benefit-number">03</span><h3>{t.benefitPlan}</h3><p>{t.benefitPlanText}</p></article>
          <article><span className="benefit-number">04</span><h3>{t.benefitReply}</h3><p>{t.benefitReplyText}</p></article>
        </div>
      </section>
        </>
      )}
      {historyOpen && account && <HistoryPanel locale={language} onClose={closeHistory} onOpen={openHistoryItem} />}

      <section className="privacy-strip">
        <div><span className="privacy-icon" aria-hidden="true">✓</span><p><strong>{t.documentsNotPublished}</strong><br />{t.documentsNotPublishedText}</p></div>
        <div><span className="privacy-icon warning" aria-hidden="true">!</span><p><strong>{t.aiCanErr}</strong><br />{t.aiCanErrText}</p></div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark" aria-hidden="true">W</span><span>WhatNow?</span></a>
        <p>{t.footerNotice}</p>
      </footer>
    </main>
  );
}

function localeTag(locale: SupportedLanguage): string {
  return locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-US";
}

function durationLabel(milliseconds: number, locale: SupportedLanguage): string {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(locale === "ru" ? `${days} д.` : locale === "lv" ? `${days} d.` : `${days}d`);
  if (hours) parts.push(locale === "ru" ? `${hours} ч.` : locale === "lv" ? `${hours} st.` : `${hours}h`);
  if (minutes || !parts.length) parts.push(locale === "ru" ? `${minutes} мин.` : locale === "lv" ? `${minutes} min.` : `${minutes}m`);
  return parts.join(" ");
}

function LimitToast({ data, locale, onClose }: { data: LimitNoticeData; locale: SupportedLanguage; onClose: () => void }) {
  const [now, setNow] = useState(data.observedAt);
  const t = limitCopy[locale];
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (now >= data.resetAt) onClose();
  }, [data.resetAt, now, onClose]);
  const availableAt = new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "medium", timeStyle: "short" }).format(data.resetAt);
  return (
    <aside className="limit-toast" role="alert" aria-live="assertive">
      <button type="button" className="limit-toast-close" onClick={onClose} aria-label={t.close}>×</button>
      <span className="limit-toast-icon" aria-hidden="true">⏳</span>
      <div>
        <strong>{t.title}</strong>
        <p>{data.scope === "user_24h" ? t.daily : t.weekly}</p>
        <p><b>{t.left}: {data.resetAt > now ? durationLabel(data.resetAt - now, locale) : t.now}</b></p>
        <small>{t.available}: {availableAt}</small>
      </div>
    </aside>
  );
}

function FilePreview({
  document,
  onRemove,
  t,
  locale,
}: {
  document: SelectedDocument;
  onRemove: () => void;
  t: UiCopy;
  locale: SupportedLanguage;
}) {
  return (
    <div className="file-preview" data-testid="file-preview">
      <div className="file-preview-header">
        <div className="file-summary">
          <span className="file-type" aria-hidden="true">{document.kind === "pdf" ? "PDF" : document.kind === "image" ? "IMG" : document.file.name.split(".").pop()?.toUpperCase()}</span>
          <div>
            <strong>{document.file.name}</strong>
            <p>{document.kind === "pdf" ? t.pdfDocument : document.kind === "image" ? t.imageDocument : document.kind === "text" ? t.textDocument : t.officeDocument} · {formatFileSize(document.file.size, locale)}</p>
          </div>
        </div>
        <button type="button" className="remove-file" onClick={onRemove} aria-label={`${t.removeFileAria}: ${document.file.name}`}>{t.removeFile}</button>
      </div>
      <div className={`preview-frame ${document.kind}`}>
        {document.kind === "image" ? (
          // Blob URLs exist only in the browser and cannot use the server-side Next image loader.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={document.previewUrl} alt={`${t.previewFile}: ${document.file.name}`} />
        ) : document.kind === "pdf" ? (
          <iframe src={document.previewUrl} title={`${t.previewPdf}: ${document.file.name}`} />
        ) : (
          <div className="document-preview-message"><span aria-hidden="true">Aa</span><strong>{t.textFileReady}</strong><p>{t.officePreviewNote}</p></div>
        )}
      </div>
      <p className="preview-note"><span aria-hidden="true">✓</span> {t.fileReady}</p>
    </div>
  );
}

function AnalysisProgress({ t }: { t: UiCopy }) {
  return (
    <div className="analysis-progress" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <div>
        <strong>{t.progressTitle}</strong>
        <p>{t.progressText}</p>
        <div className="loading-steps" aria-hidden="true"><span /><span /><span /></div>
      </div>
    </div>
  );
}

function findingValue(finding: Finding, fallback: string): string {
  return finding.status === "found" && finding.value ? finding.value : finding.value || fallback;
}

function findingStatus(finding: Finding, t: UiCopy): string {
  if (finding.status === "found") return finding.basis === "fact" ? t.confirmed : t.assumption;
  if (finding.status === "unclear") return t.unclear;
  return t.notFound;
}

function daysUntil(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const target = new Date(`${date}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function deadlineLabel(deadline: Deadline | undefined, t: UiCopy): string {
  if (!deadline) return t.notFound;
  return deadline.dateText || deadline.normalizedDate || t.cannotDetermine;
}

function stepCount(count: number, locale: SupportedLanguage): string {
  if (locale === "en") return `${count} ${count === 1 ? "step" : "steps"}`;
  if (locale === "lv") return `${count} ${count === 1 ? "solis" : "soļi"}`;
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun = mod10 === 1 && mod100 !== 11 ? "шаг" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "шага" : "шагов";
  return `${count} ${noun}`;
}

function deadlineStatus(
  remainingDays: number | null,
  deadline: Deadline | undefined,
  isUrgent: boolean,
  isOverdue: boolean,
  t: UiCopy,
): string {
  if (isOverdue) return `${t.deadlinePassed}: ${Math.abs(remainingDays!)} ${t.daysAgo}`;
  if (isUrgent) return remainingDays === 0 ? t.deadlineToday : t.daysLeft.replace("{count}", String(remainingDays));
  return deadline?.status === "found" ? t.deadlineConfirmed : t.checkManually;
}

function AnalysisResultView({
  result,
  onRestart,
  t,
  locale,
  account,
  onSave,
  saving,
  saved,
  historyError,
  h,
}: {
  result: AnalysisResult;
  onRestart: () => void;
  t: UiCopy;
  locale: SupportedLanguage;
  account: SupabaseAccount | null;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  historyError: string | null;
  h: (typeof historyCopy)[SupportedLanguage];
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const primaryDeadline = result.deadlines.find((item) => item.status === "found") || result.deadlines[0];
  const remainingDays = daysUntil(primaryDeadline?.normalizedDate);
  const isOverdue = remainingDays !== null && remainingDays < 0;
  const isUrgent = remainingDays !== null && remainingDays >= 0 && remainingDays <= 7;
  const primaryAction = result.actionPlan[0]?.action || result.requiredActions[0]?.value;
  const consequence = result.consequencesOfInaction[0];
  const confidenceLabels = { low: t.confidenceLow, medium: t.confidenceMedium, high: t.confidenceHigh } as const;
  const confidenceValues = { low: 34, medium: 67, high: 100 } as const;

  const copyReply = async () => {
    if (!result.suggestedReply) return;
    try {
      await navigator.clipboard.writeText(result.suggestedReply);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <section className="result-section" id="analysis-result" aria-labelledby="result-title">
      <div className="result-topbar">
        <button className="back-button" type="button" onClick={onRestart}><span aria-hidden="true">←</span> {t.newDocument}</button>
        <span className="analysis-complete"><span aria-hidden="true">✓</span> {t.analysisComplete}</span>
      </div>

      <header className="result-heading">
        <div>
          <p className="eyebrow">{t.stepTwo}</p>
          <h1 id="result-title">{t.resultTitle}</h1>
        </div>
        <div className={`confidence-pill confidence-${result.confidence}`}>
          <span aria-hidden="true">●</span> {t.confidence}: {confidenceLabels[result.confidence].toLocaleLowerCase(localeTag(locale))}
        </div>
      </header>

      <div className="result-highlight-grid">
        <article className="result-card summary-card">
          <div className="summary-meta">
            <p className="result-label">{t.simpleWords}</p>
            <span>{findingValue(result.documentType, t.notFound)}</span>
          </div>
          <h2>{result.summary}</h2>
          <p className="sender-line">{t.presumedSender}: <strong>{findingValue(result.sender, t.cannotDetermine)}</strong></p>
        </article>

        <article className={`result-card deadline-card${isUrgent ? " is-urgent" : ""}${isOverdue ? " is-overdue" : ""}`}>
          <div className="deadline-icon" aria-hidden="true">{isOverdue ? "!" : "⌁"}</div>
          <p className="result-label">{t.mainDeadline}</p>
          <strong>{deadlineLabel(primaryDeadline, t)}</strong>
          <p>{primaryDeadline?.meaning || t.notFound}</p>
          <span className="deadline-status">{deadlineStatus(remainingDays, primaryDeadline, isUrgent, isOverdue, t)}</span>
        </article>
      </div>

      <article className={`next-action-card${isUrgent || isOverdue ? " urgent" : ""}`}>
        <span className="next-action-icon" aria-hidden="true">{isUrgent || isOverdue ? "!" : "→"}</span>
        <div>
          <p className="result-label">{isOverdue ? t.checkNow : isUrgent ? t.urgentAction : t.doFirst}</p>
          <h2>{primaryAction || t.noExplicitActions}</h2>
          <p>{primaryDeadline?.dateText ? `${t.linkedDeadline}: ${primaryDeadline.dateText}` : t.ambiguousContact}</p>
        </div>
      </article>

      <div className="result-columns">
        <div className="result-main">
          <article className="result-card action-plan-card">
            <div className="section-title-row">
              <div><p className="result-label">{t.actionPlan}</p><h2>{t.whatNext}</h2></div>
              <span>{stepCount(result.actionPlan.length, locale)}</span>
            </div>
            <ol className="action-list">
              {result.actionPlan.length > 0 ? result.actionPlan.map((item) => (
                <li key={`${item.step}-${item.action}`}>
                  <span>{item.step}</span>
                  <div>
                    <strong>{item.action}</strong>
                    <p>{item.basis === "fact" ? t.fromDocument : t.verificationStep}</p>
                    {item.evidenceIds.length > 0 && <div className="evidence-links">{t.evidenceBasis}: {item.evidenceIds.map((id) => <span key={id}>{id.toUpperCase()}</span>)}</div>}
                  </div>
                </li>
              )) : <li><span>—</span><div><strong>{t.actionsUnclear}</strong><p>{t.actionsUnclearText}</p></div></li>}
            </ol>
          </article>

          <article className="result-card documents-card">
            <p className="result-label">{t.prepare}</p>
            <h2>{t.documentsAndData}</h2>
            {result.requiredDocuments.length > 0 ? (
              <ul className="check-list">{result.requiredDocuments.map((item, index) => <li key={`${item.value}-${index}`}><span aria-hidden="true">✓</span><div><strong>{findingValue(item, t.notFound)}</strong><small>{findingStatus(item, t)}</small></div></li>)}</ul>
            ) : <p className="empty-note">{t.noDocuments}</p>}
          </article>

          <article className="result-card evidence-card">
            <div className="section-title-row">
              <div><p className="result-label">{t.verifiableBasis}</p><h2>{t.importantFragments}</h2></div>
              <span>{result.evidence.length}</span>
            </div>
            {result.evidence.length > 0 ? (
              <div className="evidence-list">{result.evidence.map((item) => (
                <figure key={item.id} id={`evidence-${item.id}`}>
                  <blockquote>“{item.quote}”</blockquote>
                  <figcaption><strong>{item.id.toUpperCase()}</strong><span>{item.location || t.locationUnknown}</span></figcaption>
                </figure>
              ))}</div>
            ) : <p className="empty-note">{t.noEvidence}</p>}
          </article>
        </div>

        <aside className="result-sidebar">
          <article className="result-card compact-card document-facts-card">
            <p className="result-label">{t.aboutDocument}</p>
            <dl>
              <div><dt>{t.type}</dt><dd>{findingValue(result.documentType, t.notFound)}</dd></div>
              <div><dt>{t.sender}</dt><dd>{findingValue(result.sender, t.cannotDetermine)}</dd></div>
              <div><dt>{t.replyNeeded}</dt><dd>{result.replyNeeded === "yes" ? t.yes : result.replyNeeded === "no" ? t.no : t.unclear}</dd></div>
            </dl>
          </article>

          <article className="result-card compact-card caution-card">
            <span className="sidebar-icon warning" aria-hidden="true">!</span>
            <p className="result-label">{t.ifDoNothing}</p>
            <p>{consequence ? findingValue(consequence, t.notFound) : t.notFound}</p>
          </article>

          <article className="result-card compact-card uncertainty-card">
            <span className="sidebar-icon" aria-hidden="true">?</span>
            <p className="result-label">{t.uncertainties}</p>
            {result.uncertainties.length > 0 ? <ul>{result.uncertainties.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>{t.noUncertainties}</p>}
          </article>

          <article className="result-card compact-card confidence-card">
            <p className="result-label">{t.reliability}</p>
            <div className="confidence-value"><strong>{confidenceLabels[result.confidence]}</strong><span>{confidenceValues[result.confidence]}%</span></div>
            <div className="confidence-track" role="progressbar" aria-label={t.confidenceAria} aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidenceValues[result.confidence]}><span style={{ width: `${confidenceValues[result.confidence]}%` }} /></div>
            <p>{result.confidence === "high" ? t.reliabilityHigh : result.confidence === "medium" ? t.reliabilityMedium : t.reliabilityLow}</p>
          </article>
        </aside>
      </div>

      <article className={`reply-card${result.suggestedReply ? " has-reply" : ""}`}>
        <div className="reply-heading">
          <span className="reply-icon" aria-hidden="true">↗</span>
          <div><p className="result-label">{t.readyReply}</p><h2>{result.replyNeeded === "yes" ? t.sendAfterCheck : result.replyNeeded === "no" ? t.replyNotRequired : t.replyUnclear}</h2></div>
        </div>
        <div className="reply-content"><p>{result.suggestedReply || t.noReply}</p></div>
        {result.suggestedReply && (
          <div className="copy-row">
            <button type="button" onClick={copyReply}>{copyStatus === "copied" ? `✓ ${t.copied}` : t.copyReply}</button>
            <span aria-live="polite">{copyStatus === "error" ? t.copyError : copyStatus === "copied" ? t.copiedStatus : t.verifyBeforeSend}</span>
          </div>
        )}
      </article>

      <article className="safety-notice"><span aria-hidden="true">i</span><div><strong>{t.importantWarning}</strong><p>{result.safetyNotice}</p></div></article>

      <div className="result-actions">
        {account && (
          <button className="history-save-button" type="button" onClick={onSave} disabled={saving || saved}>
            {saved ? `✓ ${h.saved}` : saving ? h.saving : h.save}
          </button>
        )}
        <button className="primary-action-button" type="button" onClick={onRestart}>{t.analyzeAnother}</button>
        <p>{account ? (saved ? h.saved : t.historyNotice) : h.signIn}</p>
        {historyError && <p className="history-inline-error" role="alert">{historyError}</p>}
      </div>
    </section>
  );
}
