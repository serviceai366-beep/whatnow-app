"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { formatFileSize, validateDocumentFile } from "./file-validation";
import { responseLanguageOptions, interfaceCopyFallback } from "./language-options";
import type { ProfileLanguage } from "./profile-types";
import type { SupabaseAccount } from "./supabase-auth";
import { getAccessToken } from "./supabase-auth";
import { validateTranslationResult, type TranslationResult } from "./translation-schema";
import type { SupportedLanguage } from "./analysis-schema";

type Copy = {
  title: string;
  intro: string;
  target: string;
  upload: string;
  paste: string;
  drop: string;
  release: string;
  orChoose: string;
  choose: string;
  allowed: string;
  remove: string;
  sourceLabel: string;
  sourcePlaceholder: string;
  translate: string;
  translating: string;
  result: string;
  sourceLanguage: string;
  unknownSource: string;
  copy: string;
  copied: string;
  useUnderstand: string;
  useCreate: string;
  notes: string;
  uncertainties: string;
  signIn: string;
  legal: string;
  empty: string;
  invalid: string;
  failed: string;
  timeout: string;
  limit: string;
  auth: string;
};

const copy: Record<"en" | "ru" | "lv", Copy> = {
  en: {
    title: "Translate a document",
    intro: "Upload an image, PDF, Word file, or paste text. Choose the language for the translation.",
    target: "Translate into",
    upload: "Upload file",
    paste: "Paste text",
    drop: "Drop a document here",
    release: "Release to add the document",
    orChoose: "or choose it from your device",
    choose: "Choose file",
    allowed: "PDF, JPG, PNG, WebP, TXT, RTF, DOCX, or ODT · up to 10 MB",
    remove: "Remove file",
    sourceLabel: "Text to translate",
    sourcePlaceholder: "Paste the text you want to translate…",
    translate: "Translate",
    translating: "Translating…",
    result: "Translation",
    sourceLanguage: "Detected source language",
    unknownSource: "Unknown source language",
    copy: "Copy translation",
    copied: "Copied",
    useUnderstand: "Use in Understand",
    useCreate: "Use in Create & edit",
    notes: "Notes",
    uncertainties: "Unclear parts",
    signIn: "Sign in to translate documents.",
    legal: "Please accept the privacy terms in your account before translating.",
    empty: "Add a file or paste text first.",
    invalid: "This file cannot be used. Check its format and size.",
    failed: "The translation could not be completed. Try again.",
    timeout: "The translation took too long. Try again with a shorter document.",
    limit: "Your request limit has been reached. Try again after it resets.",
    auth: "Your session has expired. Sign in again.",
  },
  ru: {
    title: "Перевести документ",
    intro: "Загрузите изображение, PDF, файл Word или вставьте текст. Выберите язык перевода.",
    target: "Перевести на",
    upload: "Загрузить файл",
    paste: "Вставить текст",
    drop: "Перетащите документ сюда",
    release: "Отпустите, чтобы добавить документ",
    orChoose: "или выберите его на устройстве",
    choose: "Выбрать файл",
    allowed: "PDF, JPG, PNG, WebP, TXT, RTF, DOCX или ODT · до 10 МБ",
    remove: "Удалить файл",
    sourceLabel: "Текст для перевода",
    sourcePlaceholder: "Вставьте текст, который нужно перевести…",
    translate: "Перевести",
    translating: "Переводим…",
    result: "Перевод",
    sourceLanguage: "Определённый исходный язык",
    unknownSource: "Исходный язык не определён",
    copy: "Скопировать перевод",
    copied: "Скопировано",
    useUnderstand: "Использовать в «Понять документ»",
    useCreate: "Использовать в «Создать и изменить»",
    notes: "Заметки",
    uncertainties: "Неясные места",
    signIn: "Войдите, чтобы переводить документы.",
    legal: "Перед переводом примите условия конфиденциальности в аккаунте.",
    empty: "Сначала добавьте файл или вставьте текст.",
    invalid: "Этот файл нельзя использовать. Проверьте формат и размер.",
    failed: "Не удалось выполнить перевод. Попробуйте ещё раз.",
    timeout: "Перевод занял слишком много времени. Попробуйте более короткий документ.",
    limit: "Лимит запросов исчерпан. Попробуйте после его обновления.",
    auth: "Сессия истекла. Войдите снова.",
  },
  lv: {
    title: "Iztulkot dokumentu",
    intro: "Augšupielādējiet attēlu, PDF, Word failu vai ielīmējiet tekstu. Izvēlieties tulkojuma valodu.",
    target: "Tulko uz",
    upload: "Augšupielādēt failu",
    paste: "Ielīmēt tekstu",
    drop: "Ievietojiet dokumentu šeit",
    release: "Atlaidiet, lai pievienotu dokumentu",
    orChoose: "vai izvēlieties to ierīcē",
    choose: "Izvēlēties failu",
    allowed: "PDF, JPG, PNG, WebP, TXT, RTF, DOCX vai ODT · līdz 10 MB",
    remove: "Noņemt failu",
    sourceLabel: "Tulkojamais teksts",
    sourcePlaceholder: "Ielīmējiet tekstu, kuru vēlaties tulkot…",
    translate: "Tulkot",
    translating: "Tulkojam…",
    result: "Tulkojums",
    sourceLanguage: "Noteiktā avota valoda",
    unknownSource: "Avota valoda nav noteikta",
    copy: "Kopēt tulkojumu",
    copied: "Nokopēts",
    useUnderstand: "Izmantot sadaļā “Saprast dokumentu”",
    useCreate: "Izmantot sadaļā “Izveidot un rediģēt”",
    notes: "Piezīmes",
    uncertainties: "Neskaidras vietas",
    signIn: "Pierakstieties, lai tulkotu dokumentus.",
    legal: "Pirms tulkošanas pieņemiet privātuma noteikumus savā kontā.",
    empty: "Vispirms pievienojiet failu vai ielīmējiet tekstu.",
    invalid: "Šo failu nevar izmantot. Pārbaudiet formātu un izmēru.",
    failed: "Tulkojumu neizdevās pabeigt. Mēģiniet vēlreiz.",
    timeout: "Tulkošana aizņēma pārāk daudz laika. Izmēģiniet īsāku dokumentu.",
    limit: "Pieprasījumu limits ir sasniegts. Mēģiniet pēc tā atjaunošanas.",
    auth: "Sesija ir beigusies. Pierakstieties vēlreiz.",
  },
};

type Props = {
  locale: ProfileLanguage;
  defaultLanguage: SupportedLanguage;
  account: SupabaseAccount | null;
  onRequireAccount: () => void;
  onChallengeRequired?: (retry: (token: string) => void) => void;
  onUseInUnderstand: (text: string) => void;
  onUseInCreate: (text: string) => void;
};

function languageName(code: SupportedLanguage): string {
  return responseLanguageOptions.find((option) => option.code === code)?.nativeName ?? code.toUpperCase();
}

export function TranslationWorkspace({ locale, defaultLanguage, account, onRequireAccount, onChallengeRequired, onUseInUnderstand, onUseInCreate }: Props) {
  const uiLocale = interfaceCopyFallback(locale);
  const t = copy[uiLocale];
  const [inputMode, setInputMode] = useState<"file" | "text">("file");
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>(defaultLanguage);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chooseFile = (nextFile: File | null) => {
    if (!nextFile) return;
    const validation = validateDocumentFile(nextFile);
    setResult(null);
    setError("");
    if (!validation.ok) {
      setFile(null);
      setFileError(validation.code === "empty" || validation.code === "too_large" || validation.code === "unsupported" ? t.invalid : t.invalid);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(nextFile);
    setFileError("");
  };

  const submitTranslation = async (challengeToken?: string) => {
    if (!account) { onRequireAccount(); return; }
    if (account.requiresLegalAcceptance) { setError(t.legal); onRequireAccount(); return; }
    if (inputMode === "file" && !file) { setError(t.empty); return; }
    if (inputMode === "text" && !text.trim()) { setError(t.empty); return; }
    setIsTranslating(true);
    setResult(null);
    setError("");
    const formData = new FormData();
    formData.set("targetLanguage", targetLanguage);
    formData.set("mode", inputMode);
    if (challengeToken) formData.set("turnstileToken", challengeToken);
    if (inputMode === "file") formData.set("file", file!);
    else formData.set("text", text.trim());
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 600_000);
    try {
      const token = await getAccessToken();
      if (!token) { setError(t.auth); onRequireAccount(); return; }
      const response = await fetch("/api/translate", { method: "POST", body: formData, headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      const payload = await response.json().catch(() => null) as { result?: unknown; error?: { code?: string; scope?: string } } | null;
      if (!response.ok || !payload?.result) {
        const code = payload?.error?.code;
        if (code === "captcha_required" || code === "captcha_failed" || code === "captcha_unavailable") {
          onChallengeRequired?.((retryToken) => { void submitTranslation(retryToken); });
          return;
        }
        if (code === "user_limit_reached" || code === "service_limit_reached") { setError(t.limit); return; }
        if (code === "authentication_required" || code === "authentication_invalid") { setError(t.auth); onRequireAccount(); return; }
        throw new Error(code === "timeout" ? t.timeout : t.failed);
      }
      if (!validateTranslationResult(payload.result, targetLanguage)) throw new Error(t.failed);
      setResult(payload.result);
      window.setTimeout(() => document.getElementById("translation-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (caught) {
      setError(caught instanceof Error && caught.name === "AbortError" ? t.timeout : caught instanceof Error ? caught.message : t.failed);
    } finally {
      window.clearTimeout(timeout);
      setIsTranslating(false);
    }
  };

  const copyTranslation = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.translation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t.failed);
    }
  };

  return (
    <section className="translation-shell" aria-labelledby="translation-title">
      <header className="translation-header">
        <div><p className="eyebrow">WhatNow?</p><h1 id="translation-title">{t.title}</h1><p>{t.intro}</p></div>
        <label className="translation-language-control"><span>{t.target}</span><select value={targetLanguage} onChange={(event) => { setTargetLanguage(event.target.value as SupportedLanguage); setResult(null); }} disabled={isTranslating}>
          {responseLanguageOptions.map((option) => <option key={option.code} value={option.code}>{option.nativeName} · {option.englishName}</option>)}
        </select></label>
      </header>

      <div className="source-tabs" role="tablist" aria-label={t.title}>
        <button type="button" role="tab" aria-selected={inputMode === "file"} className={inputMode === "file" ? "active" : ""} onClick={() => { setInputMode("file"); setError(""); }} disabled={isTranslating}>{t.upload}</button>
        <button type="button" role="tab" aria-selected={inputMode === "text"} className={inputMode === "text" ? "active" : ""} onClick={() => { setInputMode("text"); setError(""); }} disabled={isTranslating}>{t.paste}</button>
      </div>

      {inputMode === "file" ? <div role="tabpanel">
        <input ref={fileInputRef} className="visually-hidden" type="file" aria-label={t.choose} accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,application/rtf,text/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,.pdf,.jpg,.jpeg,.png,.webp,.txt,.rtf,.docx,.odt" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0] ?? null)} disabled={isTranslating} />
        {file ? <div className="translation-file-preview file-preview"><div className="file-preview-header"><div><strong>{file.name}</strong><small>{formatFileSize(file.size, targetLanguage)}</small></div><button type="button" className="secondary-button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} disabled={isTranslating}>{t.remove}</button></div></div> : <div className={`dropzone${isDragging ? " is-dragging" : ""}${fileError ? " has-error" : ""}`} onDragEnter={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false); }} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); chooseFile(event.dataTransfer.files?.[0] ?? null); }}>
          <div className="document-icon" aria-hidden="true"><span>↔</span></div><strong>{isDragging ? t.release : t.drop}</strong><p>{t.orChoose}</p><button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={isTranslating}>{t.choose}</button><small>{t.allowed}</small>
        </div>}
        {fileError && <p className="input-error" role="alert">{fileError}</p>}
      </div> : <div className="text-panel" role="tabpanel"><label htmlFor="translation-text">{t.sourceLabel}</label><textarea id="translation-text" value={text} onChange={(event) => { setText(event.target.value); setError(""); setResult(null); }} maxLength={50_000} rows={10} placeholder={t.sourcePlaceholder} disabled={isTranslating} /><small>{text.length.toLocaleString(locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-US")} / 50 000</small></div>}

      <button className="primary-button" type="button" onClick={() => void submitTranslation()} disabled={isTranslating}>{isTranslating ? t.translating : t.translate}<span aria-hidden="true">→</span></button>
      {error && <p className="input-error analysis-error" role="alert">{error}</p>}

      {result && <section className="translation-result" id="translation-result" aria-labelledby="translation-result-title">
        <div className="translation-result-heading"><div><p className="eyebrow">{t.result}</p><h2 id="translation-result-title">{result.sourceLanguage === "unknown" ? t.unknownSource : languageName(result.sourceLanguage)} → {languageName(result.targetLanguage)}</h2></div><button type="button" className="secondary-button" onClick={() => void copyTranslation()}>{copied ? t.copied : t.copy}</button></div>
        <textarea className="translation-output" readOnly value={result.translation} aria-label={t.result} />
        {(result.notes.length > 0 || result.uncertainties.length > 0) && <div className="translation-notes">{result.notes.length > 0 && <div><h3>{t.notes}</h3><ul>{result.notes.map((note, index) => <li key={`note-${index}`}>{note}</li>)}</ul></div>}{result.uncertainties.length > 0 && <div><h3>{t.uncertainties}</h3><ul>{result.uncertainties.map((note, index) => <li key={`uncertainty-${index}`}>{note}</li>)}</ul></div>}</div>}
        <div className="translation-actions"><button type="button" className="secondary-button" onClick={() => onUseInUnderstand(result.translation)}>{t.useUnderstand}</button><button type="button" className="secondary-button" onClick={() => onUseInCreate(result.translation)}>{t.useCreate}</button></div>
      </section>}
    </section>
  );
}
