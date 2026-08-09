"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, DragEvent, MouseEvent as ReactMouseEvent } from "react";
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
import { EventSuggestions } from "./event-suggestions";
import { CalendarPanel } from "./calendar-panel";
import { UserHub } from "./user-hub";
import { SupportPanel } from "./support-panel";
import { loadUserProfileWithAccess, updateUserProfile } from "./profile-client";
import { DEFAULT_PROFILE_PREFERENCES, type UserProfilePatch, type UserProfilePreferences } from "./profile-types";
import type { ProfileLanguage } from "./profile-types";
import { FileClientError, uploadStoredFile } from "./file-client";
import { interfaceCopyFallback, languageOption, responseLanguageOptions } from "./language-options";
import { DocumentChat } from "./document-chat";
import { DocumentStudioPrototype } from "./document-studio-prototype";
import { TranslationWorkspace } from "./translation-workspace";
import { SlidingSegmentedControl } from "./sliding-segmented-control";
import { loadFavoriteMode, readLocalFavoriteMode, updateFavoriteMode, writeLocalFavoriteMode } from "./favorite-mode-client";
import type { FavoriteMode } from "./favorite-mode-store";

const workspaceCopy = {
  en: { info: "About", calendar: "Calendar", space: "My space", support: "Support", x: "X · @WhatNowAI", privateHint: "Private processing · Check important decisions", fileSaved: "The file was saved privately in My files.", fileDuplicate: "This file is already in My files.", fileLimit: "The analysis is ready, but the file vault is full. Delete a saved file to free space.", fileSaveError: "The analysis is ready, but the file could not be saved privately.", studioUnavailable: "Create & edit is temporarily unavailable. Please try again later." },
  ru: { info: "О сервисе", calendar: "Календарь", space: "Моё пространство", support: "Поддержка", x: "X · @WhatNowAI", privateHint: "Приватная обработка · Важные решения нужно проверять", fileSaved: "Файл приватно сохранён в разделе «Мои файлы».", fileDuplicate: "Этот файл уже есть в разделе «Мои файлы».", fileLimit: "Разбор готов, но хранилище файлов заполнено. Удалите сохранённый файл, чтобы освободить место.", fileSaveError: "Разбор готов, но приватно сохранить файл не удалось.", studioUnavailable: "Режим «Создать и изменить» временно недоступен. Попробуйте позже." },
  lv: { info: "Par servisu", calendar: "Kalendārs", space: "Mana telpa", support: "Atbalsts", x: "X · @WhatNowAI", privateHint: "Privāta apstrāde · Svarīgus lēmumus pārbaudiet", fileSaved: "Fails ir privāti saglabāts sadaļā “Mani faili”.", fileDuplicate: "Šis fails jau ir sadaļā “Mani faili”.", fileLimit: "Analīze ir gatava, bet failu krātuve ir pilna. Izdzēsiet saglabātu failu.", fileSaveError: "Fails nav izdevies privāti saglabāt.", studioUnavailable: "Režīms “Izveidot un rediģēt” īslaicīgi nav pieejams. Mēģiniet vēlāk." },
} as const;

const modePinCopy = {
  en: { pin: "Pin this mode", unpin: "Unpin mode", saved: "Pinned mode saved" },
  ru: { pin: "Закрепить этот режим", unpin: "Открепить режим", saved: "Режим закреплён" },
  lv: { pin: "Piespraust šo režīmu", unpin: "Atspraust režīmu", saved: "Režīms piesprausts" },
} as const;

const challengeCopy = {
  en: { eyebrow: "Security check", title: "One quick check", body: "We noticed several actions in a short time. Complete this one-time check and your analysis will continue automatically.", close: "Close security check" },
  ru: { eyebrow: "Проверка безопасности", title: "Одна быстрая проверка", body: "Мы заметили несколько быстрых действий подряд. Пройдите разовую проверку — анализ продолжится автоматически.", close: "Закрыть проверку безопасности" },
  lv: { eyebrow: "Drošības pārbaude", title: "Viena ātra pārbaude", body: "Īsā laikā pamanījām vairākas darbības. Pabeidziet vienreizēju pārbaudi, un analīze turpināsies automātiski.", close: "Aizvērt drošības pārbaudi" },
} as const;

const infoCopy = {
  en: { eyebrow: "About WhatNow?", title: "The details, when you need them", subtitle: "The main screen stays focused on one task: helping you understand a document. Service details live here.", close: "Close information", how: "How it works", first: "Add a photo, PDF, Word file, or paste text.", second: "Choose the language you want the explanation in.", third: "Receive a summary, deadlines, next steps, evidence, and a reply draft when needed.", privacy: "Privacy and storage", accuracy: "Accuracy and responsibility", output: "What you receive", legal: "Legal information" },
  ru: { eyebrow: "О WhatNow?", title: "Подробности — когда они нужны", subtitle: "Главный экран сосредоточен на одной задаче: помочь понять документ. Информация о работе сервиса находится здесь.", close: "Закрыть информацию", how: "Как это работает", first: "Добавьте фотографию, PDF, файл Word или вставьте текст.", second: "Выберите язык, на котором хотите получить объяснение.", third: "Получите краткий разбор, сроки, план действий, подтверждающие фрагменты и черновик ответа, если он нужен.", privacy: "Конфиденциальность и хранение", accuracy: "Точность и ответственность", output: "Что вы получите", legal: "Правовая информация" },
  lv: { eyebrow: "Par WhatNow?", title: "Sīkāka informācija — kad tā ir vajadzīga", subtitle: "Galvenais ekrāns ir veltīts vienam uzdevumam: palīdzēt saprast dokumentu. Informācija par servisu atrodas šeit.", close: "Aizvērt informāciju", how: "Kā tas darbojas", first: "Pievienojiet fotoattēlu, PDF, Word failu vai ielīmējiet tekstu.", second: "Izvēlieties valodu, kurā vēlaties saņemt skaidrojumu.", third: "Saņemiet kopsavilkumu, termiņus, rīcības plānu, pamatojošos fragmentus un atbildes melnrakstu, ja tas vajadzīgs.", privacy: "Privātums un glabāšana", accuracy: "Precizitāte un atbildība", output: "Ko jūs saņemsiet", legal: "Juridiskā informācija" },
} as const;

const historyCopy = {
  ru: { save: "Повторить сохранение", saving: "Сохраняем в историю…", saved: "Автоматически сохранено в истории", signIn: "Войдите, чтобы последние 10 разборов сохранялись в аккаунте.", error: "Не удалось сохранить разбор. Нажмите, чтобы повторить." },
  lv: { save: "Mēģināt saglabāt vēlreiz", saving: "Saglabājam vēsturē…", saved: "Automātiski saglabāts vēsturē", signIn: "Pierakstieties, lai kontā saglabātu pēdējās 10 analīzes.", error: "Neizdevās saglabāt analīzi. Nospiediet, lai mēģinātu vēlreiz." },
  en: { save: "Retry saving", saving: "Saving to history…", saved: "Automatically saved to history", signIn: "Sign in to keep your latest 10 analyses in your account.", error: "We could not save this analysis. Select retry to try again." },
} as const;

type LimitNoticeData = {
  scope: "user_24h" | "user_window";
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

function resolvedProfileTheme(preferences: UserProfilePreferences): ColorTheme {
  if (preferences.theme === "light" || preferences.theme === "dark") return preferences.theme;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function Home() {
  const [productMode, setProductMode] = useState<"understand" | "create" | "translate">("understand");
  const [favoriteMode, setFavoriteMode] = useState<FavoriteMode>(null);
  const [language, setLanguage] = useState<ProfileLanguage>("en");
  const [analysisLanguage, setAnalysisLanguage] = useState<SupportedLanguage>("en");
  const [preferences, setPreferences] = useState<UserProfilePreferences>({ ...DEFAULT_PROFILE_PREFERENCES });
  const [modelSelectionAvailable, setModelSelectionAvailable] = useState(false);
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
  const [captchaChallengeOpen, setCaptchaChallengeOpen] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);
  const [headerPlan, setHeaderPlan] = useState<"free" | "pro">("free");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [userHubOpen, setUserHubOpen] = useState(false);
  const [userHubInitialTab, setUserHubInitialTab] = useState<"files" | "plan">("files");
  const [supportOpen, setSupportOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [fileSaveNotice, setFileSaveNotice] = useState<{ kind: "success" | "warning"; text: string } | null>(null);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [headerCompact, setHeaderCompact] = useState(false);
  const [headerRetreating, setHeaderRetreating] = useState(false);
  const [studioPrefill, setStudioPrefill] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const languagePickerRef = useRef<HTMLDivElement>(null);
  const lastAnalysisRef = useRef<{ fingerprint: string; result: AnalysisResult } | null>(null);
  const accountIdRef = useRef<string | null | undefined>(undefined);
  const pendingChallengeRef = useRef<((token: string) => void) | null>(null);
  const t = translations[language];
  const interfaceCopyLanguage = interfaceCopyFallback(language);
  const h = historyCopy[interfaceCopyLanguage];
  const w = workspaceCopy[interfaceCopyLanguage];
  const pin = modePinCopy[interfaceCopyLanguage];
  const filteredResponseLanguages = responseLanguageOptions.filter((option) => {
    const search = languageQuery.trim().toLocaleLowerCase();
    return !search || `${option.nativeName} ${option.englishName}`.toLocaleLowerCase().includes(search);
  });

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
      setCalendarOpen(false);
      setUserHubOpen(false);
      setSupportOpen(false);
      setFileSaveNotice(null);
      pendingChallengeRef.current = null;
      setCaptchaResetKey((current) => current + 1);
      setCaptchaError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    accountIdRef.current = nextId;
    setAccount(value);
    const localFavorite = readLocalFavoriteMode(nextId);
    setFavoriteMode(localFavorite);
    if (localFavorite) setProductMode(localFavorite);
    if (!value) {
      setHeaderPlan("free");
      setHistoryOpen(false);
      if (!localFavorite) setProductMode("understand");
      setLanguage("en");
      setAnalysisLanguage("en");
      setPreferences({ ...DEFAULT_PROFILE_PREFERENCES });
      setModelSelectionAvailable(false);
    }
  }, []);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    let previousScrollY = window.scrollY;
    const updateHeader = () => {
      const nextScrollY = window.scrollY;
      setHeaderCompact(nextScrollY > 140);
      if (productMode !== "create") {
        setHeaderRetreating(false);
      } else if (nextScrollY > previousScrollY + 6 && nextScrollY > 150) {
        setHeaderRetreating(true);
      } else if (nextScrollY < previousScrollY - 6 || nextScrollY <= 140) {
        setHeaderRetreating(false);
      }
      previousScrollY = nextScrollY;
    };
    const updateStudioHeader = (event: Event) => {
      if (productMode !== "create") return;
      setHeaderRetreating(Boolean((event as CustomEvent<{ retreat?: boolean }>).detail?.retreat));
    };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    window.addEventListener("whatnow:studio-scroll", updateStudioHeader);
    return () => {
      window.removeEventListener("scroll", updateHeader);
      window.removeEventListener("whatnow:studio-scroll", updateStudioHeader);
    };
  }, [productMode]);

  useEffect(() => {
    const localFavorite = readLocalFavoriteMode();
    if (!localFavorite) return;
    const timer = window.setTimeout(() => {
      setFavoriteMode(localFavorite);
      setProductMode(localFavorite);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!account) return;
    let active = true;
    Promise.all([
      loadUserProfileWithAccess(),
      loadFavoriteMode().catch(() => undefined),
    ]).then(([{ preferences: profile, modelSelectionAvailable: hasModelSelection }, remoteFavorite]) => {
      if (!active || accountIdRef.current !== account.id) return;
      setPreferences(profile);
      setModelSelectionAvailable(hasModelSelection);
      setLanguage(profile.uiLanguage);
      setAnalysisLanguage(profile.analysisLanguage);
      setTheme(resolvedProfileTheme(profile));
      if (remoteFavorite !== undefined) {
        setFavoriteMode(remoteFavorite);
        writeLocalFavoriteMode(account.id, remoteFavorite);
        if (remoteFavorite) setProductMode(remoteFavorite);
      }
    }).catch(() => {
      if (!active || accountIdRef.current !== account.id) return;
      setPreferences({ ...DEFAULT_PROFILE_PREFERENCES });
      setModelSelectionAvailable(false);
      setLanguage("en");
      setAnalysisLanguage("en");
    });
    return () => { active = false; };
  }, [account]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { window.localStorage.setItem("whatnow.theme", theme); } catch { /* Theme persistence is optional. */ }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.fontScale = preferences.fontScale;
    document.documentElement.dataset.density = preferences.density;
    document.documentElement.dataset.reducedMotion = preferences.reducedMotion ? "true" : "false";
  }, [preferences.density, preferences.fontScale, preferences.reducedMotion]);

  useEffect(() => {
    if (!languagePickerOpen) return;
    const closeWhenOutside = (event: globalThis.MouseEvent) => {
      if (!languagePickerRef.current?.contains(event.target as Node)) setLanguagePickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLanguagePickerOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [languagePickerOpen]);

  const applyPreferences = useCallback(async (patch: UserProfilePatch) => {
    if (!account) return;
    const next = await updateUserProfile(patch);
    setPreferences(next);
    setLanguage(next.uiLanguage);
    setAnalysisLanguage(next.analysisLanguage);
    setTheme(resolvedProfileTheme(next));
  }, [account]);

  const toggleFavoriteMode = useCallback(async () => {
    const nextFavorite = favoriteMode === productMode ? null : productMode;
    setFavoriteMode(nextFavorite);
    writeLocalFavoriteMode(account?.id, nextFavorite);
    if (account) {
      try {
        const savedFavorite = await updateFavoriteMode(nextFavorite);
        setFavoriteMode(savedFavorite);
        writeLocalFavoriteMode(account.id, savedFavorite);
      } catch {
        // Keep the local copy so a temporary account-store outage does not lose the choice.
      }
    }
  }, [account, favoriteMode, productMode]);

  const changeTheme = useCallback((value: ColorTheme) => {
    setTheme(value);
    if (account) void applyPreferences({ theme: value });
  }, [account, applyPreferences]);

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

  const handleTextPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => (
      item.kind === "file" && ["image/jpeg", "image/png", "image/webp"].includes(item.type)
    ));
    const pastedImage = imageItem?.getAsFile();
    if (!pastedImage) return;

    event.preventDefault();
    const extension = pastedImage.type === "image/jpeg" ? "jpg" : pastedImage.type === "image/png" ? "png" : "webp";
    const file = new File(
      [pastedImage],
      `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`,
      { type: pastedImage.type, lastModified: Date.now() },
    );
    setInputMode("file");
    setTextError(null);
    selectDocument(file);
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
  ): Promise<string | null> => {
    if (!account || savingHistory) return null;
    const accountId = account.id;
    setSavingHistory(true);
    setHistoryError(null);
    try {
      const title = result.documentType.value || result.summary || "WhatNow?";
      const item = await saveAnalysisToHistory({ title, sourceKind, language: outputLanguage, result, accessToken });
      if (accountIdRef.current === accountId) {
        setSavedHistoryId(item.id);
        return item.id;
      }
    } catch {
      if (accountIdRef.current === accountId) setHistoryError(historyCopy[interfaceCopyFallback(language)].error);
    } finally {
      if (accountIdRef.current === accountId) setSavingHistory(false);
    }
    return null;
  };

  const analyzeDocument = async (challengeToken?: string) => {
    if (isAnalyzing) return;
    if (!account) {
      setAnalysisError(t.errorAuthenticationRequired);
      setAuthOpen(true);
      return;
    }
    if (account.requiresLegalAcceptance) {
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
    setFileError(null);
    setTextError(null);
    setAnalysisError(null);
    setLimitNotice(null);

    const fingerprint = inputMode === "file"
      ? `${analysisLanguage}:file:${selectedDocument!.file.name}:${selectedDocument!.file.size}:${selectedDocument!.file.lastModified}`
      : `${analysisLanguage}:text:${fingerprintText(documentText.trim())}`;

    if (lastAnalysisRef.current?.fingerprint === fingerprint) {
      setAnalysis(lastAnalysisRef.current.result);
      setShowResult(true);
      scrollToResult();
      return;
    }

    const formData = new FormData();
    formData.set("language", analysisLanguage);
    formData.set("mode", inputMode);
    if (challengeToken) formData.set("turnstileToken", challengeToken);
    if (inputMode === "file") formData.set("file", selectedDocument!.file);
    else formData.set("text", documentText.trim());

    const controller = new AbortController();
    // Keep the browser aligned with the server-side ten-minute ceiling.
    const timeout = window.setTimeout(() => controller.abort(), 600_000);
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
        if (limit?.code === "captcha_required" || limit?.code === "captcha_failed" || limit?.code === "captcha_unavailable") {
          pendingChallengeRef.current = (token) => { void analyzeDocument(token); };
          setCaptchaError(limit.code === "captcha_required" ? null : limit.code === "captcha_failed" ? t.errorCaptchaFailed : t.errorCaptchaUnavailable);
          setCaptchaChallengeOpen(true);
          setCaptchaResetKey((current) => current + 1);
          return;
        }
        if (
          limit?.code === "user_limit_reached"
          && (limit.scope === "user_24h" || limit.scope === "user_window")
          && typeof limit.resetAt === "number"
          && limit.limits?.daily && limit.limits?.weekly
        ) {
          // Record when the notice was observed; this is intentionally read in the async event handler.
          // eslint-disable-next-line react-hooks/purity
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
      void persistAnalysisHistory(payload.result, inputMode, analysisLanguage, accessToken);
      if (inputMode === "file" && selectedDocument && preferences.autoSaveFiles) {
        const file = selectedDocument.file;
        void uploadStoredFile(file).then((savedFile) => {
          setFileSaveNotice({ kind: "success", text: savedFile.deduplicated ? w.fileDuplicate : w.fileSaved });
        }).catch((saveError) => {
          const limited = saveError instanceof FileClientError && (saveError.code === "file_count_limit" || saveError.code === "file_bytes_limit");
          setFileSaveNotice({ kind: "warning", text: limited ? w.fileLimit : w.fileSaveError });
        });
      }
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
    setFileSaveNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goHome = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    resetAnalysis();
    setInfoOpen(false);
    setSupportOpen(false);
    setCalendarOpen(false);
    setUserHubOpen(false);
    setHistoryOpen(false);
    setAuthOpen(false);
    setStudioPrefill("");
    setProductMode("understand");
  };

  const openHistoryItem = (item: AnalysisHistoryItem) => {
    setAnalysisLanguage(item.language);
    setInputMode(item.sourceKind);
    setAnalysis(item.result);
    setShowResult(true);
    setSavedHistoryId(item.id);
    setHistoryError(null);
    setHistoryOpen(false);
    scrollToResult();
  };

  const useStoredFile = (file: File) => {
    setInputMode("file");
    selectDocument(file);
    setUserHubOpen(false);
    window.setTimeout(() => document.getElementById("analyzer-title")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const useTranslationInUnderstand = (translatedText: string) => {
    clearSelectedDocument();
    setDocumentText(translatedText);
    setInputMode("text");
    setAnalysis(null);
    setAnalysisError(null);
    setShowResult(false);
    setProductMode("understand");
    window.setTimeout(() => document.getElementById("analyzer-title")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const useTranslationInCreate = (translatedText: string) => {
    setStudioPrefill(translatedText);
    setShowResult(false);
    setProductMode("create");
    window.setTimeout(() => document.getElementById("studio-title")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <main className={productMode === "translate" ? "translation-page-root" : undefined}>
      <header className={`site-header${headerCompact ? " compact" : ""}${headerRetreating ? " retreating" : ""}${productMode === "translate" ? " translate-mode" : ""}`}>
        <a className="brand" href="#top" aria-label={t.homeAria} onClick={goHome}>
          <img className="brand-mark" src="/whatnow-logo.jpg" alt="" />
          <span>{headerPlan === "pro" ? "WhatNow Pro" : "WhatNow Free"}</span>
        </a>
        <div className="header-actions">
          <div className="header-nav-actions">
            <button className="header-tool-button header-optional-action" type="button" aria-label={w.info} data-tooltip={w.info} onClick={() => setInfoOpen(true)}><ToolIcon kind="about" />{w.info}</button>
            <button className="header-tool-button header-optional-action" type="button" aria-label={w.support} data-tooltip={w.support} onClick={() => account ? setSupportOpen(true) : setAuthOpen(true)}><ToolIcon kind="support" />{w.support}</button>
            {account && <button className="header-tool-button" type="button" aria-label={w.calendar} data-tooltip={w.calendar} onClick={() => setCalendarOpen(true)}><ToolIcon kind="calendar" />{w.calendar}</button>}
            {account && <button className="header-tool-button" type="button" aria-label={w.space} data-tooltip={w.space} onClick={() => { setUserHubInitialTab("files"); setUserHubOpen(true); }}><ToolIcon kind="space" />{w.space}</button>}
          </div>
          <div className="header-utility-actions">
            <a className="header-tool-button x-account-link header-optional-action" href="https://x.com/WhatNowAI" target="_blank" rel="noreferrer" aria-label="Follow WhatNow? on X: @WhatNowAI" data-tooltip="Follow @WhatNowAI on X"><span className="x-account-symbol" aria-hidden="true">𝕏</span>{w.x}</a>
            <AccountWidget locale={language} accountAria={t.accountAria} onAccountChange={handleAccountChange}
              onOpenHistory={() => setHistoryOpen(true)} theme={theme} onThemeChange={changeTheme} open={authOpen} onOpenChange={setAuthOpen}
              quotaRefreshKey={quotaRefreshKey} onPlanChange={setHeaderPlan} />
          </div>
        </div>
      </header>

      {limitNotice && <LimitToast key={`${limitNotice.scope}:${limitNotice.observedAt}`} data={limitNotice} locale={language} onClose={() => setLimitNotice(null)} />}
      {fileSaveNotice && <div className={`storage-toast ${fileSaveNotice.kind}`} role="status"><span>{fileSaveNotice.kind === "success" ? "✓" : "!"}</span><p>{fileSaveNotice.text}</p><button type="button" aria-label="Close" onClick={() => setFileSaveNotice(null)}>×</button></div>}

      {!showResult && <>
      <nav className={`product-mode-switch${productMode === "translate" ? " translate-mode" : ""}`} aria-label="WhatNow? modes">
        <SlidingSegmentedControl className="product-mode-segments" activeKey={productMode} ariaLabel="WhatNow? modes">
          <button type="button" data-segment-active={productMode === "understand"} className={productMode === "understand" ? "active" : ""} aria-current={productMode === "understand" ? "page" : undefined} onClick={() => setProductMode("understand")}><span aria-hidden="true">⌕</span><strong>{interfaceCopyLanguage === "ru" ? (productMode === "translate" ? "Понять" : "Понять документ") : interfaceCopyLanguage === "lv" ? (productMode === "translate" ? "Saprast" : "Saprast dokumentu") : "Understand"}</strong></button>
          <button type="button" data-segment-active={productMode === "create"} className={productMode === "create" ? "active" : ""} aria-current={productMode === "create" ? "page" : undefined} onClick={() => { setStudioPrefill(""); setProductMode("create"); }}><span aria-hidden="true">✦</span><strong>{interfaceCopyLanguage === "ru" ? (productMode === "translate" ? "Создать" : "Создать и изменить") : interfaceCopyLanguage === "lv" ? (productMode === "translate" ? "Izveidot" : "Izveidot un rediģēt") : productMode === "translate" ? "Create" : "Create & edit"}</strong></button>
          <button type="button" data-segment-active={productMode === "translate"} className={productMode === "translate" ? "active" : ""} aria-current={productMode === "translate" ? "page" : undefined} onClick={() => setProductMode("translate")}><span aria-hidden="true">↔</span><strong>{interfaceCopyLanguage === "ru" ? "Перевести" : interfaceCopyLanguage === "lv" ? "Tulkot" : "Translate"}</strong></button>
        </SlidingSegmentedControl>
        <button type="button" className={`mode-pin-button${favoriteMode === productMode ? " pinned" : ""}`} aria-pressed={favoriteMode === productMode} aria-label={favoriteMode === productMode ? pin.unpin : pin.pin} data-tooltip={favoriteMode === productMode ? pin.unpin : pin.pin} onClick={() => void toggleFavoriteMode()}><span aria-hidden="true">{favoriteMode === productMode ? "★" : "☆"}</span><small>{favoriteMode === productMode ? pin.saved : pin.pin}</small></button>
      </nav>
      </>}

      {showResult && analysis ? (
        <AnalysisResultView key={`${savedHistoryId ?? "unsaved"}:${analysis.summary}`} result={analysis} onRestart={resetAnalysis} t={t} locale={language}
          account={account} analysisId={savedHistoryId} preferences={preferences} onSave={() => void persistAnalysisHistory(analysis, inputMode, analysisLanguage)} saving={savingHistory} saved={Boolean(savedHistoryId)} historyError={historyError} h={h} />
      ) : productMode === "create" ? (
        <DocumentStudioPrototype locale={language} account={account} initialPrompt={studioPrefill} onRequireAccount={() => setAuthOpen(true)} />
      ) : productMode === "translate" ? (
        <TranslationWorkspace locale={language} defaultLanguage={analysisLanguage} account={account} onRequireAccount={() => setAuthOpen(true)}
          onChallengeRequired={(retry) => { pendingChallengeRef.current = retry; setCaptchaError(null); setCaptchaChallengeOpen(true); setCaptchaResetKey((current) => current + 1); }}
          onUseInUnderstand={useTranslationInUnderstand} onUseInCreate={useTranslationInCreate} />
      ) : (
        <>
      <section className="hero" id="top">
        <div className="analyzer-card" aria-labelledby="analyzer-title">
          <div className="card-heading">
            <h2 id="analyzer-title">{t.addDocument}</h2>
          </div>

          <fieldset className="language-fieldset">
            <legend>{t.explanationLanguage}</legend>
            <div className="language-picker" ref={languagePickerRef}>
              <button
                className="language-picker-trigger"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={languagePickerOpen}
                aria-controls="response-language-options"
                disabled={isAnalyzing}
                onClick={() => setLanguagePickerOpen((current) => !current)}
              >
                <span className="language-picker-glyph" aria-hidden="true">A</span>
                <span className="language-picker-current"><small>{t.languagePickerSelected}</small><strong>{languageOption(analysisLanguage).nativeName}</strong></span>
                <span className="language-picker-chevron" aria-hidden="true">⌄</span>
              </button>
              <p className="language-picker-hint">{t.languagePickerHint}</p>
              {languagePickerOpen && <div className="language-picker-menu" role="dialog" aria-label={t.explanationLanguage}>
                <label className="language-picker-search">
                  <span className="visually-hidden">{t.languagePickerSearch}</span>
                  <span aria-hidden="true">⌕</span>
                  <input autoFocus type="search" value={languageQuery} onChange={(event) => setLanguageQuery(event.target.value)} placeholder={t.languagePickerSearch} />
                </label>
                <div id="response-language-options" className="language-picker-options" role="listbox" aria-label={t.explanationLanguage}>
                  {filteredResponseLanguages.map((option) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={analysisLanguage === option.code}
                      className={analysisLanguage === option.code ? "active" : ""}
                      key={option.code}
                      onClick={() => {
                        setAnalysisLanguage(option.code);
                        if (account) void applyPreferences({ analysisLanguage: option.code });
                        setAnalysis(null);
                        setAnalysisError(null);
                        setShowResult(false);
                        setLanguagePickerOpen(false);
                        setLanguageQuery("");
                      }}
                    >
                      <span className="language-picker-code">{option.code.toUpperCase()}</span>
                      <span><strong>{option.nativeName}</strong><small>{option.englishName}</small></span>
                      {analysisLanguage === option.code && <span className="language-picker-check" aria-label={t.languagePickerSelected}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>}
            </div>
          </fieldset>

          <SlidingSegmentedControl className="source-tabs" activeKey={inputMode} ariaLabel={t.sourceMethod}>
            <button
              data-segment-active={inputMode === "file"}
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
              data-segment-active={inputMode === "text"}
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
          </SlidingSegmentedControl>

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
                  <div className="dropzone-actions">
                    <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
                      {t.chooseFile}
                    </button>
                  </div>
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
                onPaste={handleTextPaste}
              />
              <div className="text-meta">
                <small id="text-help">{t.textPrivacy}</small>
                <small id="text-counter">{documentText.length.toLocaleString(localeTag(language))} / 50 000</small>
              </div>
              <div className="text-input-actions">
                <small className="clipboard-image-hint">{t.pasteScreenshotHint}</small>
              </div>
              {textError && <p className="input-error" id="text-error" role="alert">{textError}</p>}
            </div>
          )}

          <button className="primary-button" type="button" onClick={() => void analyzeDocument()} disabled={isAnalyzing}>
            {isAnalyzing
              ? t.analyzing
              : inputMode === "file"
                ? t.analyzeFile
                : t.analyzeText} {!isAnalyzing && <span aria-hidden="true">→</span>}
          </button>
          {isAnalyzing && <AnalysisProgress t={t} />}
          {analysisError && <p className="input-error analysis-error" role="alert">{analysisError}</p>}
          <button className="privacy-shortcut" type="button" onClick={() => setInfoOpen(true)}><span aria-hidden="true">⌁</span>{w.privateHint}</button>

        </div>
      </section>
        </>
      )}
      {historyOpen && account && <HistoryPanel locale={language} onClose={closeHistory} onOpen={openHistoryItem} />}
      {account && <CalendarPanel open={calendarOpen} locale={language} preferences={preferences} onClose={() => setCalendarOpen(false)} />}
      {account && <UserHub open={userHubOpen} initialTab={userHubInitialTab} locale={language} preferences={preferences} modelSelectionAvailable={modelSelectionAvailable} onPreferencesChange={applyPreferences} onUseFile={useStoredFile} onClose={() => setUserHubOpen(false)} />}
      {account && <SupportPanel open={supportOpen} locale={language} onClose={() => setSupportOpen(false)} />}
      <InfoPanel open={infoOpen} locale={language} t={t} onClose={() => setInfoOpen(false)} />
      {captchaChallengeOpen && <SecurityChallenge locale={language} theme={theme} resetKey={captchaResetKey} error={captchaError}
        onClose={() => { pendingChallengeRef.current = null; setCaptchaChallengeOpen(false); setCaptchaError(null); }}
        onVerified={(token) => { const retry = pendingChallengeRef.current; pendingChallengeRef.current = null; setCaptchaChallengeOpen(false); setCaptchaError(null); if (retry) void retry(token); else void analyzeDocument(token); }}
        onError={() => setCaptchaError(t.errorCaptchaUnavailable)} />}

      <footer>
        <a className="brand footer-brand" href="#top"><img className="brand-mark" src="/whatnow-logo.jpg" alt="" /><span>WhatNow?</span></a>
        <div className="footer-copy"><p>{t.footerNotice}</p><nav aria-label="Legal"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></nav></div>
      </footer>
    </main>
  );
}

function ToolIcon({ kind }: { kind: "about" | "support" | "calendar" | "space" }) {
  return <span className={`tool-icon tool-icon-${kind}`} aria-hidden="true"><i /><b /></span>;
}

function SecurityChallenge({ locale, theme, resetKey, error, onClose, onVerified, onError }: {
  locale: ProfileLanguage;
  theme: ColorTheme;
  resetKey: number;
  error: string | null;
  onClose: () => void;
  onVerified: (token: string) => void;
  onError: () => void;
}) {
  const copy = challengeCopy[interfaceCopyFallback(locale)];
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="security-challenge-backdrop" role="presentation">
    <section className="security-challenge-dialog" role="dialog" aria-modal="true" aria-labelledby="security-challenge-title">
      <button className="icon-button security-challenge-close" type="button" aria-label={copy.close} onClick={onClose}>×</button>
      <img className="auth-mark" src="/whatnow-logo.jpg" alt="" />
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2 id="security-challenge-title">{copy.title}</h2>
      <p>{copy.body}</p>
      <div className={`captcha-box compact${error ? " has-error" : ""}`}>
        <TurnstileWidget action="analyze" language={locale} theme={theme} resetKey={resetKey}
          onToken={(token) => { if (token) onVerified(token); }} onError={onError} />
        <small aria-live="polite">{error ?? translations[locale].captchaWaiting}</small>
      </div>
    </section>
  </div>;
}

function InfoPanel({ open, locale, t, onClose }: { open: boolean; locale: ProfileLanguage; t: UiCopy; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);
  if (!open) return null;
  const c = infoCopy[interfaceCopyFallback(locale)];
  return <div className="hub-backdrop info-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="info-panel" role="dialog" aria-modal="true" aria-labelledby="info-title">
      <header className="hub-panel-header info-panel-header">
        <div><p className="eyebrow">{c.eyebrow}</p><h2 id="info-title">{c.title}</h2><p>{c.subtitle}</p></div>
        <button className="icon-button" type="button" aria-label={c.close} onClick={onClose}>×</button>
      </header>
      <div className="info-content">
        <section><h3>{c.how}</h3><ol className="info-steps"><li><span>1</span><p>{c.first}</p></li><li><span>2</span><p>{c.second}</p></li><li><span>3</span><p>{c.third}</p></li></ol></section>
        <section><h3>{c.output}</h3><div className="info-benefits"><article><strong>{t.benefitSummary}</strong><p>{t.benefitSummaryText}</p></article><article><strong>{t.benefitDeadline}</strong><p>{t.benefitDeadlineText}</p></article><article><strong>{t.benefitPlan}</strong><p>{t.benefitPlanText}</p></article><article><strong>{t.benefitReply}</strong><p>{t.benefitReplyText}</p></article></div></section>
        <div className="info-detail-grid"><section><h3>{c.privacy}</h3><p>{t.privacyAppStorage}</p><p>{t.serverPrivacy}</p><p>{t.privacyOpenAI}</p><p>{t.privacyTraining}</p></section><section><h3>{c.accuracy}</h3><p>{t.professionalText}</p><p>{t.aiCanErrText}</p><p>{t.privacyMinimize}</p></section></div>
        <section className="info-legal"><h3>{c.legal}</h3><nav><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></nav></section>
      </div>
    </section>
  </div>;
}

function localeTag(locale: ProfileLanguage): string {
  return locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-US";
}

function durationLabel(milliseconds: number, locale: ProfileLanguage): string {
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

function LimitToast({ data, locale, onClose }: { data: LimitNoticeData; locale: ProfileLanguage; onClose: () => void }) {
  const [now, setNow] = useState(data.observedAt);
  const t = limitCopy[interfaceCopyFallback(locale)];
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
  locale: ProfileLanguage;
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

function stepCount(count: number, locale: ProfileLanguage): string {
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
  analysisId,
  preferences,
  onSave,
  saving,
  saved,
  historyError,
  h,
}: {
  result: AnalysisResult;
  onRestart: () => void;
  t: UiCopy;
  locale: ProfileLanguage;
  account: SupabaseAccount | null;
  analysisId: string | null;
  preferences: UserProfilePreferences;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  historyError: string | null;
  h: (typeof historyCopy)[keyof typeof historyCopy];
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [selectedResultText, setSelectedResultText] = useState<string | null>(null);
  const resultSectionRef = useRef<HTMLElement>(null);
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

  const captureGeneratedSelection = () => {
    window.setTimeout(() => {
      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const section = resultSectionRef.current;
      const ancestor = range?.commonAncestorContainer ?? null;
      const ancestorElement = ancestor instanceof Element ? ancestor : ancestor?.parentElement;
      const text = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
      if (!section || !ancestor || !section.contains(ancestor) || ancestorElement?.closest(".document-chat-cta,.document-chat-backdrop,.result-actions") || text.length < 3) {
        setSelectedResultText(null);
        return;
      }
      setSelectedResultText(text.slice(0, 1_600));
    }, 0);
  };

  return (
    <section className="result-section" id="analysis-result" aria-labelledby="result-title" ref={resultSectionRef}
      onMouseUp={captureGeneratedSelection} onTouchEnd={captureGeneratedSelection}>
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

      <DocumentChat analysisId={analysisId} locale={locale} selectedText={selectedResultText}
        onSelectionConsumed={() => { window.getSelection()?.removeAllRanges(); setSelectedResultText(null); }} />

      {account && <EventSuggestions key={analysisId ?? `${result.summary}:${result.outputLanguage}`} result={result} analysisId={analysisId} locale={locale} preferences={preferences} />}

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
