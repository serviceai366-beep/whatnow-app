"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { guideFor, guideText, requiredRegionFor, type StudioGuideLocale } from "./document-studio-guides";
import { studioCountries, type GeneratedDocument, type StudioMode } from "./document-studio-schema";
import type { ProfileLanguage } from "./profile-types";
import { getAccessToken, type SupabaseAccount } from "./supabase-auth";

type Readiness = "green" | "yellow" | "red";
type Saved = { id: string; createdAt: number; result: GeneratedDocument };
type Quota = { planCode: "free" | "pro"; remaining: number; dailyUsed: number; dailyLimit: number; monthlyUsed: number; monthlyLimit: number };
type AssistantMessage = { role: "user" | "assistant"; text: string };

const text = {
  en: {
    live: "Secure AI workspace", title: "Create & edit documents", subtitle: "A guided workspace for near-final, jurisdiction-aware documents.",
    create: "Create new", improve: "Improve existing", review: "Review & check", templates: "Choose a starting point", details: "Complete the guided brief",
    country: "Country or legal jurisdiction", countryHint: "Required. The AI uses this location when checking official rules.", region: "Region / state / province", regionRequired: "Required for this country because rules may differ locally.", regionOptional: "Add it whenever local or state rules may apply.", language: "Document language",
    goal: "What should the AI change, check, or explain?", goalHint: "Be specific: name the clauses, risks, tone, missing information, or desired result.", existing: "Paste the existing document", existingHint: "Paste the complete text, or attach the original file below.",
    readiness: "Brief completeness", green: "Ready for a strong draft", yellow: "Useful, but more detail is recommended", red: "Critical facts are still missing", critical: "Required before a reliable result", helpful: "Helpful for a more complete document",
    generate: "Create near-final document", generating: "Creating your document…", signin: "Sign in to continue", stop: "Stop generation", stopped: "Generation stopped. Your answers are still here.", warning: "Review the missing information", warningBody: "The AI can continue with visible placeholders, but the result will need more manual checking.", add: "Add information", continue: "Continue with placeholders",
    back: "Back to details", draft: "Working document", copy: "Copy", docx: "DOCX", pdf: "PDF", history: "Recent documents", historyButton: "Document history", empty: "Your latest 10 generated documents will appear here.", limit: "Usage", delete: "Delete", sources: "Official sources consulted", issues: "Check before use", error: "The document could not be generated. Try again.",
    disclaimer: "AI-generated document for informational purposes only. Completeness, legal validity, enforceability, and suitability are not guaranteed. Verify all facts and local rules before signing, sending, filing, or relying on it.",
    proTitle: "Document Studio", proBody: "Create, review, and edit documents with guided AI assistance.", proButton: "View plan", proBadge: "BETA", loadingPlan: "Checking your plan…", planError: "We could not load your workspace. Please try again.", retryPlan: "Try again",
    assistantTitle: "Preparation assistant", assistantIntro: "Ask what information is missing, why a detail matters, or how to answer a question before generation.", assistantPlaceholder: "Ask about this document brief…", ask: "Ask", suggested: "Suggested questions", suggestion1: "What important information is still missing?", suggestion2: "Which answers matter most in my jurisdiction?", suggestion3: "Explain the questions in simpler words.",
    selected: "Selected passage", clearSelection: "Clear", documentAssistant: "Work with AI", documentAssistantIntro: "Select a passage or tap a highlighted uncertainty. Ask why it is needed or request an exact change.", editPlaceholder: "Ask a question or describe the change…", send: "Send", expand: "Expand", collapse: "Exit full screen", uncertain: "Needs clarification", missingInfo: "Missing information", confidence: "AI confidence", lowConfidence: "Low confidence — review the highlighted passages before use.", noIssues: "No unresolved passages were identified, but important documents still need review.",
    upload: "Or attach the existing document", chooseFile: "Choose document", removeFile: "Remove", fileHint: "PDF, image, TXT, RTF, DOCX, or ODT. Maximum size depends on format.", reasoningTime: "Reasoning time", reasoningEstimate: "Usually about 2–3 minutes, with a 3-minute maximum.",
    lease: "Residential lease", service: "Service agreement", nda: "Non-disclosure agreement", loan: "Loan agreement", power: "Power of attorney", complaint: "Formal complaint", request: "Official request", termination: "Termination notice", letter: "Formal letter", proposal: "Commercial proposal", sow: "Statement of work", minutes: "Meeting minutes", cv: "Cover letter", birthday: "Birthday invitation", wedding: "Wedding invitation", event: "Event invitation", thanks: "Thank-you letter", custom: "Custom document",
  },
  ru: {
    live: "Защищённая AI-мастерская", title: "Создание и редактирование", subtitle: "Пошаговая Pro-мастерская для почти готовых документов с учётом юрисдикции.",
    create: "Создать новый", improve: "Улучшить готовый", review: "Проверить документ", templates: "Выберите основу", details: "Заполните понятную анкету",
    country: "Страна или юрисдикция", countryHint: "Обязательно. ИИ использует это место при проверке официальных правил.", region: "Регион / штат / провинция", regionRequired: "Обязательно для этой страны: местные правила могут отличаться.", regionOptional: "Добавьте, если могут применяться региональные или местные правила.", language: "Язык документа",
    goal: "Что ИИ должен изменить, проверить или объяснить?", goalHint: "Укажите пункты, риски, тон, недостающие сведения или желаемый результат.", existing: "Вставьте готовый документ", existingHint: "Вставьте полный текст или прикрепите исходный файл ниже.",
    readiness: "Полнота задания", green: "Данных достаточно для сильного документа", yellow: "Можно продолжать, но детали улучшат результат", red: "Критически важных фактов не хватает", critical: "Нужно для надёжного результата", helpful: "Поможет сделать документ более полным",
    generate: "Создать почти готовый документ", generating: "Создаём документ…", signin: "Войдите, чтобы продолжить", stop: "Остановить создание", stopped: "Создание остановлено. Все ваши ответы сохранены на экране.", warning: "Проверьте недостающую информацию", warningBody: "ИИ может продолжить с заметными заполнителями, но такой результат потребует дополнительной ручной проверки.", add: "Добавить данные", continue: "Продолжить с заполнителями",
    back: "Вернуться к данным", draft: "Рабочий документ", copy: "Копировать", docx: "DOCX", pdf: "PDF", history: "Последние документы", historyButton: "История документов", empty: "Здесь будут последние 10 созданных документов.", limit: "Использование", delete: "Удалить", sources: "Проверенные официальные источники", issues: "Проверить перед использованием", error: "Не удалось создать документ. Попробуйте снова.",
    disclaimer: "Документ создан ИИ только в информационных целях. Полнота, юридическая сила, исполнимость и пригодность не гарантируются. Проверьте факты и местные правила до подписания, отправки или подачи.",
    proTitle: "Мастерская документов", proBody: "Создавайте, проверяйте и редактируйте документы с подсказками ИИ.", proButton: "Посмотреть тариф", proBadge: "БЕТА", loadingPlan: "Проверяем ваш тариф…", planError: "Не удалось загрузить мастерскую. Попробуйте ещё раз.", retryPlan: "Попробовать снова",
    assistantTitle: "Помощник по подготовке", assistantIntro: "Спросите, каких данных не хватает, зачем нужен определённый пункт или как правильно ответить ещё до создания документа.", assistantPlaceholder: "Задайте вопрос об этой анкете…", ask: "Спросить", suggested: "Готовые вопросы", suggestion1: "Какой важной информации всё ещё не хватает?", suggestion2: "Какие ответы особенно важны в моей юрисдикции?", suggestion3: "Объясни эти вопросы простыми словами.",
    selected: "Выбранный фрагмент", clearSelection: "Убрать", documentAssistant: "Работа с ИИ", documentAssistantIntro: "Выделите фрагмент или нажмите на подсвеченное место. Спросите, зачем оно нужно, или попросите точно изменить его.", editPlaceholder: "Задайте вопрос или опишите изменение…", send: "Отправить", expand: "Развернуть", collapse: "Свернуть", uncertain: "Нужно уточнить", missingInfo: "Не хватает данных", confidence: "Уверенность ИИ", lowConfidence: "Низкая уверенность — проверьте подсвеченные места перед использованием.", noIssues: "Неясные фрагменты не найдены, но важный документ всё равно нужно проверить.",
    upload: "Или прикрепите готовый документ", chooseFile: "Выбрать документ", removeFile: "Удалить", fileHint: "PDF, изображение, TXT, RTF, DOCX или ODT. Максимальный размер зависит от формата.", reasoningTime: "Время рассуждения", reasoningEstimate: "Обычно около 2–3 минут, максимум — 3 минуты.",
    lease: "Договор аренды жилья", service: "Договор услуг", nda: "Соглашение о конфиденциальности", loan: "Договор займа", power: "Доверенность", complaint: "Официальная жалоба", request: "Официальное заявление", termination: "Уведомление о расторжении", letter: "Деловое письмо", proposal: "Коммерческое предложение", sow: "Техническое задание", minutes: "Протокол встречи", cv: "Сопроводительное письмо", birthday: "Приглашение на день рождения", wedding: "Приглашение на свадьбу", event: "Приглашение на мероприятие", thanks: "Благодарственное письмо", custom: "Свой документ",
  },
  lv: {
    live: "Droša AI darbnīca", title: "Izveidot un rediģēt dokumentus", subtitle: "Vadīta Pro vide gandrīz gataviem dokumentiem ar jurisdikcijas pārbaudi.",
    create: "Izveidot jaunu", improve: "Uzlabot esošo", review: "Pārskatīt dokumentu", templates: "Izvēlieties sākumpunktu", details: "Aizpildiet vadīto informāciju",
    country: "Valsts vai jurisdikcija", countryHint: "Obligāti. AI izmanto šo vietu, pārbaudot oficiālos noteikumus.", region: "Reģions / štats / province", regionRequired: "Šai valstij obligāti, jo vietējie noteikumi var atšķirties.", regionOptional: "Pievienojiet, ja var attiekties reģionāli vai vietēji noteikumi.", language: "Dokumenta valoda",
    goal: "Ko AI jāmaina, jāpārbauda vai jāizskaidro?", goalHint: "Norādiet punktus, riskus, toni, trūkstošo informāciju vai vēlamo rezultātu.", existing: "Ielīmējiet esošo dokumentu", existingHint: "Ielīmējiet pilnu tekstu vai pievienojiet sākotnējo failu.",
    readiness: "Uzdevuma pilnīgums", green: "Pietiek datu kvalitatīvam dokumentam", yellow: "Var turpināt, bet detaļas uzlabos rezultātu", red: "Trūkst kritiski svarīgu faktu", critical: "Vajadzīgs uzticamam rezultātam", helpful: "Palīdzēs izveidot pilnīgāku dokumentu",
    generate: "Izveidot gandrīz gatavu dokumentu", generating: "Veidojam dokumentu…", signin: "Pierakstieties, lai turpinātu", stop: "Apturēt izveidi", stopped: "Izveide apturēta. Jūsu atbildes palika ekrānā.", warning: "Pārbaudiet trūkstošo informāciju", warningBody: "AI var turpināt ar redzamiem vietturiem, taču rezultāts būs jāpārbauda rūpīgāk.", add: "Pievienot datus", continue: "Turpināt ar vietturiem",
    back: "Atpakaļ pie datiem", draft: "Darba dokuments", copy: "Kopēt", docx: "DOCX", pdf: "PDF", history: "Jaunākie dokumenti", historyButton: "Dokumentu vēsture", empty: "Šeit būs pēdējie 10 dokumenti.", limit: "Lietojums", delete: "Dzēst", sources: "Pārbaudītie oficiālie avoti", issues: "Pārbaudīt pirms lietošanas", error: "Dokumentu neizdevās izveidot. Mēģiniet vēlreiz.",
    disclaimer: "AI dokuments ir tikai informatīvs. Pilnība, juridiskais spēks, izpildāmība un piemērotība netiek garantēta. Pirms parakstīšanas, nosūtīšanas vai iesniegšanas pārbaudiet faktus un vietējos noteikumus.",
    proTitle: "Dokumentu darbnīca", proBody: "Veidojiet, pārbaudiet un rediģējiet dokumentus ar AI norādēm.", proButton: "Skatīt plānu", proBadge: "BETA", loadingPlan: "Pārbaudām jūsu plānu…", planError: "Neizdevās ielādēt darbnīcu. Mēģiniet vēlreiz.", retryPlan: "Mēģināt vēlreiz",
    assistantTitle: "Sagatavošanas palīgs", assistantIntro: "Jautājiet, kādas informācijas trūkst, kāpēc detaļa ir vajadzīga vai kā atbildēt pirms ģenerēšanas.", assistantPlaceholder: "Jautājiet par šo anketu…", ask: "Jautāt", suggested: "Ieteiktie jautājumi", suggestion1: "Kādas svarīgas informācijas vēl trūkst?", suggestion2: "Kuras atbildes ir īpaši svarīgas manā jurisdikcijā?", suggestion3: "Izskaidro jautājumus vienkāršāk.",
    selected: "Izvēlētais fragments", clearSelection: "Notīrīt", documentAssistant: "Darbs ar AI", documentAssistantIntro: "Iezīmējiet fragmentu vai pieskarieties izceltai neskaidrībai. Jautājiet, kāpēc tā vajadzīga, vai lūdziet konkrētu labojumu.", editPlaceholder: "Uzdodiet jautājumu vai aprakstiet izmaiņu…", send: "Sūtīt", expand: "Izvērst", collapse: "Sakļaut", uncertain: "Jāprecizē", missingInfo: "Trūkst informācijas", confidence: "AI pārliecība", lowConfidence: "Zema pārliecība — pārbaudiet izceltās vietas.", noIssues: "Neatrisināti fragmenti nav atrasti, taču svarīgs dokuments joprojām jāpārbauda.",
    upload: "Vai pievienojiet esošo dokumentu", chooseFile: "Izvēlēties dokumentu", removeFile: "Noņemt", fileHint: "PDF, attēls, TXT, RTF, DOCX vai ODT. Maksimālais izmērs atkarīgs no formāta.", reasoningTime: "Spriešanas laiks", reasoningEstimate: "Parasti ap 2–3 minūtēm, maksimums 3 minūtes.",
    lease: "Dzīvojamās telpas īres līgums", service: "Pakalpojumu līgums", nda: "Konfidencialitātes līgums", loan: "Aizdevuma līgums", power: "Pilnvara", complaint: "Oficiāla sūdzība", request: "Oficiāls iesniegums", termination: "Uzteikuma paziņojums", letter: "Oficiāla vēstule", proposal: "Komerciāls piedāvājums", sow: "Darba uzdevums", minutes: "Sanāksmes protokols", cv: "Motivācijas vēstule", birthday: "Dzimšanas dienas ielūgums", wedding: "Kāzu ielūgums", event: "Pasākuma ielūgums", thanks: "Pateicības vēstule", custom: "Cits dokuments",
  },
} as const;

type Copy = (typeof text)["en"];
const templates = [["lease", "⌂"], ["service", "↗"], ["nda", "◎"], ["loan", "€"], ["power", "◇"], ["complaint", "!"], ["request", "→"], ["termination", "×"], ["letter", "Aa"], ["proposal", "%"], ["sow", "✓"], ["minutes", "≡"], ["cv", "✦"], ["birthday", "○"], ["wedding", "∞"], ["event", "◌"], ["thanks", "♡"], ["custom", "+"]] as const;
const languages = [{ code: "en", name: "English" }, { code: "ru", name: "Русский" }, { code: "lv", name: "Latviešu" }, { code: "de", name: "Deutsch" }, { code: "fr", name: "Français" }, { code: "es", name: "Español" }, { code: "pt", name: "Português" }, { code: "it", name: "Italiano" }, { code: "pl", name: "Polski" }, { code: "uk", name: "Українська" }, { code: "nl", name: "Nederlands" }, { code: "ro", name: "Română" }, { code: "sv", name: "Svenska" }, { code: "cs", name: "Čeština" }] as const;

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function DocumentStudioPrototype({ locale, account, onRequireAccount, onOpenPlan }: { locale: ProfileLanguage; account: SupabaseAccount | null; onRequireAccount: () => void; onOpenPlan: () => void }) {
  const copyLocale: StudioGuideLocale = locale === "ru" || locale === "lv" ? locale : "en";
  const t = text[copyLocale] as Copy;
  const [mode, setMode] = useState<StudioMode>("create");
  const [template, setTemplate] = useState("lease");
  const [country, setCountry] = useState("Latvia");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState(locale === "ru" ? "ru" : locale === "lv" ? "lv" : "en");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [warning, setWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<Saved | null>(null);
  const [history, setHistory] = useState<Saved[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [planError, setPlanError] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const generationController = useRef<AbortController | null>(null);
  const guide = useMemo(() => guideFor(template), [template]);
  const jurisdictionNeedsRegion = requiredRegionFor(country);

  const missingFields = useMemo(() => {
    const critical: { key: string; label: string }[] = [];
    const helpful: { key: string; label: string }[] = [];
    if (jurisdictionNeedsRegion && !region.trim()) critical.push({ key: "region", label: t.region });
    if (mode !== "create") {
      if (!(fields.existing?.trim() || sourceFile)) critical.push({ key: "existing", label: t.existing });
      if (!fields.goal?.trim()) critical.push({ key: "goal", label: t.goal });
    } else {
      for (const field of guide.fields) {
        if (fields[field.key]?.trim()) continue;
        (field.required ? critical : helpful).push({ key: field.key, label: guideText(field.question, copyLocale) });
      }
    }
    return { critical, helpful };
  }, [copyLocale, fields, guide.fields, jurisdictionNeedsRegion, mode, region, sourceFile, t.existing, t.goal, t.region]);
  const readiness: Readiness = missingFields.critical.length >= 3 ? "red" : missingFields.critical.length || missingFields.helpful.length > 2 ? "yellow" : "green";
  const readinessScore = readiness === "green" ? Math.max(88, 100 - missingFields.helpful.length * 3) : readiness === "yellow" ? Math.max(48, 78 - missingFields.critical.length * 10 - missingFields.helpful.length * 3) : Math.max(15, 45 - missingFields.critical.length * 6);

  const requestData = (confirmedInsufficient = false) => ({ mode, templateId: template, country, region, outputLanguage: language, details: fields, confirmedInsufficient });
  const load = async () => {
    if (!account) { setPlanLoaded(true); return; }
    const token = await getAccessToken(); if (!token) { setPlanError(true); setPlanLoaded(true); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/document-studio", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" });
      if (response.ok) {
        const data = await response.json() as { documents: Saved[]; quota: Quota };
        setHistory(data.documents); setQuota(data.quota);
      } else setPlanError(true);
    } catch { setPlanError(true); }
    finally { window.clearTimeout(timeout); setPlanLoaded(true); }
  };
  useEffect(() => { setPlanLoaded(false); setPlanError(false); setQuota(null); void load(); }, [account]);
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.min(180, Math.floor((Date.now() - started) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => () => generationController.current?.abort(), []);

  const update = (key: string, value: string) => { setFields((previous) => ({ ...previous, [key]: value })); setError(""); };
  const focusField = (key: string) => document.getElementById(`studio-field-${key}`)?.focus();
  const switchTemplate = (value: string) => { setTemplate(value); setFields({}); setAssistantMessages([]); setError(""); };
  const cancelGeneration = () => { generationController.current?.abort(); setError(t.stopped); };
  const generate = async (confirmed = false) => {
    if (!account) { onRequireAccount(); return; }
    if (!quota) return;
    if (readiness !== "green" && !confirmed) { setWarning(true); return; }
    const controller = new AbortController(); generationController.current = controller; setBusy(true); setError("");
    try {
      const token = await getAccessToken(); if (!token) throw new Error();
      const payload = requestData(confirmed);
      const body = sourceFile ? (() => { const form = new FormData(); form.append("request", JSON.stringify(payload)); form.append("file", sourceFile); return form; })() : JSON.stringify(payload);
      const response = await fetch("/api/document-studio", { method: "POST", headers: { Authorization: `Bearer ${token}`, ...(!sourceFile ? { "Content-Type": "application/json" } : {}) }, body, signal: controller.signal });
      const data = await response.json() as { document?: Saved; quota?: Quota; error?: { message?: string } };
      if (!response.ok || !data.document) throw new Error(data.error?.message);
      setCurrent(data.document); setQuota(data.quota ?? null); setHistory((previous) => [data.document!, ...previous].slice(0, 10));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error && cause.message ? cause.message : t.error);
    } finally { generationController.current = null; setBusy(false); }
  };
  const askPreparationAssistant = async (preset?: string) => {
    const question = (preset ?? assistantQuestion).trim(); if (!question || !account || !quota) return;
    setAssistantQuestion(""); setAssistantMessages((previous) => [...previous, { role: "user", text: question }]); setAssistantBusy(true); setError("");
    try {
      const token = await getAccessToken(); if (!token) throw new Error();
      const response = await fetch("/api/document-studio", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ request: requestData(false), question }) });
      const data = await response.json() as { answer?: string; error?: { message?: string } }; if (!response.ok || !data.answer) throw new Error(data.error?.message);
      setAssistantMessages((previous) => [...previous, { role: "assistant", text: data.answer! }]);
    } catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : t.error); }
    finally { setAssistantBusy(false); }
  };
  const download = async (format: "docx" | "pdf") => {
    if (!current) return;
    if (format === "pdf") {
      const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      const blob = new Blob([`<!doctype html><meta charset="utf-8"><title>${escape(current.result.title)}</title><style>body{font:12pt/1.55 system-ui;max-width:760px;margin:40px auto;white-space:pre-wrap}@media print{body{margin:0}}</style><body>${escape(current.result.plainText)}<script>onload=()=>print()<\/script>`], { type: "text/html" });
      const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); return;
    }
    const token = await getAccessToken(); if (!token) return;
    const response = await fetch(`/api/document-studio/export?id=${encodeURIComponent(current.id)}&format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) { setError(t.error); return; }
    const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = `${current.result.title}.${format}`; anchor.click(); URL.revokeObjectURL(url);
  };
  const remove = async (id: string) => {
    const token = await getAccessToken(); if (!token) return;
    const response = await fetch(`/api/document-studio?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) { setHistory((previous) => previous.filter((document) => document.id !== id)); if (current?.id === id) setCurrent(null); }
  };

  if (current) return <StudioDraft t={t} item={current} quota={quota} onBack={() => setCurrent(null)} onUpdated={(document, nextQuota) => { setCurrent(document); setQuota(nextQuota); setHistory((previous) => [document, ...previous.filter((item) => item.id !== document.id)].slice(0, 10)); }} onCopy={() => navigator.clipboard.writeText(current.result.plainText)} onDownload={download} />;

  if (!account) return <StudioGate t={t} signedIn={false} onAction={onRequireAccount} />;
  if (!planLoaded) return <section className="studio-shell"><div className="studio-plan-loading" role="status"><span className="studio-beta-badge">Beta</span><p>{t.loadingPlan}</p></div></section>;
  if (planError) return <section className="studio-shell"><div className="studio-plan-loading" role="alert"><p>{t.planError}</p><button type="button" onClick={() => { setPlanLoaded(false); setPlanError(false); void load(); }}>{t.retryPlan}</button></div></section>;
  if (!quota) return <section className="studio-shell"><div className="studio-plan-loading" role="status"><p>{t.loadingPlan}</p></div></section>;

  return <section className="studio-shell" aria-labelledby="studio-title">
    <div className="studio-heading"><div><div className="studio-heading-labels"><span className="studio-prototype-pill">{t.live}</span><span className="studio-beta-badge" title="Beta testing — some features may still change">Beta</span><span className="studio-pro-badge">{quota.planCode === "pro" ? "Pro" : "Free"}</span></div><h1 id="studio-title">{t.title}</h1><p>{t.subtitle}</p></div><div className="studio-heading-actions"><button className="studio-history-toggle" type="button" onClick={() => document.getElementById("studio-history")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t.historyButton}</button><div className={`readiness-orb ${readiness}`} aria-label={`${t.readiness}: ${readinessScore}%`}><span>{readinessScore}%</span></div></div></div>
    <div className="studio-action-switch" role="tablist">{(["create", "improve", "review"] as StudioMode[]).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} className={mode === value ? "active" : ""} onClick={() => { setMode(value); setFields({}); setSourceFile(null); setAssistantMessages([]); }}>{t[value]}</button>)}</div>
    <div className="studio-workspace">
      <aside className="template-library"><div className="template-library-heading"><h2>{t.templates}</h2></div><div className="template-grid">{templates.map(([key, icon]) => <button type="button" className={template === key ? "active" : ""} key={key} onClick={() => switchTemplate(key)}><span>{icon}</span><strong>{t[key]}</strong></button>)}</div><div className="studio-history" id="studio-history"><h3>{t.history}</h3>{quota && <p>{t.limit}: {quota.remaining} · 24h {quota.dailyUsed}/{quota.dailyLimit} · 30d {quota.monthlyUsed}/{quota.monthlyLimit}</p>}{history.length ? history.map((document) => <div key={document.id}><button type="button" onClick={() => setCurrent(document)}>{document.result.title}</button><button type="button" aria-label={t.delete} onClick={() => void remove(document.id)}>×</button></div>) : <p>{t.empty}</p>}</div></aside>
      <div className="studio-form-panel">
        <div className="studio-form-title"><span className="studio-step">2</span><div><h2>{t.details}</h2><p>{mode === "create" ? guideText(guide.intro, copyLocale) : t.goalHint}</p></div></div>
        <div className="studio-form-grid">
          <label className="span-2"><span>{t.country}</span><select value={country} onChange={(event) => setCountry(event.target.value)}>{studioCountries.map((value) => <option key={value}>{value}</option>)}</select><small>{t.countryHint}</small></label>
          <label><span>{t.region}{jurisdictionNeedsRegion ? " *" : ""}</span><input id="studio-field-region" value={region} onChange={(event) => setRegion(event.target.value)} aria-required={jurisdictionNeedsRegion} /><small>{jurisdictionNeedsRegion ? t.regionRequired : t.regionOptional}</small></label>
          <label><span>{t.language}</span><select value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map((value) => <option key={value.code} value={value.code}>{value.name}</option>)}</select></label>
          {mode === "create" ? guide.fields.map((field) => <label key={field.key} className={field.multiline ? "span-2 studio-guided-field" : "studio-guided-field"}><span>{guideText(field.question, copyLocale)}{field.required ? " *" : ""}</span>{field.multiline ? <textarea id={`studio-field-${field.key}`} rows={4} value={fields[field.key] ?? ""} onChange={(event) => update(field.key, event.target.value)} /> : <input id={`studio-field-${field.key}`} value={fields[field.key] ?? ""} onChange={(event) => update(field.key, event.target.value)} />}<small>{guideText(field.example, copyLocale)}</small></label>) : <><label className="span-2 studio-guided-field"><span>{t.goal} *</span><textarea id="studio-field-goal" rows={5} value={fields.goal ?? ""} onChange={(event) => update("goal", event.target.value)} /><small>{t.goalHint}</small></label><label className="span-2 studio-guided-field"><span>{t.existing} *</span><textarea id="studio-field-existing" rows={14} value={fields.existing ?? ""} onChange={(event) => update("existing", event.target.value)} /><small>{t.existingHint}</small></label></>}
        </div>
        {mode !== "create" && <StudioFileField t={t} file={sourceFile} onFile={(file) => { setSourceFile(file); setError(""); }} />}
        <div className="studio-preparation-assistant"><header><div><small>{t.assistantTitle}</small><p>{t.assistantIntro}</p></div><span>AI</span></header>{assistantMessages.length > 0 && <div className="studio-assistant-messages" aria-live="polite">{assistantMessages.map((message, index) => <p className={message.role} key={`${message.role}-${index}`}>{message.text}</p>)}</div>}<div className="studio-suggestion-row" aria-label={t.suggested}>{[t.suggestion1, t.suggestion2, t.suggestion3].map((suggestion) => <button type="button" key={suggestion} disabled={assistantBusy || busy} onClick={() => void askPreparationAssistant(suggestion)}>{suggestion}</button>)}</div><div className="studio-assistant-composer"><textarea rows={2} value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder={t.assistantPlaceholder} disabled={assistantBusy || busy} /><button type="button" disabled={!assistantQuestion.trim() || assistantBusy || busy} onClick={() => void askPreparationAssistant()}>{assistantBusy ? "…" : t.ask}</button></div></div>
        <div className={`studio-readiness ${readiness}`}><div className="studio-readiness-meter"><span style={{ width: `${readinessScore}%` }} /></div><div><small>{t.readiness}</small><strong>{t[readiness]}</strong>{missingFields.critical.length > 0 && <MissingList title={t.critical} items={missingFields.critical} onPick={focusField} />}{missingFields.helpful.length > 0 && <MissingList title={t.helpful} items={missingFields.helpful.slice(0, 8)} onPick={focusField} />}</div></div>
        {error && <p className="studio-api-error" role="alert">{error}</p>}
        <button className="primary-button studio-generate" disabled={busy || quota.remaining === 0} type="button" onClick={() => void generate()}>{busy ? t.generating : t.generate}<span>→</span></button>
        {busy && <div className="studio-generation-progress" role="status" aria-live="polite"><p className="studio-generation-timer"><span>{t.reasoningTime}: {formatDuration(elapsed)} / 03:00</span><small>{t.reasoningEstimate}</small></p><button type="button" onClick={cancelGeneration}>{t.stop}</button></div>}
      </div>
    </div>
    <div className="studio-legal-note"><span>i</span><p>{t.disclaimer}</p></div>
    {warning && <div className="studio-warning-backdrop"><section className="studio-warning" role="dialog" aria-modal="true"><div className={`readiness-orb ${readiness}`}><span>!</span></div><h2>{t.warning}</h2><p>{t.warningBody}</p><div className="studio-warning-summary"><MissingList title={t.critical} items={missingFields.critical} onPick={(key) => { setWarning(false); focusField(key); }} /></div><div className="studio-warning-actions"><button type="button" onClick={() => setWarning(false)}>{t.add}</button><button className="primary-button" type="button" onClick={() => { setWarning(false); void generate(true); }}>{t.continue}</button></div></section></div>}
  </section>;
}

function MissingList({ title, items, onPick }: { title: string; items: { key: string; label: string }[]; onPick: (key: string) => void }) {
  if (!items.length) return null;
  return <div className="studio-missing-list"><span>{title}</span>{items.map((item) => <button type="button" key={item.key} onClick={() => onPick(item.key)}>{item.label}<b>→</b></button>)}</div>;
}

function StudioGate({ t, signedIn, onAction }: { t: Copy; signedIn: boolean; onAction: () => void }) {
  return <section className="studio-shell studio-gate-shell"><div className="studio-pro-gate"><div className="studio-gate-orb">✦</div><span className="studio-beta-badge">Beta</span><span className="studio-pro-badge">{t.proBadge}</span><h1>{t.proTitle}</h1><p>{t.proBody}</p><ul><li>{t.assistantTitle}</li><li>{t.documentAssistant}</li><li>{t.confidence}</li></ul><button className="primary-button" type="button" onClick={onAction}>{signedIn ? t.proButton : t.signin}</button></div></section>;
}

function StudioFileField({ t, file, onFile }: { t: Copy; file: File | null; onFile: (file: File | null) => void }) {
  return <div className="studio-file-field"><span>{t.upload}</span><input key={file ? `${file.name}-${file.lastModified}` : "empty"} id="studio-document-file" className="visually-hidden" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.rtf,.docx,.odt" onChange={(event) => onFile(event.target.files?.[0] ?? null)} /><label htmlFor="studio-document-file" className="studio-file-button">{t.chooseFile}</label>{file && <div className="studio-selected-file"><strong title={file.name}>{file.name}</strong><span>{Math.max(1, Math.round(file.size / 1024))} KB</span><button type="button" onClick={() => onFile(null)}>{t.removeFile}</button></div>}<small>{t.fileHint}</small></div>;
}

function StudioDraft({ t, item, quota, onBack, onUpdated, onCopy, onDownload }: { t: Copy; item: Saved; quota: Quota | null; onBack: () => void; onUpdated: (item: Saved, quota: Quota) => void; onCopy: () => void; onDownload: (format: "docx" | "pdf") => void }) {
  const [selectedText, setSelectedText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const documentRef = useRef<HTMLDivElement>(null);
  const document = item.result;
  const annotations = document.annotations ?? [];
  const selectFromDocument = () => {
    const selection = window.getSelection(); if (!selection || !selection.rangeCount || !documentRef.current) return;
    const range = selection.getRangeAt(0); if (!documentRef.current.contains(range.commonAncestorContainer)) return;
    const value = selection.toString().trim().slice(0, 6000); if (value) setSelectedText(value);
  };
  const pickAnnotation = (excerpt: string, question: string) => { setSelectedText(excerpt); setInstruction(question); };
  const ask = async () => {
    const question = instruction.trim(); if (!question || busy) return;
    setMessages((previous) => [...previous, { role: "user", text: question }]); setInstruction(""); setBusy(true); setError("");
    try {
      const token = await getAccessToken(); if (!token) throw new Error();
      const response = await fetch("/api/document-studio", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, instruction: question, selectedText }) });
      const data = await response.json() as { message?: string; document?: Saved; quota?: Quota; error?: { message?: string } }; if (!response.ok || !data.message || !data.document || !data.quota) throw new Error(data.error?.message);
      setMessages((previous) => [...previous, { role: "assistant", text: data.message! }]); if (data.document) onUpdated(data.document, data.quota); setSelectedText("");
    } catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : t.error); }
    finally { setBusy(false); }
  };
  const paragraphAnnotation = (heading: string, paragraph: string) => annotations.find((annotation) => annotation.sectionHeading === heading && (paragraph.includes(annotation.excerpt) || annotation.excerpt.includes(paragraph.slice(0, 80)))) ?? (paragraph.includes("[TO BE COMPLETED") ? { sectionHeading: heading, excerpt: paragraph, reason: t.missingInfo, kind: "missing" as const, question: t.missingInfo } : null);
  return <div className={`studio-draft-workspace${expanded ? " assistant-expanded" : ""}`}>
    <div className="studio-draft-layout"><aside><button type="button" onClick={onBack}>← {t.back}</button><div className={`studio-confidence ${document.confidence}`}><small>{t.confidence}</small><strong>{document.confidence.toUpperCase()}</strong>{document.confidence === "low" && <p>{t.lowConfidence}</p>}</div><div><small>{t.issues}</small>{annotations.length || document.assumptions.length || document.unresolvedIssues.length ? <ul>{[...document.assumptions, ...document.unresolvedIssues.map((issue) => issue.issue)].map((value, index) => <li key={index}>{value}</li>)}</ul> : <p>{t.noIssues}</p>}</div>{document.legalSources.length > 0 && <div><small>{t.sources}</small><ul>{document.legalSources.map((source, index) => <li key={index}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></div>}{quota && <div><small>{t.limit}</small><p>{quota.remaining} · 24h {quota.dailyUsed}/{quota.dailyLimit}</p></div>}</aside>
      <article className="studio-document-paper"><div className="studio-document-toolbar"><strong>{t.draft}</strong><div><button type="button" onClick={onCopy}>{t.copy}</button><button type="button" onClick={() => onDownload("docx")}>{t.docx}</button><button type="button" onClick={() => onDownload("pdf")}>{t.pdf}</button></div></div><div ref={documentRef} onMouseUp={selectFromDocument} onTouchEnd={selectFromDocument}><p className="document-kicker">{document.country}{document.region ? ` · ${document.region}` : ""}</p><h2>{document.title}</h2>{document.sections.map((section, index) => <section key={index}><h3>{section.heading}</h3>{section.body.split("\n").filter(Boolean).map((paragraph, paragraphIndex) => { const annotation = paragraphAnnotation(section.heading, paragraph); return <div className={annotation ? `studio-annotated-line ${annotation.kind}` : "studio-document-line"} key={paragraphIndex}><p>{paragraph}</p>{annotation && <button type="button" title={annotation.reason} aria-label={`${t.uncertain}: ${annotation.reason}`} onClick={() => pickAnnotation(annotation.excerpt, annotation.question)}>?</button>}</div>; })}</section>)}</div></article>
    </div>
    <aside className="studio-document-assistant" aria-label={t.documentAssistant}><header><div><small>AI</small><h2>{t.documentAssistant}</h2></div><button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? t.collapse : t.expand}</button></header><p>{t.documentAssistantIntro}</p>{selectedText && <blockquote><span>{t.selected}</span><p>{selectedText}</p><button type="button" onClick={() => setSelectedText("")}>{t.clearSelection}</button></blockquote>}<div className="studio-assistant-messages" aria-live="polite">{messages.map((message, index) => <p className={message.role} key={`${message.role}-${index}`}>{message.text}</p>)}</div>{error && <p className="studio-api-error" role="alert">{error}</p>}<div className="studio-assistant-composer"><textarea rows={3} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={t.editPlaceholder} /><button type="button" disabled={!instruction.trim() || busy} onClick={() => void ask()}>{busy ? "…" : t.send}</button></div></aside>
  </div>;
}
