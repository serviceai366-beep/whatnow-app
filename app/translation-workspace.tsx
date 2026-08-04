"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { formatFileSize, validateDocumentFile } from "./file-validation";
import { responseLanguageOptions, interfaceCopyFallback } from "./language-options";
import type { ProfileLanguage } from "./profile-types";
import type { SupabaseAccount } from "./supabase-auth";
import { getAccessToken } from "./supabase-auth";
import { validateTranslationResult, type TranslationResult, type TranslationVariant, type TranslationVariantMode } from "./translation-schema";
import { validateTranslationFollowup, type TranslationFollowupAnswer } from "./translation-followup-schema";
import type { SupportedLanguage } from "./analysis-schema";

type Copy = {
  title: string; intro: string; target: string; upload: string; paste: string; drop: string; release: string; orChoose: string;
  choose: string; allowed: string; remove: string; sourceLabel: string; sourcePlaceholder: string; translate: string;
  translating: string; result: string; sourceLanguage: string; unknownSource: string; copy: string; copied: string;
  useUnderstand: string; useCreate: string; notes: string; uncertainties: string; signIn: string; legal: string;
  empty: string; invalid: string; failed: string; timeout: string; limit: string; auth: string; transcription: string;
  noTranscription: string; literal: string; conversational: string; official: string; bold: string; alternative: string; more: string;
  moreGenerating: string; moreLimit: string; additionalPending: string; additionalReady: string; additionalFailed: string; additionalRetry: string;
  askTitle: string; askPlaceholder: string; askSend: string; asking: string;
  you: string; assistant: string; followupEmpty: string; followupError: string; followupLimit: string; sourcePanel: string;
  outputPanel: string; chooseVariant: string; pronunciationHint: string; fastHint: string;
};

const copy: Record<"en" | "ru" | "lv", Copy> = {
  en: {
    title: "Translate a document", intro: "Keep the source on the left and compare a clear translation on the right.", target: "Translate into", upload: "Upload file", paste: "Paste text", drop: "Drop a document here", release: "Release to add the document", orChoose: "or choose it from your device", choose: "Choose file", allowed: "PDF, JPG, PNG, WebP, TXT, RTF, DOCX, or ODT · up to 10 MB", remove: "Remove file", sourceLabel: "Text to translate", sourcePlaceholder: "Paste the text you want to translate…", translate: "Translate", translating: "Translating…", result: "Translation", sourceLanguage: "Detected source language", unknownSource: "Unknown source language", copy: "Copy selected translation", copied: "Copied", useUnderstand: "Use in Understand", useCreate: "Use in Create & edit", notes: "Notes", uncertainties: "Unclear parts", signIn: "Sign in to translate documents.", legal: "Please accept the privacy terms in your account before translating.", empty: "Add a file or paste text first.", invalid: "This file cannot be used. Check its format and size.", failed: "The translation could not be completed. Try again.", timeout: "The translation took too long. Try again with a shorter document.", limit: "Your request limit has been reached. Try again after it resets.", auth: "Your session has expired. Sign in again.", transcription: "Pronunciation / transcription", noTranscription: "No short pronunciation guide was needed for this passage.", literal: "Literal", conversational: "Conversational", official: "Official", bold: "Bold", alternative: "Alternative", more: "Generate more variants", moreGenerating: "Generating variants…", moreLimit: "You already have the maximum five variants.", additionalPending: "Literal translation is ready. Generating conversational, official, and bold versions…", additionalReady: "All translation styles are ready.", additionalFailed: "The first translation is ready, but the other styles could not be generated.", additionalRetry: "Retry styles", askTitle: "Ask about this translation", askPlaceholder: "Ask about a word, nuance, or why this wording was chosen…", askSend: "Ask AI", asking: "Thinking…", you: "You", assistant: "AI", followupEmpty: "Ask a question to clarify the selected translation.", followupError: "The clarification could not be generated. Try again.", followupLimit: "Your request limit has been reached.", sourcePanel: "Source", outputPanel: "Result", chooseVariant: "Choose a version", pronunciationHint: "For long text, pronunciation is limited to useful words or the first sentence.", fastHint: "Shorter documents translate faster.",
  },
  ru: {
    title: "Перевести документ", intro: "Исходник остаётся слева, а перевод — справа для быстрого сравнения.", target: "Перевести на", upload: "Загрузить файл", paste: "Вставить текст", drop: "Перетащите документ сюда", release: "Отпустите, чтобы добавить документ", orChoose: "или выберите его на устройстве", choose: "Выбрать файл", allowed: "PDF, JPG, PNG, WebP, TXT, RTF, DOCX или ODT · до 10 МБ", remove: "Удалить файл", sourceLabel: "Текст для перевода", sourcePlaceholder: "Вставьте текст, который нужно перевести…", translate: "Перевести", translating: "Переводим…", result: "Перевод", sourceLanguage: "Определённый исходный язык", unknownSource: "Исходный язык не определён", copy: "Скопировать выбранный перевод", copied: "Скопировано", useUnderstand: "Использовать в «Понять документ»", useCreate: "Использовать в «Создать и изменить»", notes: "Заметки", uncertainties: "Неясные места", signIn: "Войдите, чтобы переводить документы.", legal: "Перед переводом примите условия конфиденциальности в аккаунте.", empty: "Сначала добавьте файл или вставьте текст.", invalid: "Этот файл нельзя использовать. Проверьте формат и размер.", failed: "Не удалось выполнить перевод. Попробуйте ещё раз.", timeout: "Перевод занял слишком много времени. Попробуйте более короткий документ.", limit: "Лимит запросов исчерпан. Попробуйте после его обновления.", auth: "Сессия истекла. Войдите снова.", transcription: "Произношение / транскрипция", noTranscription: "Для этого фрагмента короткая транскрипция не понадобилась.", literal: "Дословный", conversational: "Разговорный", official: "Официальный", bold: "Дерзкий", alternative: "Альтернатива", more: "Ещё варианты", moreGenerating: "Создаём варианты…", moreLimit: "Уже доступны максимум пять вариантов.", additionalPending: "Дословный перевод уже готов. Создаём разговорный, официальный и дерзкий варианты…", additionalReady: "Все варианты перевода готовы.", additionalFailed: "Первый перевод готов, но остальные варианты создать не удалось.", additionalRetry: "Повторить варианты", askTitle: "Задать вопрос по переводу", askPlaceholder: "Спросите о слове, оттенке смысла или выборе формулировки…", askSend: "Спросить ИИ", asking: "Думаем…", you: "Вы", assistant: "ИИ", followupEmpty: "Задайте вопрос, чтобы уточнить выбранный вариант.", followupError: "Не удалось получить уточнение. Попробуйте ещё раз.", followupLimit: "Лимит запросов исчерпан.", sourcePanel: "Исходник", outputPanel: "Результат", chooseVariant: "Выберите вариант", pronunciationHint: "Для длинного текста транскрипция ограничена полезными словами или первым предложением.", fastHint: "Короткие документы переводятся быстрее.",
  },
  lv: {
    title: "Iztulkot dokumentu", intro: "Avots paliek kreisajā pusē, bet tulkojumu varat salīdzināt labajā pusē.", target: "Tulko uz", upload: "Augšupielādēt failu", paste: "Ielīmēt tekstu", drop: "Ievietojiet dokumentu šeit", release: "Atlaidiet, lai pievienotu dokumentu", orChoose: "vai izvēlieties to ierīcē", choose: "Izvēlēties failu", allowed: "PDF, JPG, PNG, WebP, TXT, RTF, DOCX vai ODT · līdz 10 MB", remove: "Noņemt failu", sourceLabel: "Tulkojamais teksts", sourcePlaceholder: "Ielīmējiet tekstu, kuru vēlaties tulkot…", translate: "Tulkot", translating: "Tulkojam…", result: "Tulkojums", sourceLanguage: "Noteiktā avota valoda", unknownSource: "Avota valoda nav noteikta", copy: "Kopēt izvēlēto tulkojumu", copied: "Nokopēts", useUnderstand: "Izmantot sadaļā “Saprast dokumentu”", useCreate: "Izmantot sadaļā “Izveidot un rediģēt”", notes: "Piezīmes", uncertainties: "Neskaidras vietas", signIn: "Pierakstieties, lai tulkotu dokumentus.", legal: "Pirms tulkošanas pieņemiet privātuma noteikumus savā kontā.", empty: "Vispirms pievienojiet failu vai ielīmējiet tekstu.", invalid: "Šo failu nevar izmantot. Pārbaudiet formātu un izmēru.", failed: "Tulkojumu neizdevās pabeigt. Mēģiniet vēlreiz.", timeout: "Tulkošana aizņēma pārāk daudz laika. Izmēģiniet īsāku dokumentu.", limit: "Pieprasījumu limits ir sasniegts. Mēģiniet pēc tā atjaunošanas.", auth: "Sesija ir beigusies. Pierakstieties vēlreiz.", transcription: "Izruna / transkripcija", noTranscription: "Šim fragmentam īsa izrunas norāde nebija vajadzīga.", literal: "Burtisks", conversational: "Sarunvalodas", official: "Oficiāls", bold: "Drosmīgs", alternative: "Alternatīva", more: "Vairāk variantu", moreGenerating: "Veidojam variantus…", moreLimit: "Jau pieejami ne vairāk kā pieci varianti.", additionalPending: "Burtiskais tulkojums ir gatavs. Veidojam sarunvalodas, oficiālo un drosmīgo versiju…", additionalReady: "Visas tulkojuma versijas ir gatavas.", additionalFailed: "Pirmais tulkojums ir gatavs, bet pārējās versijas neizdevās izveidot.", additionalRetry: "Mēģināt versijas vēlreiz", askTitle: "Uzdot jautājumu par tulkojumu", askPlaceholder: "Jautājiet par vārdu, nozīmes niansi vai formulējuma izvēli…", askSend: "Jautāt AI", asking: "Domājam…", you: "Jūs", assistant: "AI", followupEmpty: "Uzdodiet jautājumu, lai precizētu izvēlēto variantu.", followupError: "Neizdevās iegūt skaidrojumu. Mēģiniet vēlreiz.", followupLimit: "Pieprasījumu limits ir sasniegts.", sourcePanel: "Avots", outputPanel: "Rezultāts", chooseVariant: "Izvēlieties variantu", pronunciationHint: "Garā tekstā transkripcija attiecas tikai uz noderīgiem vārdiem vai pirmo teikumu.", fastHint: "Īsāki dokumenti tiek tulkoti ātrāk.",
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

type FollowupExchange = { question: string; answer: TranslationFollowupAnswer };

function languageName(code: SupportedLanguage): string {
  return responseLanguageOptions.find((option) => option.code === code)?.nativeName ?? code.toUpperCase();
}

function variantLabel(style: TranslationVariant["style"], t: Copy): string {
  return style === "literal" ? t.literal : style === "conversational" ? t.conversational : style === "official" ? t.official : style === "bold" ? t.bold : t.alternative;
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
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isGeneratingAdditional, setIsGeneratingAdditional] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [additionalStatus, setAdditionalStatus] = useState<"idle" | "pending" | "loading" | "ready" | "error">("idle");
  const [additionalError, setAdditionalError] = useState("");
  const [copied, setCopied] = useState(false);
  const [question, setQuestion] = useState("");
  const [followups, setFollowups] = useState<FollowupExchange[]>([]);
  const [followupError, setFollowupError] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chooseFile = (nextFile: File | null) => {
    if (!nextFile) return;
    const validation = validateDocumentFile(nextFile);
    setResult(null);
    setFollowups([]);
    setError("");
    if (!validation.ok) {
      setFile(null);
      setFileError(t.invalid);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(nextFile);
    setFileError("");
  };

  const submitTranslation = async (challengeToken?: string, requestedMode: TranslationVariantMode = "initial") => {
    if (!account) { onRequireAccount(); return; }
    if (account.requiresLegalAcceptance) { setError(t.legal); onRequireAccount(); return; }
    if (requestedMode === "initial" && inputMode === "file" && !file) { setError(t.empty); return; }
    if (requestedMode === "initial" && inputMode === "text" && !text.trim()) { setError(t.empty); return; }
    if (requestedMode === "more" && !result) return;
    if (requestedMode === "additional" && !result) return;
    setError("");
    if (requestedMode === "initial") setResult(null);
    setIsTranslating(requestedMode === "initial");
    if (requestedMode === "additional") {
      setIsGeneratingAdditional(true);
      setAdditionalStatus("loading");
      setAdditionalError("");
    }
    setIsGeneratingMore(requestedMode === "more");
    const formData = new FormData();
    formData.set("targetLanguage", targetLanguage);
    formData.set("mode", inputMode);
    formData.set("variantMode", requestedMode);
    if (challengeToken) formData.set("turnstileToken", challengeToken);
    if (inputMode === "file") formData.set("file", file!);
    else formData.set("text", text.trim());
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 180_000);
    try {
      const token = await getAccessToken();
      if (!token) {
        if (requestedMode === "additional") { setAdditionalError(t.auth); setAdditionalStatus("error"); }
        else setError(t.auth);
        onRequireAccount();
        return;
      }
      const response = await fetch("/api/translate", { method: "POST", body: formData, headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      const payload = await response.json().catch(() => null) as { result?: unknown; error?: { code?: string } } | null;
      if (!response.ok || !payload?.result) {
        const code = payload?.error?.code;
        if (code === "captcha_required" || code === "captcha_failed" || code === "captcha_unavailable") {
          if (requestedMode === "additional") setAdditionalStatus("loading");
          onChallengeRequired?.((retryToken) => { void submitTranslation(retryToken, requestedMode); });
          return;
        }
        if (code === "user_limit_reached" || code === "service_limit_reached") {
          if (requestedMode === "additional") { setAdditionalError(t.limit); setAdditionalStatus("error"); }
          else setError(t.limit);
          return;
        }
        if (code === "authentication_required" || code === "authentication_invalid") {
          if (requestedMode === "additional") { setAdditionalError(t.auth); setAdditionalStatus("error"); }
          else setError(t.auth);
          onRequireAccount();
          return;
        }
        throw new Error(code === "timeout" ? t.timeout : t.failed);
      }
      if (!validateTranslationResult(payload.result, targetLanguage, requestedMode)) throw new Error(t.failed);
      const next = payload.result;
      if (requestedMode === "more") {
        setResult((previous) => previous ? { ...previous, variants: [...previous.variants, ...next.variants], notes: [...new Set([...previous.notes, ...next.notes])], uncertainties: [...new Set([...previous.uncertainties, ...next.uncertainties])] } : next);
      } else if (requestedMode === "additional") {
        setResult((previous) => previous ? { ...previous, variants: [...previous.variants, ...next.variants], notes: [...new Set([...previous.notes, ...next.notes])], uncertainties: [...new Set([...previous.uncertainties, ...next.uncertainties])] } : next);
        setAdditionalStatus("ready");
      } else {
        setResult(next);
        setSelectedVariantIndex(0);
        setFollowups([]);
        setAdditionalStatus("pending");
      }
    } catch (caught) {
      const message = caught instanceof Error && caught.name === "AbortError" ? t.timeout : caught instanceof Error ? caught.message : t.failed;
      if (requestedMode === "additional") {
        setAdditionalError(message);
        setAdditionalStatus("error");
      } else {
        setError(message);
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestedMode === "initial") setIsTranslating(false);
      if (requestedMode === "additional") setIsGeneratingAdditional(false);
      if (requestedMode === "more") setIsGeneratingMore(false);
    }
  };

  useEffect(() => {
    if (result && additionalStatus === "pending") void submitTranslation(undefined, "additional");
    // The pending marker is set only after the literal result is committed, so
    // the browser can paint the fast result before this background request starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, additionalStatus]);

  const selectedVariant = result?.variants[selectedVariantIndex] ?? result?.variants[0] ?? null;

  const copyTranslation = async () => {
    if (!selectedVariant) return;
    try {
      await navigator.clipboard.writeText(selectedVariant.translation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t.failed);
    }
  };

  const askFollowup = async (challengeToken?: string) => {
    if (!result || !selectedVariant || !question.trim()) { setFollowupError(t.followupEmpty); return; }
    setFollowupError("");
    setIsAsking(true);
    const context = JSON.stringify({ sourceLanguage: result.sourceLanguage, targetLanguage: result.targetLanguage, variants: result.variants, notes: result.notes, uncertainties: result.uncertainties }).slice(0, 15_500);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const token = await getAccessToken();
      if (!token) { setFollowupError(t.auth); onRequireAccount(); return; }
      const response = await fetch("/api/translate/followup", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ targetLanguage, question: question.trim(), context, selectedVariant: selectedVariant.translation, turnstileToken: challengeToken ?? null }), signal: controller.signal });
      const payload = await response.json().catch(() => null) as { answer?: unknown; error?: { code?: string } } | null;
      if (!response.ok || !payload?.answer) {
        const code = payload?.error?.code;
        if (code === "captcha_required" || code === "captcha_failed" || code === "captcha_unavailable") {
          onChallengeRequired?.((retryToken) => { void askFollowup(retryToken); });
          return;
        }
        if (code === "user_limit_reached" || code === "service_limit_reached") { setFollowupError(t.followupLimit); return; }
        throw new Error(code === "timeout" ? t.timeout : t.followupError);
      }
      if (!validateTranslationFollowup(payload.answer)) throw new Error(t.followupError);
      setFollowups((previous) => [...previous.slice(-7), { question: question.trim(), answer: payload.answer! }]);
      setQuestion("");
    } catch (caught) {
      setFollowupError(caught instanceof Error && caught.name === "AbortError" ? t.timeout : caught instanceof Error ? caught.message : t.followupError);
    } finally {
      window.clearTimeout(timeout);
      setIsAsking(false);
    }
  };

  const renderSource = () => <aside className="translation-source-card" aria-labelledby="translation-source-title">
    <div className="translation-card-heading"><div><p className="eyebrow">{t.sourcePanel}</p><h2 id="translation-source-title">{t.sourceLabel}</h2></div><span className="translation-speed-hint">{t.fastHint}</span></div>
    <div className="source-tabs" role="tablist" aria-label={t.title}>
      <button type="button" role="tab" aria-selected={inputMode === "file"} className={inputMode === "file" ? "active" : ""} onClick={() => { setInputMode("file"); setError(""); }} disabled={isTranslating || isGeneratingMore || isGeneratingAdditional}>{t.upload}</button>
      <button type="button" role="tab" aria-selected={inputMode === "text"} className={inputMode === "text" ? "active" : ""} onClick={() => { setInputMode("text"); setError(""); }} disabled={isTranslating || isGeneratingMore || isGeneratingAdditional}>{t.paste}</button>
    </div>
    {inputMode === "file" ? <div role="tabpanel">
      <input ref={fileInputRef} className="visually-hidden" type="file" aria-label={t.choose} accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,application/rtf,text/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,.pdf,.jpg,.jpeg,.png,.webp,.txt,.rtf,.docx,.odt" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0] ?? null)} disabled={isTranslating || isGeneratingMore || isGeneratingAdditional} />
      {file ? <div className="translation-file-preview file-preview"><div className="file-preview-header"><div><strong>{file.name}</strong><small>{formatFileSize(file.size, targetLanguage)}</small></div><button type="button" className="secondary-button" onClick={() => { setFile(null); setResult(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} disabled={isTranslating || isGeneratingMore || isGeneratingAdditional}>{t.remove}</button></div></div> : <div className={`dropzone${isDragging ? " is-dragging" : ""}${fileError ? " has-error" : ""}`} onDragEnter={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false); }} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); chooseFile(event.dataTransfer.files?.[0] ?? null); }}>
        <div className="document-icon" aria-hidden="true"><span>↔</span></div><strong>{isDragging ? t.release : t.drop}</strong><p>{t.orChoose}</p><button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={isTranslating || isGeneratingMore || isGeneratingAdditional}>{t.choose}</button><small>{t.allowed}</small>
      </div>}
      {fileError && <p className="input-error" role="alert">{fileError}</p>}
    </div> : <div className="text-panel" role="tabpanel"><label htmlFor="translation-text">{t.sourceLabel}</label><textarea id="translation-text" value={text} onChange={(event) => { setText(event.target.value); setError(""); setResult(null); setFollowups([]); }} maxLength={50_000} rows={12} placeholder={t.sourcePlaceholder} disabled={isTranslating || isGeneratingMore || isGeneratingAdditional} /><small>{text.length.toLocaleString(locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-US")} / 50 000</small></div>}
    <button className="primary-button translation-submit" type="button" onClick={() => void submitTranslation()} disabled={isTranslating || isGeneratingMore || isGeneratingAdditional}>{isTranslating ? t.translating : t.translate}<span aria-hidden="true">→</span></button>
    {error && <p className="input-error analysis-error" role="alert">{error}</p>}
  </aside>;

  return <section className="translation-shell" aria-labelledby="translation-title">
    <header className="translation-header"><div><p className="eyebrow">WhatNow?</p><h1 id="translation-title">{t.title}</h1><p>{t.intro}</p></div><label className="translation-language-control"><span>{t.target}</span><select value={targetLanguage} onChange={(event) => { setTargetLanguage(event.target.value as SupportedLanguage); setResult(null); setFollowups([]); }} disabled={isTranslating || isGeneratingMore || isGeneratingAdditional}>{responseLanguageOptions.map((option) => <option key={option.code} value={option.code}>{option.nativeName} · {option.englishName}</option>)}</select></label></header>
    <div className="translation-workspace-grid">
      {renderSource()}
      <main className="translation-output-column" aria-live="polite">
        {!result ? <div className="translation-empty-state"><span aria-hidden="true">↔</span><p>{t.outputPanel}</p><small>{t.chooseVariant}</small></div> : <section className="translation-result" id="translation-result" aria-labelledby="translation-result-title">
          <div className="translation-result-heading"><div><p className="eyebrow">{t.outputPanel}</p><h2 id="translation-result-title">{result.sourceLanguage === "unknown" ? t.unknownSource : languageName(result.sourceLanguage)} → {languageName(result.targetLanguage)}</h2></div><span className="translation-variant-count">{result.variants.length}/5</span></div>
          {additionalStatus === "loading" || additionalStatus === "pending" ? <p className="translation-background-status" role="status"><span className="loading-spinner" aria-hidden="true" />{t.additionalPending}</p> : additionalStatus === "ready" ? <p className="translation-background-status is-ready" role="status">✓ {t.additionalReady}</p> : additionalStatus === "error" ? <div className="translation-background-status is-error" role="status"><span>{t.additionalFailed}</span><button type="button" className="secondary-button" onClick={() => void submitTranslation(undefined, "additional")} disabled={isGeneratingAdditional || isTranslating || isGeneratingMore}>{isGeneratingAdditional ? t.moreGenerating : t.additionalRetry}</button></div> : null}
          <div className="translation-variant-tabs" role="tablist" aria-label={t.chooseVariant}>{result.variants.map((variant, index) => <button key={`${variant.style}-${index}`} type="button" role="tab" aria-selected={index === selectedVariantIndex} className={index === selectedVariantIndex ? "active" : ""} onClick={() => setSelectedVariantIndex(index)}>{variantLabel(variant.style, t)}</button>)}</div>
          {selectedVariant && <article className="translation-selected-variant"><div className="translation-variant-heading"><h3>{variantLabel(selectedVariant.style, t)}</h3><button type="button" className="secondary-button" onClick={() => void copyTranslation()}>{copied ? t.copied : t.copy}</button></div><textarea className="translation-output" readOnly value={selectedVariant.translation} aria-label={`${t.result}: ${variantLabel(selectedVariant.style, t)}`} />{selectedVariant.transcription ? <div className="translation-transcription"><strong>{t.transcription}</strong><p>{selectedVariant.transcription}</p><small>{t.pronunciationHint}</small></div> : <p className="translation-no-transcription">{t.noTranscription}</p>}</article>}
          <div className="translation-actions"><button type="button" className="secondary-button" onClick={() => onUseInUnderstand(selectedVariant?.translation ?? result.translation)}>{t.useUnderstand}</button><button type="button" className="secondary-button" onClick={() => onUseInCreate(selectedVariant?.translation ?? result.translation)}>{t.useCreate}</button>{result.variants.length < 5 && <button type="button" className="secondary-button" onClick={() => void submitTranslation(undefined, "more")} disabled={isGeneratingMore || isTranslating || isGeneratingAdditional}>{isGeneratingMore ? t.moreGenerating : t.more}</button>}</div>
          {(result.notes.length > 0 || result.uncertainties.length > 0) && <div className="translation-notes">{result.notes.length > 0 && <div><h3>{t.notes}</h3><ul>{result.notes.map((note, index) => <li key={`note-${index}`}>{note}</li>)}</ul></div>}{result.uncertainties.length > 0 && <div><h3>{t.uncertainties}</h3><ul>{result.uncertainties.map((note, index) => <li key={`uncertainty-${index}`}>{note}</li>)}</ul></div>}</div>}
          <section className="translation-followup" aria-labelledby="translation-followup-title"><div className="translation-card-heading"><div><p className="eyebrow">{t.assistant}</p><h3 id="translation-followup-title">{t.askTitle}</h3></div></div>{followups.length === 0 && <p className="translation-followup-empty">{t.followupEmpty}</p>}{followups.map((exchange, index) => <article className="translation-followup-exchange" key={`${exchange.question}-${index}`}><div><strong>{t.you}</strong><p>{exchange.question}</p></div><div><strong>{t.assistant}</strong><p>{exchange.answer.answer}</p>{exchange.answer.transcription && <small>{t.transcription}: {exchange.answer.transcription}</small>}{exchange.answer.uncertain && <small className="translation-followup-uncertain">{t.uncertainties}</small>}</div></article>)}<div className="translation-followup-input"><textarea value={question} onChange={(event) => { setQuestion(event.target.value); setFollowupError(""); }} rows={2} maxLength={1_200} placeholder={t.askPlaceholder} disabled={isAsking} /><button type="button" className="primary-button" onClick={() => void askFollowup()} disabled={isAsking || question.trim().length < 2}>{isAsking ? t.asking : t.askSend}<span aria-hidden="true">↑</span></button></div>{followupError && <p className="input-error" role="alert">{followupError}</p>}</section>
        </section>}
      </main>
    </div>
  </section>;
}
