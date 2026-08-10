"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { guideFor, guideText, requiredRegionFor, type StudioGuideLocale } from "./document-studio-guides";
import { studioCountries, type GeneratedDocument, type StudioMode } from "./document-studio-schema";
import type { ProfileLanguage } from "./profile-types";
import { getAccessToken, type SupabaseAccount } from "./supabase-auth";
import { SlidingSegmentedControl } from "./sliding-segmented-control";

type Readiness = "green" | "yellow" | "red";
type Saved = { id: string; createdAt: number; result: GeneratedDocument };
type Quota = { planCode: "free" | "pro"; remaining: number; dailyUsed: number; dailyLimit: number; monthlyUsed: number; monthlyLimit: number };
type AssistantMessage = { role: "user" | "assistant"; text: string };

const text = {
  en: {
    live: "Secure AI workspace", title: "Create & edit documents", subtitle: "A guided workspace for near-final, jurisdiction-aware documents.",
    guidedMode: "Detailed", guidedModeHint: "Guided questions for a more accurate result", quickMode: "Quick", quickModeHint: "One prompt for the fastest result", workflowLabel: "Choose how to work", quickTitle: "Describe the result in one prompt", quickIntro: "Write what you want to create, change, review, or correct. You can paste the document directly into the same field.", quickPrompt: "Your request", quickPlaceholder: "Example: Create a one-year apartment lease for Riga between… Include rent, deposit, utilities, notice period, and no-pets rule.", quickAccuracy: "Quick mode may be less accurate", quickAccuracyBody: "There are no guided questions, so important details can be missed. The AI will mark missing or uncertain information instead of inventing it.", quickGenerate: "Create from this prompt", quickEditPlaceholder: "Example: Correct errors in the document below, simplify unclear clauses, and mark any missing dates or amounts.\n\nPaste the document here…",
    create: "Create new", improve: "Improve existing", review: "Check document", reviewTitle: "Full document check", reviewIntro: "Upload or paste a document for one complete check, including risks to resolve before signing.", reviewGenerate: "Run full check", reviewChecks: "We will check for blanks, dates, amounts, parties, contradictions, unusual terms, and questions for the other side.", reviewDone: "Full document check", templates: "Choose a starting point", details: "Complete the guided brief",
    country: "Country or legal jurisdiction", countryHint: "Required. The AI uses this location when checking official rules.", region: "Region / state / province", regionRequired: "Required for this country because rules may differ locally.", regionOptional: "Add it whenever local or state rules may apply.", language: "Document language",
    goal: "What should the AI change, check, or explain?", goalHint: "Be specific: name the clauses, risks, tone, missing information, or desired result.", existing: "Paste the existing document", existingHint: "Paste the complete text, or attach the original file below.",
    readiness: "Information completeness", readinessHint: "Based on the details already provided and the important facts still missing.", missingDetails: "What is still missing", missingDetailsHint: "Choose an item to jump straight to the field and complete it.", green: "Ready for a strong draft", yellow: "Useful, but more detail is recommended", red: "Critical facts are still missing", critical: "Required before a reliable result", helpful: "Helpful for a more complete document",
    generate: "Create near-final document", generating: "Creating your document…", signin: "Sign in to continue", stop: "Stop generation", stopped: "Generation stopped. Your answers are still here.", warning: "Review the missing information", warningBody: "The AI can continue with visible placeholders, but the result will need more manual checking.", add: "Add information", continue: "Continue with placeholders",
    back: "Back to details", newDocument: "New document", newDocumentConfirm: "Start a new blank document? Your saved document will stay in history.", draft: "Working document", editDocument: "Edit document", save: "Save", saving: "Saving…", saved: "Saved", unsaved: "Unsaved changes", copy: "Copy", docx: "DOCX", pdf: "PDF", history: "Recent documents", historyButton: "Document history", empty: "Your latest 10 generated documents will appear here.", limit: "Usage", delete: "Delete", sources: "Official sources consulted", issues: "Check before use", error: "The document could not be generated. Try again.",
    disclaimer: "AI-generated document for informational purposes only. Completeness, legal validity, enforceability, and suitability are not guaranteed. Verify all facts and local rules before signing, sending, filing, or relying on it.",
    proTitle: "Document Studio", proBody: "Create, review, and edit documents with guided AI assistance.", proButton: "View plan", loadingPlan: "Checking your plan…", planError: "We could not load your workspace. Please try again.", retryPlan: "Try again",
    assistantTitle: "Preparation assistant", assistantIntro: "Ask what information is missing, why a detail matters, or how to answer a question before generation.", assistantPlaceholder: "Ask about this document brief…", ask: "Ask", suggested: "Suggested questions", suggestion1: "What important information is still missing?", suggestion2: "Which answers matter most in my jurisdiction?", suggestion3: "Explain the questions in simpler words.",
    selected: "Selected passage", clearSelection: "Clear", documentAssistant: "Work with AI", documentAssistantIntro: "Select a passage or tap a highlighted uncertainty. Ask why it is needed or request an exact change.", editPlaceholder: "Ask a question or describe the change…", send: "Send", polish: "Polish layout with AI", polishPrompt: "Improve the document's professional formatting and structure. Preserve every fact and term. Use clear headings, short readable paragraphs, consistent lists, and a logical section order.", expand: "Focus", collapse: "Exit focus", uncertain: "Needs clarification", missingInfo: "Missing information", confidence: "AI confidence", lowConfidence: "Low confidence — review the highlighted passages before use.", noIssues: "No unresolved passages were identified, but important documents still need review.",
    layout: "Workspace layout", layoutHint: "Drag the six-dot handle to reorder panels. Hide, restore, or focus any panel.", insightsPanel: "Checks & guidance", documentPanel: "Document", assistantPanel: "AI assistant", hidePanel: "Hide panel", restorePanel: "Restore panel", focusPanel: "Focus panel", equalPanels: "Equal panels", resetLayout: "Reset layout", moveLeft: "Move left", moveRight: "Move right", dragPanel: "Drag to move",
    upload: "Or attach the existing document", chooseFile: "Choose document", removeFile: "Remove", fileHint: "PDF, image, TXT, RTF, DOCX, or ODT. Maximum size depends on format.", reasoningTime: "Reasoning time", reasoningEstimate: "Usually about 2–3 minutes, with a 10-minute maximum.",
    lease: "Residential lease", service: "Service agreement", nda: "Non-disclosure agreement", loan: "Loan agreement", power: "Power of attorney", complaint: "Formal complaint", request: "Official request", termination: "Termination notice", letter: "Formal letter", proposal: "Commercial proposal", sow: "Statement of work", minutes: "Meeting minutes", cv: "Cover letter", birthday: "Birthday invitation", wedding: "Wedding invitation", event: "Event invitation", thanks: "Thank-you letter", custom: "Custom document",
  },
  ru: {
    live: "Защищённая AI-мастерская", title: "Создание и редактирование", subtitle: "Пошаговая Pro-мастерская для почти готовых документов с учётом юрисдикции.",
    guidedMode: "Подробный", guidedModeHint: "Пошаговые вопросы для более точного результата", quickMode: "Быстрый", quickModeHint: "Один запрос для самого быстрого результата", workflowLabel: "Выберите способ работы", quickTitle: "Опишите результат одним запросом", quickIntro: "Напишите, что нужно создать, изменить, проверить или исправить. Сам документ можно вставить в это же поле.", quickPrompt: "Ваш запрос", quickPlaceholder: "Пример: Создай договор аренды квартиры в Риге на один год между… Укажи аренду, депозит, коммунальные услуги, срок уведомления и запрет животных.", quickAccuracy: "Быстрый режим может быть менее точным", quickAccuracyBody: "Здесь нет пошаговых вопросов, поэтому важные детали можно пропустить. ИИ отметит недостающие или неясные сведения, а не станет их придумывать.", quickGenerate: "Создать по этому запросу", quickEditPlaceholder: "Пример: Исправь ошибки в документе ниже, упрости непонятные пункты и отметь недостающие даты или суммы.\n\nВставьте документ сюда…",
    create: "Создать новый", improve: "Улучшить готовый", review: "Проверить документ", reviewTitle: "Полная проверка документа", reviewIntro: "Загрузите или вставьте документ для одной полной проверки, включая риски перед подписанием.", reviewGenerate: "Проверить документ", reviewChecks: "Проверим пустые места, даты, суммы, стороны, противоречия, необычные условия и вопросы для второй стороны.", reviewDone: "Полная проверка документа", templates: "Выберите основу", details: "Заполните понятную анкету",
    country: "Страна или юрисдикция", countryHint: "Обязательно. ИИ использует это место при проверке официальных правил.", region: "Регион / штат / провинция", regionRequired: "Обязательно для этой страны: местные правила могут отличаться.", regionOptional: "Добавьте, если могут применяться региональные или местные правила.", language: "Язык документа",
    goal: "Что ИИ должен изменить, проверить или объяснить?", goalHint: "Укажите пункты, риски, тон, недостающие сведения или желаемый результат.", existing: "Вставьте готовый документ", existingHint: "Вставьте полный текст или прикрепите исходный файл ниже.",
    readiness: "Полнота информации", readinessHint: "Показатель учитывает уже введённые данные и важные сведения, которых ещё не хватает.", missingDetails: "Чего ещё не хватает", missingDetailsHint: "Нажмите на пункт — откроется нужное поле для заполнения.", green: "Данных достаточно для сильного документа", yellow: "Можно продолжать, но детали улучшат результат", red: "Критически важных фактов не хватает", critical: "Нужно для надёжного результата", helpful: "Поможет сделать документ более полным",
    generate: "Создать почти готовый документ", generating: "Создаём документ…", signin: "Войдите, чтобы продолжить", stop: "Остановить создание", stopped: "Создание остановлено. Все ваши ответы сохранены на экране.", warning: "Проверьте недостающую информацию", warningBody: "ИИ может продолжить с заметными заполнителями, но такой результат потребует дополнительной ручной проверки.", add: "Добавить данные", continue: "Продолжить с заполнителями",
    back: "Вернуться к данным", newDocument: "Новый документ", newDocumentConfirm: "Начать новый чистый документ? Сохранённый документ останется в истории.", draft: "Рабочий документ", editDocument: "Редактировать документ", save: "Сохранить", saving: "Сохраняем…", saved: "Сохранено", unsaved: "Есть несохранённые изменения", copy: "Копировать", docx: "DOCX", pdf: "PDF", history: "Последние документы", historyButton: "История документов", empty: "Здесь будут последние 10 созданных документов.", limit: "Использование", delete: "Удалить", sources: "Проверенные официальные источники", issues: "Проверить перед использованием", error: "Не удалось создать документ. Попробуйте снова.",
    disclaimer: "Документ создан ИИ только в информационных целях. Полнота, юридическая сила, исполнимость и пригодность не гарантируются. Проверьте факты и местные правила до подписания, отправки или подачи.",
    proTitle: "Мастерская документов", proBody: "Создавайте, проверяйте и редактируйте документы с подсказками ИИ.", proButton: "Посмотреть тариф", loadingPlan: "Проверяем ваш тариф…", planError: "Не удалось загрузить мастерскую. Попробуйте ещё раз.", retryPlan: "Попробовать снова",
    assistantTitle: "Помощник по подготовке", assistantIntro: "Спросите, каких данных не хватает, зачем нужен определённый пункт или как правильно ответить ещё до создания документа.", assistantPlaceholder: "Задайте вопрос об этой анкете…", ask: "Спросить", suggested: "Готовые вопросы", suggestion1: "Какой важной информации всё ещё не хватает?", suggestion2: "Какие ответы особенно важны в моей юрисдикции?", suggestion3: "Объясни эти вопросы простыми словами.",
    selected: "Выбранный фрагмент", clearSelection: "Убрать", documentAssistant: "Работа с ИИ", documentAssistantIntro: "Выделите фрагмент или нажмите на подсвеченное место. Спросите, зачем оно нужно, или попросите точно изменить его.", editPlaceholder: "Задайте вопрос или опишите изменение…", send: "Отправить", polish: "Улучшить оформление с ИИ", polishPrompt: "Улучши профессиональное оформление и структуру документа. Сохрани все факты и условия. Сделай понятные заголовки, короткие читаемые абзацы, единообразные списки и логичный порядок разделов.", expand: "Фокус", collapse: "Выйти из фокуса", uncertain: "Нужно уточнить", missingInfo: "Не хватает данных", confidence: "Уверенность ИИ", lowConfidence: "Низкая уверенность — проверьте подсвеченные места перед использованием.", noIssues: "Неясные фрагменты не найдены, но важный документ всё равно нужно проверить.",
    layout: "Расположение окон", layoutHint: "Тяните окно за ручку из шести точек. Любое окно можно скрыть или развернуть.", insightsPanel: "Проверка и подсказки", documentPanel: "Документ", assistantPanel: "ИИ-помощник", hidePanel: "Скрыть окно", restorePanel: "Вернуть окно", focusPanel: "Развернуть окно", equalPanels: "Равные окна", resetLayout: "Вернуть исходный вид", moveLeft: "Сдвинуть влево", moveRight: "Сдвинуть вправо", dragPanel: "Перетащите, чтобы переместить",
    upload: "Или прикрепите готовый документ", chooseFile: "Выбрать документ", removeFile: "Удалить", fileHint: "PDF, изображение, TXT, RTF, DOCX или ODT. Максимальный размер зависит от формата.", reasoningTime: "Время рассуждения", reasoningEstimate: "Обычно около 2–3 минут, максимум — 10 минут.",
    lease: "Договор аренды жилья", service: "Договор услуг", nda: "Соглашение о конфиденциальности", loan: "Договор займа", power: "Доверенность", complaint: "Официальная жалоба", request: "Официальное заявление", termination: "Уведомление о расторжении", letter: "Деловое письмо", proposal: "Коммерческое предложение", sow: "Техническое задание", minutes: "Протокол встречи", cv: "Сопроводительное письмо", birthday: "Приглашение на день рождения", wedding: "Приглашение на свадьбу", event: "Приглашение на мероприятие", thanks: "Благодарственное письмо", custom: "Свой документ",
  },
  lv: {
    live: "Droša AI darbnīca", title: "Izveidot un rediģēt dokumentus", subtitle: "Vadīta Pro vide gandrīz gataviem dokumentiem ar jurisdikcijas pārbaudi.",
    guidedMode: "Detalizēti", guidedModeHint: "Vadīti jautājumi precīzākam rezultātam", quickMode: "Ātri", quickModeHint: "Viens pieprasījums ātrākajam rezultātam", workflowLabel: "Izvēlieties darba veidu", quickTitle: "Aprakstiet rezultātu vienā pieprasījumā", quickIntro: "Uzrakstiet, ko vēlaties izveidot, mainīt, pārbaudīt vai labot. Esošo dokumentu var ielīmēt tajā pašā laukā.", quickPrompt: "Jūsu pieprasījums", quickPlaceholder: "Piemērs: Izveido viena gada dzīvokļa īres līgumu Rīgā starp… Iekļauj īres maksu, depozītu, komunālos maksājumus un uzteikuma termiņu.", quickAccuracy: "Ātrais režīms var būt mazāk precīzs", quickAccuracyBody: "Nav vadītu jautājumu, tāpēc būtiska informācija var iztrūkt. AI atzīmēs trūkstošo vai neskaidro informāciju, nevis to izdomās.", quickGenerate: "Izveidot no šī pieprasījuma", quickEditPlaceholder: "Piemērs: Izlabo kļūdas zemāk esošajā dokumentā, vienkāršo neskaidros punktus un atzīmē trūkstošos datumus vai summas.\n\nIelīmējiet dokumentu šeit…",
    create: "Izveidot jaunu", improve: "Uzlabot esošo", review: "Pārbaudīt dokumentu", reviewTitle: "Pilna dokumenta pārbaude", reviewIntro: "Augšupielādējiet vai ielīmējiet dokumentu vienai pilnai pārbaudei, tostarp riskiem pirms parakstīšanas.", reviewGenerate: "Veikt pilno pārbaudi", reviewChecks: "Pārbaudīsim tukšās vietas, datumus, summas, puses, pretrunas, neparastus nosacījumus un jautājumus otrai pusei.", reviewDone: "Pilna dokumenta pārbaude", templates: "Izvēlieties sākumpunktu", details: "Aizpildiet vadīto informāciju",
    country: "Valsts vai jurisdikcija", countryHint: "Obligāti. AI izmanto šo vietu, pārbaudot oficiālos noteikumus.", region: "Reģions / štats / province", regionRequired: "Šai valstij obligāti, jo vietējie noteikumi var atšķirties.", regionOptional: "Pievienojiet, ja var attiekties reģionāli vai vietēji noteikumi.", language: "Dokumenta valoda",
    goal: "Ko AI jāmaina, jāpārbauda vai jāizskaidro?", goalHint: "Norādiet punktus, riskus, toni, trūkstošo informāciju vai vēlamo rezultātu.", existing: "Ielīmējiet esošo dokumentu", existingHint: "Ielīmējiet pilnu tekstu vai pievienojiet sākotnējo failu.",
    readiness: "Informācijas pilnīgums", readinessHint: "Rādītājs ņem vērā ievadīto informāciju un svarīgos faktus, kuru vēl trūkst.", missingDetails: "Kas vēl trūkst", missingDetailsHint: "Izvēlieties punktu, lai uzreiz pārietu uz attiecīgo lauku.", green: "Pietiek datu kvalitatīvam dokumentam", yellow: "Var turpināt, bet detaļas uzlabos rezultātu", red: "Trūkst kritiski svarīgu faktu", critical: "Vajadzīgs uzticamam rezultātam", helpful: "Palīdzēs izveidot pilnīgāku dokumentu",
    generate: "Izveidot gandrīz gatavu dokumentu", generating: "Veidojam dokumentu…", signin: "Pierakstieties, lai turpinātu", stop: "Apturēt izveidi", stopped: "Izveide apturēta. Jūsu atbildes palika ekrānā.", warning: "Pārbaudiet trūkstošo informāciju", warningBody: "AI var turpināt ar redzamiem vietturiem, taču rezultāts būs jāpārbauda rūpīgāk.", add: "Pievienot datus", continue: "Turpināt ar vietturiem",
    back: "Atpakaļ pie datiem", newDocument: "Jauns dokuments", newDocumentConfirm: "Sākt jaunu tukšu dokumentu? Saglabātais dokuments paliks vēsturē.", draft: "Darba dokuments", editDocument: "Rediģēt dokumentu", save: "Saglabāt", saving: "Saglabā…", saved: "Saglabāts", unsaved: "Nesaglabātas izmaiņas", copy: "Kopēt", docx: "DOCX", pdf: "PDF", history: "Jaunākie dokumenti", historyButton: "Dokumentu vēsture", empty: "Šeit būs pēdējie 10 dokumenti.", limit: "Lietojums", delete: "Dzēst", sources: "Pārbaudītie oficiālie avoti", issues: "Pārbaudīt pirms lietošanas", error: "Dokumentu neizdevās izveidot. Mēģiniet vēlreiz.",
    disclaimer: "AI dokuments ir tikai informatīvs. Pilnība, juridiskais spēks, izpildāmība un piemērotība netiek garantēta. Pirms parakstīšanas, nosūtīšanas vai iesniegšanas pārbaudiet faktus un vietējos noteikumus.",
    proTitle: "Dokumentu darbnīca", proBody: "Veidojiet, pārbaudiet un rediģējiet dokumentus ar AI norādēm.", proButton: "Skatīt plānu", loadingPlan: "Pārbaudām jūsu plānu…", planError: "Neizdevās ielādēt darbnīcu. Mēģiniet vēlreiz.", retryPlan: "Mēģināt vēlreiz",
    assistantTitle: "Sagatavošanas palīgs", assistantIntro: "Jautājiet, kādas informācijas trūkst, kāpēc detaļa ir vajadzīga vai kā atbildēt pirms ģenerēšanas.", assistantPlaceholder: "Jautājiet par šo anketu…", ask: "Jautāt", suggested: "Ieteiktie jautājumi", suggestion1: "Kādas svarīgas informācijas vēl trūkst?", suggestion2: "Kuras atbildes ir īpaši svarīgas manā jurisdikcijā?", suggestion3: "Izskaidro jautājumus vienkāršāk.",
    selected: "Izvēlētais fragments", clearSelection: "Notīrīt", documentAssistant: "Darbs ar AI", documentAssistantIntro: "Iezīmējiet fragmentu vai pieskarieties izceltai neskaidrībai. Jautājiet, kāpēc tā vajadzīga, vai lūdziet konkrētu labojumu.", editPlaceholder: "Uzdodiet jautājumu vai aprakstiet izmaiņu…", send: "Sūtīt", polish: "Uzlabot noformējumu ar AI", polishPrompt: "Uzlabo dokumenta profesionālo noformējumu un struktūru. Saglabā visus faktus un nosacījumus. Izmanto skaidrus virsrakstus, īsas rindkopas, vienotus sarakstus un loģisku sadaļu secību.", expand: "Fokuss", collapse: "Iziet no fokusa", uncertain: "Jāprecizē", missingInfo: "Trūkst informācijas", confidence: "AI pārliecība", lowConfidence: "Zema pārliecība — pārbaudiet izceltās vietas.", noIssues: "Neatrisināti fragmenti nav atrasti, taču svarīgs dokuments joprojām jāpārbauda.",
    layout: "Darba telpas izkārtojums", layoutHint: "Velciet paneli aiz sešu punktu roktura. Jebkuru paneli var paslēpt vai izvērst.", insightsPanel: "Pārbaudes un norādes", documentPanel: "Dokuments", assistantPanel: "AI palīgs", hidePanel: "Paslēpt paneli", restorePanel: "Atjaunot paneli", focusPanel: "Fokusēt paneli", equalPanels: "Vienādi paneļi", resetLayout: "Atjaunot izkārtojumu", moveLeft: "Pārvietot pa kreisi", moveRight: "Pārvietot pa labi", dragPanel: "Velciet, lai pārvietotu",
    upload: "Vai pievienojiet esošo dokumentu", chooseFile: "Izvēlēties dokumentu", removeFile: "Noņemt", fileHint: "PDF, attēls, TXT, RTF, DOCX vai ODT. Maksimālais izmērs atkarīgs no formāta.", reasoningTime: "Spriešanas laiks", reasoningEstimate: "Parasti ap 2–3 minūtēm, maksimums 10 minūtes.",
    lease: "Dzīvojamās telpas īres līgums", service: "Pakalpojumu līgums", nda: "Konfidencialitātes līgums", loan: "Aizdevuma līgums", power: "Pilnvara", complaint: "Oficiāla sūdzība", request: "Oficiāls iesniegums", termination: "Uzteikuma paziņojums", letter: "Oficiāla vēstule", proposal: "Komerciāls piedāvājums", sow: "Darba uzdevums", minutes: "Sanāksmes protokols", cv: "Motivācijas vēstule", birthday: "Dzimšanas dienas ielūgums", wedding: "Kāzu ielūgums", event: "Pasākuma ielūgums", thanks: "Pateicības vēstule", custom: "Cits dokuments",
  },
} as const;

type Copy = (typeof text)["en"] & { preSignChecks: string; preSignDone: string };
const templates = [["lease", "⌂"], ["service", "↗"], ["nda", "◎"], ["loan", "€"], ["power", "◇"], ["complaint", "!"], ["request", "→"], ["termination", "×"], ["letter", "Aa"], ["proposal", "%"], ["sow", "✓"], ["minutes", "≡"], ["cv", "✦"], ["birthday", "○"], ["wedding", "∞"], ["event", "◌"], ["thanks", "♡"], ["custom", "+"]] as const;
const languages = [{ code: "en", name: "English" }, { code: "ru", name: "Русский" }, { code: "lv", name: "Latviešu" }, { code: "de", name: "Deutsch" }, { code: "fr", name: "Français" }, { code: "es", name: "Español" }, { code: "pt", name: "Português" }, { code: "it", name: "Italiano" }, { code: "pl", name: "Polski" }, { code: "uk", name: "Українська" }, { code: "nl", name: "Nederlands" }, { code: "ro", name: "Română" }, { code: "sv", name: "Svenska" }, { code: "cs", name: "Čeština" }] as const;

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

const editorColors = {
  accent: "#0b746c",
  red: "#a63232",
  blue: "#245aa8",
  gray: "#5d6966",
} as const;

const editorHighlights = {
  yellow: "#fff0a6",
  red: "#ffd7d7",
  green: "#d8f3df",
} as const;

function escapeEditorText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function initialEditorHtml(document: GeneratedDocument) {
  if (document.editorHtml) return document.editorHtml;
  return `<h1>${escapeEditorText(document.title)}</h1>${document.sections.map((section) => `<h2>${escapeEditorText(section.heading)}</h2>${section.body.split("\n").filter(Boolean).map((paragraph) => `<p>${escapeEditorText(paragraph)}</p>`).join("")}`).join("")}`;
}

function normalizedEditorHtml(root: HTMLElement) {
  const visit = (node: ChildNode): string => {
    if (node.nodeType === 3) return escapeEditorText(node.textContent ?? "");
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "br") return "<br>";
    const children = Array.from(node.childNodes).map(visit).join("");
    const aliases: Record<string, string> = { b: "strong", i: "em", div: "p" };
    const normalizedTag = aliases[tag] ?? tag;
    if (["p", "h1", "h2", "h3", "ul", "ol", "li", "strong", "em", "u"].includes(normalizedTag)) return `<${normalizedTag}>${children}</${normalizedTag}>`;
    if (tag === "span" && /^editor-(?:color-(?:accent|red|blue|gray)|highlight-(?:yellow|red|green)|size-(?:small|large|xlarge))$/.test(node.className)) return `<span class="${node.className}">${children}</span>`;
    if (tag === "span" && node.style.backgroundColor) {
      const raw = node.style.backgroundColor.replaceAll(" ", "").toLowerCase();
      const key = raw.includes("255,215,215") || raw === editorHighlights.red ? "red" : raw.includes("216,243,223") || raw === editorHighlights.green ? "green" : "yellow";
      return `<span class="editor-highlight-${key}">${children}</span>`;
    }
    if (tag === "font") {
      const raw = (node.getAttribute("color") ?? "").toLowerCase();
      const size = node.getAttribute("size");
      let output = children;
      if (raw) {
        const color = (Object.entries(editorColors).find(([, value]) => value === raw)?.[0] ?? "accent") as keyof typeof editorColors;
        output = `<span class="editor-color-${color}">${output}</span>`;
      }
      if (size) output = `<span class="editor-size-${Number(size) <= 2 ? "small" : Number(size) >= 5 ? "xlarge" : "large"}">${output}</span>`;
      return output;
    }
    return children;
  };
  return Array.from(root.childNodes).map(visit).join("");
}

function editorPayload(root: HTMLElement, original: GeneratedDocument) {
  const html = normalizedEditorHtml(root);
  const template = window.document.createElement("template");
  template.innerHTML = html;
  let title = original.title;
  let activeHeading = "Document";
  const sectionBodies = new Map<string, string[]>();
  const blocks = Array.from(template.content.querySelectorAll("h1,h2,h3,p,li"));
  for (const block of blocks) {
    const value = block.textContent?.trim();
    if (!value) continue;
    if (block.tagName === "H1") { title = value.slice(0, 300); continue; }
    if (block.tagName === "H2" || block.tagName === "H3") { activeHeading = value.slice(0, 500); if (!sectionBodies.has(activeHeading)) sectionBodies.set(activeHeading, []); continue; }
    if (!sectionBodies.has(activeHeading)) sectionBodies.set(activeHeading, []);
    sectionBodies.get(activeHeading)!.push(block.tagName === "LI" ? `• ${value}` : value);
  }
  const sections = Array.from(sectionBodies, ([heading, body]) => ({ heading, body: body.join("\n") })).filter((section) => section.body.trim());
  if (!sections.length) sections.push({ heading: original.sections[0]?.heading || "Document", body: root.innerText.trim() || original.plainText });
  const plainText = [title, ...sections.flatMap((section) => [section.heading, section.body])].join("\n\n").trim();
  return { title, sections, plainText, editorHtml: html };
}

export function DocumentStudioPrototype({ locale, account, initialPrompt = "", onRequireAccount }: { locale: ProfileLanguage; account: SupabaseAccount | null; initialPrompt?: string; onRequireAccount: () => void }) {
  const copyLocale: StudioGuideLocale = locale === "ru" || locale === "lv" ? locale : "en";
  const t = { ...text[copyLocale], preSignChecks: text[copyLocale].reviewChecks, preSignDone: text[copyLocale].reviewDone } as Copy;
  const [workflow, setWorkflow] = useState<"guided" | "quick">("guided");
  const [mode, setMode] = useState<StudioMode>("create");
  const preSignatureCheck = mode === "review";
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
  const [quickPrompt, setQuickPrompt] = useState("");
  const generationController = useRef<AbortController | null>(null);
  const guide = useMemo(() => guideFor(template), [template]);
  const jurisdictionNeedsRegion = requiredRegionFor(country);

  /* eslint-disable react-hooks/set-state-in-effect -- a prompt supplied by the parent intentionally starts quick mode. */
  useEffect(() => {
    if (!initialPrompt.trim()) return;
    setCurrent(null);
    setWorkflow("quick");
    setMode("create");
    setQuickPrompt(initialPrompt);
    setError("");
  }, [initialPrompt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const missingFields = useMemo(() => {
    const critical: { key: string; label: string }[] = [];
    const helpful: { key: string; label: string }[] = [];
    if (jurisdictionNeedsRegion && !region.trim()) critical.push({ key: "region", label: t.region });
    if (workflow === "quick") {
      if (quickPrompt.trim().length < 20) critical.push({ key: "prompt", label: t.quickPrompt });
      else if (quickPrompt.trim().length < 100) helpful.push({ key: "prompt", label: t.quickAccuracy });
      if (mode !== "create" && !sourceFile && !quickPrompt.trim()) helpful.push({ key: "prompt", label: t.existing });
      return { critical, helpful };
    }
    if (mode !== "create") {
      if (!(fields.existing?.trim() || sourceFile)) critical.push({ key: "existing", label: t.existing });
      if (!preSignatureCheck && !fields.goal?.trim()) critical.push({ key: "goal", label: t.goal });
    } else {
      for (const field of guide.fields) {
        if (fields[field.key]?.trim()) continue;
        (field.required ? critical : helpful).push({ key: field.key, label: guideText(field.question, copyLocale) });
      }
    }
    return { critical, helpful };
  }, [copyLocale, fields, guide.fields, jurisdictionNeedsRegion, mode, preSignatureCheck, quickPrompt, region, sourceFile, t.existing, t.goal, t.quickAccuracy, t.quickPrompt, t.region, workflow]);
  const readiness: Readiness = missingFields.critical.length >= 3 ? "red" : missingFields.critical.length || missingFields.helpful.length > 2 ? "yellow" : "green";
  const readinessScore = readiness === "green" ? Math.max(88, 100 - missingFields.helpful.length * 3) : readiness === "yellow" ? Math.max(48, 78 - missingFields.critical.length * 10 - missingFields.helpful.length * 3) : Math.max(15, 45 - missingFields.critical.length * 6);

  const requestData = (confirmedInsufficient = false) => ({
    mode,
    workflow,
    templateId: workflow === "quick" ? "custom" : template,
    country,
    region,
    outputLanguage: language,
    details: workflow === "quick" ? { prompt: quickPrompt } : fields,
    confirmedInsufficient,
    preSignatureCheck: mode === "review",
  });
  const load = useCallback(async () => {
    setPlanLoaded(false); setPlanError(false); setQuota(null);
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
  }, [account]);
  // Loading account-scoped quota/history is an intentional external synchronization.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.min(600, Math.floor((Date.now() - started) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => () => generationController.current?.abort(), []);

  const update = (key: string, value: string) => { setFields((previous) => ({ ...previous, [key]: value })); setError(""); };
  const focusField = (key: string) => {
    const field = document.getElementById(key === "prompt" ? "studio-quick-prompt" : `studio-field-${key}`) as HTMLElement | null;
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.requestAnimationFrame(() => field?.focus());
  };
  const switchTemplate = (value: string) => { setTemplate(value); setFields({}); setAssistantMessages([]); setError(""); };
  const startNewDocument = () => {
    setCurrent(null);
    setWorkflow("guided");
    setMode("create");
    setTemplate("lease");
    setRegion("");
    setFields({});
    setSourceFile(null);
    setQuickPrompt("");
    setAssistantQuestion("");
    setAssistantMessages([]);
    setWarning(false);
    setError("");
  };
  const cancelGeneration = () => { generationController.current?.abort(); setError(t.stopped); };
  const generate = async (confirmed = false) => {
    if (!account) { onRequireAccount(); return; }
    if (!quota) return;
    if (readiness !== "green" && !confirmed) { setWarning(true); return; }
    const controller = new AbortController(); generationController.current = controller; setElapsed(0); setBusy(true); setError("");
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
  const download = async (saved: Saved, format: "docx" | "pdf") => {
    if (format === "pdf") {
      const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      const content = saved.result.editorHtml ?? `<p>${escape(saved.result.plainText).replaceAll("\n", "<br>")}</p>`;
      const blob = new Blob([`<!doctype html><meta charset="utf-8"><title>${escape(saved.result.title)}</title><style>body{font:12pt/1.55 system-ui;color:#182321;max-width:760px;margin:40px auto}h1{font-size:26pt;line-height:1.15}h2{font-size:19pt;margin-top:1.3em}h3{font-size:15pt;margin-top:1.15em}.editor-color-accent{color:#087d72}.editor-color-red{color:#b02a37}.editor-color-blue{color:#245fa8}.editor-color-gray{color:#6b7774}@media print{body{margin:0}h1,h2,h3{break-after:avoid}}</style><body>${content}<script>onload=()=>print()<\/script>`], { type: "text/html" });
      const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); return;
    }
    const token = await getAccessToken(); if (!token) return;
    const response = await fetch(`/api/document-studio/export?id=${encodeURIComponent(saved.id)}&format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) { setError(t.error); return; }
    const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = `${saved.result.title}.${format}`; anchor.click(); URL.revokeObjectURL(url);
  };
  const remove = async (id: string) => {
    const token = await getAccessToken(); if (!token) return;
    const response = await fetch(`/api/document-studio?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) { setHistory((previous) => previous.filter((document) => document.id !== id)); if (current?.id === id) setCurrent(null); }
  };

  if (current) return <StudioDraft locale={copyLocale} t={t} item={current} quota={quota} onBack={() => setCurrent(null)} onNew={startNewDocument} onUpdated={(document, nextQuota) => { setCurrent(document); setQuota(nextQuota); setHistory((previous) => [document, ...previous.filter((item) => item.id !== document.id)].slice(0, 10)); }} onDownload={download} />;

  if (!account) return <StudioGate t={t} signedIn={false} onAction={onRequireAccount} />;
  if (!planLoaded) return <section className="studio-shell"><div className="studio-plan-loading" role="status"><p>{t.loadingPlan}</p></div></section>;
  if (planError) return <section className="studio-shell"><div className="studio-plan-loading" role="alert"><p>{t.planError}</p><button type="button" onClick={() => { setPlanLoaded(false); setPlanError(false); void load(); }}>{t.retryPlan}</button></div></section>;
  if (!quota) return <section className="studio-shell"><div className="studio-plan-loading" role="status"><p>{t.loadingPlan}</p></div></section>;

  return <section className="studio-shell" aria-labelledby="studio-title">
    <div className="studio-heading"><div><div className="studio-heading-labels"><span className="studio-prototype-pill">{t.live}</span><span className="studio-pro-badge">{quota.planCode === "pro" ? "Pro" : "Free"}</span></div><h1 id="studio-title">{t.title}</h1><p>{t.subtitle}</p></div><div className="studio-heading-actions"><button className="studio-history-toggle" type="button" onClick={() => document.getElementById("studio-history")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t.historyButton}</button></div></div>
    <SlidingSegmentedControl className="studio-workflow-switch" activeKey={workflow} ariaLabel={t.workflowLabel}>
      <button type="button" role="tab" data-segment-active={workflow === "guided"} aria-selected={workflow === "guided"} className={workflow === "guided" ? "active" : ""} onClick={() => { setWorkflow("guided"); setWarning(false); setError(""); }}><span>☷</span><div><strong>{t.guidedMode}</strong><small>{t.guidedModeHint}</small></div></button>
      <button type="button" role="tab" data-segment-active={workflow === "quick"} aria-selected={workflow === "quick"} className={workflow === "quick" ? "active" : ""} onClick={() => { setWorkflow("quick"); setWarning(false); setError(""); }}><span>⚡</span><div><strong>{t.quickMode}</strong><small>{t.quickModeHint}</small></div></button>
    </SlidingSegmentedControl>
    <SlidingSegmentedControl className="studio-action-switch" activeKey={mode}>{(["create", "improve", "review"] as StudioMode[]).map((value) => <button key={value} type="button" role="tab" data-segment-active={mode === value} aria-selected={mode === value} className={mode === value ? "active" : ""} onClick={() => { setMode(value); setFields({}); setSourceFile(null); setAssistantMessages([]); }}>{t[value]}</button>)}</SlidingSegmentedControl>
    {workflow === "guided" ? <div className="studio-workspace">
      <aside className="template-library"><div className="template-library-heading"><h2>{t.templates}</h2></div><div className="template-grid">{templates.map(([key, icon]) => <button type="button" className={template === key ? "active" : ""} key={key} onClick={() => switchTemplate(key)}><span>{icon}</span><strong>{t[key]}</strong></button>)}</div><div className="studio-history" id="studio-history"><h3>{t.history}</h3>{quota && <p>{t.limit}: {quota.remaining} · 24h {quota.dailyUsed}/{quota.dailyLimit} · 30d {quota.monthlyUsed}/{quota.monthlyLimit}</p>}{history.length ? history.map((document) => <div key={document.id}><button type="button" onClick={() => setCurrent(document)}>{document.result.title}</button><button type="button" aria-label={t.delete} onClick={() => void remove(document.id)}>×</button></div>) : <p>{t.empty}</p>}</div></aside>
      <div className="studio-form-panel">
        <div className="studio-form-title"><span className="studio-step">{preSignatureCheck ? "✓" : "2"}</span><div><h2>{preSignatureCheck ? t.reviewTitle : t.details}</h2><p>{preSignatureCheck ? t.reviewIntro : mode === "create" ? guideText(guide.intro, copyLocale) : t.goalHint}</p></div></div>
        <div className="studio-form-grid">
          <label className="span-2"><span>{t.country}</span><select value={country} onChange={(event) => setCountry(event.target.value)}>{studioCountries.map((value) => <option key={value}>{value}</option>)}</select><small>{t.countryHint}</small></label>
          <label><span>{t.region}{jurisdictionNeedsRegion ? " *" : ""}</span><input id="studio-field-region" value={region} onChange={(event) => setRegion(event.target.value)} aria-required={jurisdictionNeedsRegion} /><small>{jurisdictionNeedsRegion ? t.regionRequired : t.regionOptional}</small></label>
          <label><span>{t.language}</span><select value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map((value) => <option key={value.code} value={value.code}>{value.name}</option>)}</select></label>
          {mode === "create" ? guide.fields.map((field) => <label key={field.key} className={field.multiline ? "span-2 studio-guided-field" : "studio-guided-field"}><span>{guideText(field.question, copyLocale)}{field.required ? " *" : ""}</span>{field.multiline ? <textarea id={`studio-field-${field.key}`} rows={4} value={fields[field.key] ?? ""} onChange={(event) => update(field.key, event.target.value)} /> : <input id={`studio-field-${field.key}`} value={fields[field.key] ?? ""} onChange={(event) => update(field.key, event.target.value)} />}<small>{guideText(field.example, copyLocale)}</small></label>) : <>{!preSignatureCheck && <label className="span-2 studio-guided-field"><span>{t.goal} *</span><textarea id="studio-field-goal" rows={5} value={fields.goal ?? ""} onChange={(event) => update("goal", event.target.value)} /><small>{t.goalHint}</small></label>}{preSignatureCheck && <aside className="studio-review-checks"><strong>{t.review}</strong><p>{t.reviewChecks}</p></aside>}<label className="span-2 studio-guided-field"><span>{t.existing} *</span><textarea id="studio-field-existing" rows={14} value={fields.existing ?? ""} onChange={(event) => update("existing", event.target.value)} /><small>{t.existingHint}</small></label></>}
        </div>
        {mode !== "create" && <StudioFileField t={t} file={sourceFile} onFile={(file) => { setSourceFile(file); setError(""); }} />}
        <div className="studio-preparation-assistant"><header><div><small>{t.assistantTitle}</small><p>{t.assistantIntro}</p></div><span>AI</span></header>{assistantMessages.length > 0 && <div className="studio-assistant-messages" aria-live="polite">{assistantMessages.map((message, index) => <p className={message.role} key={`${message.role}-${index}`}>{message.text}</p>)}</div>}<div className="studio-suggestion-row" aria-label={t.suggested}>{[t.suggestion1, t.suggestion2, t.suggestion3].map((suggestion) => <button type="button" key={suggestion} disabled={assistantBusy || busy} onClick={() => void askPreparationAssistant(suggestion)}>{suggestion}</button>)}</div><div className="studio-assistant-composer"><textarea rows={2} value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder={t.assistantPlaceholder} disabled={assistantBusy || busy} /><button type="button" disabled={!assistantQuestion.trim() || assistantBusy || busy} onClick={() => void askPreparationAssistant()}>{assistantBusy ? "…" : t.ask}</button></div></div>
        <ReadinessSummary t={t} readiness={readiness} score={readinessScore} missing={missingFields} onPick={focusField} />
        {error && <p className="studio-api-error" role="alert">{error}</p>}
        <button className="primary-button studio-generate" disabled={busy || quota.remaining === 0} type="button" onClick={() => void generate()}>{busy ? t.generating : preSignatureCheck ? t.reviewGenerate : t.generate}<span>→</span></button>
        {busy && <div className="studio-generation-progress" role="status" aria-live="polite"><p className="studio-generation-timer"><span>{t.reasoningTime}: {formatDuration(elapsed)} / 10:00</span><small>{t.reasoningEstimate}</small></p><button type="button" onClick={cancelGeneration}>{t.stop}</button></div>}
      </div>
    </div> : <div className="studio-quick-workspace">
      <div className="studio-quick-card">
        <div className="studio-form-title"><span className="studio-step">{preSignatureCheck ? "✓" : "⚡"}</span><div><h2>{preSignatureCheck ? t.reviewTitle : t.quickTitle}</h2><p>{preSignatureCheck ? t.reviewIntro : t.quickIntro}</p></div></div>
        <div className="studio-quick-context">
          <label><span>{t.country}</span><select value={country} onChange={(event) => setCountry(event.target.value)}>{studioCountries.map((value) => <option key={value}>{value}</option>)}</select></label>
          {jurisdictionNeedsRegion && <label><span>{t.region} *</span><input id="studio-field-region" value={region} onChange={(event) => setRegion(event.target.value)} /></label>}
          <label><span>{t.language}</span><select value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map((value) => <option key={value.code} value={value.code}>{value.name}</option>)}</select></label>
        </div>
        <label className="studio-quick-prompt"><span>{t.quickPrompt} *</span><textarea id="studio-quick-prompt" rows={12} value={quickPrompt} onChange={(event) => { setQuickPrompt(event.target.value); setError(""); }} placeholder={mode === "create" ? t.quickPlaceholder : t.quickEditPlaceholder} /></label>
        {mode !== "create" && <StudioFileField t={t} file={sourceFile} onFile={(file) => { setSourceFile(file); setError(""); }} />}
        <ReadinessSummary t={t} readiness={readiness} score={readinessScore} missing={missingFields} onPick={focusField} compact />
        {preSignatureCheck ? <div className="studio-quick-warning review"><span>✓</span><div><strong>{t.review}</strong><p>{t.reviewChecks}</p></div></div> : <div className="studio-quick-warning"><span>!</span><div><strong>{t.quickAccuracy}</strong><p>{t.quickAccuracyBody}</p></div></div>}
        {error && <p className="studio-api-error" role="alert">{error}</p>}
        <button className="primary-button studio-generate" disabled={busy || quota.remaining === 0 || quickPrompt.trim().length < 2} type="button" onClick={() => void generate()}>{busy ? t.generating : preSignatureCheck ? t.reviewGenerate : t.quickGenerate}<span>→</span></button>
        {busy && <div className="studio-generation-progress" role="status" aria-live="polite"><p className="studio-generation-timer"><span>{t.reasoningTime}: {formatDuration(elapsed)} / 10:00</span><small>{t.reasoningEstimate}</small></p><button type="button" onClick={cancelGeneration}>{t.stop}</button></div>}
      </div>
      <aside className="studio-quick-side" id="studio-history"><div className="studio-history"><h3>{t.history}</h3><p>{t.limit}: {quota.remaining} · 24h {quota.dailyUsed}/{quota.dailyLimit} · 30d {quota.monthlyUsed}/{quota.monthlyLimit}</p>{history.length ? history.map((document) => <div key={document.id}><button type="button" onClick={() => setCurrent(document)}>{document.result.title}</button><button type="button" aria-label={t.delete} onClick={() => void remove(document.id)}>×</button></div>) : <p>{t.empty}</p>}</div></aside>
    </div>}
    <div className="studio-legal-note"><span>i</span><p>{t.disclaimer}</p></div>
    {warning && <div className="studio-warning-backdrop"><section className="studio-warning" role="dialog" aria-modal="true"><div className={`readiness-orb ${readiness}`}><span>!</span></div><h2>{t.warning}</h2><p>{t.warningBody}</p><div className="studio-warning-summary"><MissingList title={t.critical} items={missingFields.critical} onPick={(key) => { setWarning(false); focusField(key); }} /></div><div className="studio-warning-actions"><button type="button" onClick={() => setWarning(false)}>{t.add}</button><button className="primary-button" type="button" onClick={() => { setWarning(false); void generate(true); }}>{t.continue}</button></div></section></div>}
  </section>;
}

function MissingList({ title, items, onPick }: { title: string; items: { key: string; label: string }[]; onPick: (key: string) => void }) {
  if (!items.length) return null;
  return <div className="studio-missing-list"><span>{title}</span>{items.map((item) => <button type="button" key={item.key} onClick={() => onPick(item.key)}>{item.label}<b>→</b></button>)}</div>;
}

function ReadinessSummary({ t, readiness, score, missing, onPick, compact = false }: { t: Copy; readiness: Readiness; score: number; missing: { critical: { key: string; label: string }[]; helpful: { key: string; label: string }[] }; onPick: (key: string) => void; compact?: boolean }) {
  const hasMissingDetails = missing.critical.length > 0 || missing.helpful.length > 0;
  return <div className={`studio-readiness ${readiness}${compact ? " compact" : ""}`} aria-live="polite"><div className="studio-readiness-score" aria-label={`${t.readiness}: ${score}%`}><span>{score}%</span><small>{t.readiness}</small></div><div><strong>{t[readiness]}</strong><p>{t.readinessHint}</p>{hasMissingDetails && <div className="studio-missing-summary"><strong>{t.missingDetails}</strong><small>{t.missingDetailsHint}</small></div>}{missing.critical.length > 0 && <MissingList title={t.critical} items={missing.critical} onPick={onPick} />}{missing.helpful.length > 0 && <MissingList title={t.helpful} items={missing.helpful.slice(0, 8)} onPick={onPick} />}</div></div>;
}

function StudioGate({ t, signedIn, onAction }: { t: Copy; signedIn: boolean; onAction: () => void }) {
  return <section className="studio-shell studio-gate-shell"><div className="studio-pro-gate"><div className="studio-gate-orb">✦</div><h1>{t.proTitle}</h1><p>{t.proBody}</p><ul><li>{t.assistantTitle}</li><li>{t.documentAssistant}</li><li>{t.confidence}</li></ul><button className="primary-button" type="button" onClick={onAction}>{signedIn ? t.proButton : t.signin}</button></div></section>;
}

function StudioFileField({ t, file, onFile }: { t: Copy; file: File | null; onFile: (file: File | null) => void }) {
  return <div className="studio-file-field"><span>{t.upload}</span><input key={file ? `${file.name}-${file.lastModified}` : "empty"} id="studio-document-file" className="visually-hidden" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.rtf,.docx,.odt" onChange={(event) => onFile(event.target.files?.[0] ?? null)} /><div className="studio-file-actions"><label htmlFor="studio-document-file" className="studio-file-button">{t.chooseFile}</label></div>{file && <div className="studio-selected-file"><strong title={file.name}>{file.name}</strong><span>{Math.max(1, Math.round(file.size / 1024))} KB</span><button type="button" onClick={() => onFile(null)}>{t.removeFile}</button></div>}<small>{t.fileHint}</small></div>;
}

type StudioPanelId = "insights" | "document" | "assistant";
const defaultStudioPanelOrder: StudioPanelId[] = ["insights", "document", "assistant"];
const defaultStudioPanelRatios: Record<StudioPanelId, number> = { insights: 0.75, document: 2, assistant: 1 };
const studioPanelMinimumWidths: Record<StudioPanelId, number> = { insights: 190, document: 360, assistant: 240 };
type StudioPanelResize = { pointerId: number; index: number; startX: number; panels: StudioPanelId[]; widths: number[] };

function StudioDraft({ locale, t, item, quota, onBack, onNew, onUpdated, onDownload }: { locale: StudioGuideLocale; t: Copy; item: Saved; quota: Quota | null; onBack: () => void; onNew: () => void; onUpdated: (item: Saved, quota: Quota) => void; onDownload: (item: Saved, format: "docx" | "pdf") => void }) {
  const [selectedText, setSelectedText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panelOrder, setPanelOrder] = useState<StudioPanelId[]>(defaultStudioPanelOrder);
  const [hiddenPanels, setHiddenPanels] = useState<StudioPanelId[]>([]);
  const [focusedPanel, setFocusedPanel] = useState<StudioPanelId | null>(null);
  const [draggedPanel, setDraggedPanel] = useState<StudioPanelId | null>(null);
  const [equalPanels, setEqualPanels] = useState(false);
  const [panelRatios, setPanelRatios] = useState<Record<StudioPanelId, number>>(() => ({ ...defaultStudioPanelRatios }));
  const [resizingPanels, setResizingPanels] = useState(false);
  const [dockRetreating, setDockRetreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "">("");
  const editorRef = useRef<HTMLDivElement>(null);
  const editorSelectionRef = useRef<Range | null>(null);
  const panelGridRef = useRef<HTMLDivElement>(null);
  const pointerDragRef = useRef<{ panel: StudioPanelId; pointerId: number; startX: number } | null>(null);
  const panelResizeRef = useRef<StudioPanelResize | null>(null);
  const lastPageScrollRef = useRef(0);
  const lastDocumentScrollRef = useRef(0);
  useEffect(() => {
    window.document.body.classList.add("studio-editor-open");
    return () => {
      window.document.body.classList.remove("studio-editor-open");
      window.document.body.classList.remove("studio-panels-resizing");
    };
  }, []);
  useEffect(() => {
    if (!focusedPanel) return;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.classList.add("studio-panels-focused");
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedPanel(null);
    };
    window.document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.document.body.classList.remove("studio-panels-focused");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [focusedPanel]);
  const updateReadingControls = useCallback((nextScroll: number, previousScrollRef: { current: number }) => {
    previousScrollRef.current = nextScroll;
    if (focusedPanel) {
      return;
    }
    // The layout dock is a top-of-page control: it stays visible only while
    // both the page and the document canvas are at their top edge. This avoids
    // bringing it back merely because the user scrolled upward mid-document.
    const pageAtTop = window.scrollY <= 6;
    const documentAtTop = lastDocumentScrollRef.current <= 6;
    const retreat = !pageAtTop || !documentAtTop;
    setDockRetreating(retreat);
    window.dispatchEvent(new CustomEvent("whatnow:studio-scroll", { detail: { retreat } }));
  }, [focusedPanel]);
  useEffect(() => {
    if (focusedPanel) {
      // Focused mode deliberately restores the dock so its controls remain reachable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDockRetreating(false);
      window.dispatchEvent(new CustomEvent("whatnow:studio-scroll", { detail: { retreat: false } }));
      return;
    }
    const retreat = window.scrollY > 6 || lastDocumentScrollRef.current > 6;
    setDockRetreating(retreat);
    window.dispatchEvent(new CustomEvent("whatnow:studio-scroll", { detail: { retreat } }));
  }, [focusedPanel]);
  useEffect(() => {
    const trackPageScroll = () => updateReadingControls(window.scrollY, lastPageScrollRef);
    trackPageScroll();
    window.addEventListener("scroll", trackPageScroll, { passive: true });
    return () => window.removeEventListener("scroll", trackPageScroll);
  }, [updateReadingControls]);
  const document = item.result;
  const annotations = document.annotations ?? [];
  useEffect(() => {
    if (!editorRef.current || dirty) return;
    editorRef.current.innerHTML = initialEditorHtml(document);
    setSaveState("saved");
  }, [dirty, document]);
  const panelLabels: Record<StudioPanelId, string> = {
    insights: t.insightsPanel,
    document: t.documentPanel,
    assistant: t.assistantPanel,
  };
  const selectFromDocument = () => {
    const selection = window.getSelection(); if (!selection || !selection.rangeCount || !editorRef.current) return;
    const range = selection.getRangeAt(0); if (!editorRef.current.contains(range.commonAncestorContainer)) return;
    editorSelectionRef.current = range.cloneRange();
    const value = selection.toString().trim().slice(0, 6000); if (value) setSelectedText(value);
  };
  const pickAnnotation = (excerpt: string, question: string) => { setSelectedText(excerpt); setInstruction(question); };
  const saveManualEdit = async () => {
    if (!editorRef.current) return item;
    if (!dirty) return item;
    setSaving(true); setError("");
    try {
      const token = await getAccessToken(); if (!token) throw new Error();
      const response = await fetch("/api/document-studio", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, manualDocument: editorPayload(editorRef.current, document) }) });
      const data = await response.json() as { document?: Saved; quota?: Quota; error?: { message?: string } }; if (!response.ok || !data.document || !data.quota) throw new Error(data.error?.message);
      setDirty(false); setSaveState("saved"); onUpdated(data.document, data.quota); return data.document;
    } catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : t.error); setSaveState("unsaved"); return null; }
    finally { setSaving(false); }
  };
  const restoreEditorSelection = () => {
    const selection = window.getSelection(); if (!selection || !editorSelectionRef.current) return;
    selection.removeAllRanges(); selection.addRange(editorSelectionRef.current);
  };
  const runEditorCommand = (command: string, value?: string) => {
    editorRef.current?.focus(); restoreEditorSelection(); window.document.execCommand(command, false, value); setDirty(true); setSaveState("unsaved"); selectFromDocument();
  };
  const applyAiFormattingInstruction = (question: string) => {
    if (!selectedText || !editorSelectionRef.current) return false;
    const value = question.toLocaleLowerCase();
    const requestsFormatting = /(?:bold|жирн|trekn|font|шрифт|izmē|color|colour|цвет|krās|highlight|подсвет|выдел|izcel|red|красн|sarkan|blue|син|zil|green|зел|zaļ)/u.test(value);
    if (!requestsFormatting) return false;
    let applied = false;
    const command = (name: string, commandValue?: string) => { runEditorCommand(name, commandValue); applied = true; };
    if (/(?:bold|жирн|trekn)/u.test(value)) command("bold");
    if (/(?:italic|курсив|slīprakst)/u.test(value)) command("italic");
    if (/(?:underline|подчерк|pasvītr)/u.test(value)) command("underline");
    if (/(?:bigger|larger|large font|увелич|крупн|больш.*шрифт|palielin|lielāk)/u.test(value)) command("fontSize", "5");
    if (/(?:smaller|small font|уменьш|мелк|mazāk)/u.test(value)) command("fontSize", "2");
    if (/(?:red|красн|sarkan)/u.test(value)) command("foreColor", editorColors.red);
    else if (/(?:blue|син|zil)/u.test(value)) command("foreColor", editorColors.blue);
    else if (/(?:green|зел|zaļ)/u.test(value)) command("foreColor", editorColors.accent);
    if (/(?:highlight|подсвет|маркер|фон|izcel)/u.test(value)) command("hiliteColor", /(?:red|красн|sarkan)/u.test(value) ? editorHighlights.red : /(?:green|зел|zaļ)/u.test(value) ? editorHighlights.green : editorHighlights.yellow);
    return applied;
  };
  const handleBack = async () => { if (dirty && !(await saveManualEdit())) return; onBack(); };
  const handleNew = async () => { if (dirty && !(await saveManualEdit())) return; if (window.confirm(t.newDocumentConfirm)) onNew(); };
  const handleDownload = async (format: "docx" | "pdf") => { const saved = dirty ? await saveManualEdit() : item; if (saved) await onDownload(saved, format); };
  const ask = async (preset?: string) => {
    const question = (preset ?? instruction).trim(); if (!question || busy) return;
    let requestStarted = false;
    try {
      const formattingApplied = applyAiFormattingInstruction(question);
      const asksForTextChange = /(?:correct|fix|rewrite|replace|change the text|исправ|замен|перепиш|измени текст|labot|pārrakst|aizstāj)/u.test(question.toLocaleLowerCase());
      if (formattingApplied && !asksForTextChange) {
        setMessages((previous) => [...previous, { role: "user", text: question }, { role: "assistant", text: locale === "ru" ? "Готово — оформление выбранного фрагмента изменено. Сохраните документ, чтобы закрепить правку." : locale === "lv" ? "Gatavs — atlasītā fragmenta noformējums ir mainīts. Saglabājiet dokumentu, lai nostiprinātu izmaiņas." : "Done — the selected passage has been formatted. Save the document to keep the change." }]);
        setInstruction(""); setSelectedText(""); return;
      }
      if (dirty && !(await saveManualEdit())) return;
      setMessages((previous) => [...previous, { role: "user", text: question }]); setInstruction(""); setBusy(true); setError(""); requestStarted = true;
      const token = await getAccessToken(); if (!token) throw new Error();
       const response = await fetch("/api/document-studio", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, instruction: question, selectedText }) });
      const data = await response.json() as { message?: string; document?: Saved; quota?: Quota; error?: { message?: string } }; if (!response.ok || !data.message || !data.document || !data.quota) throw new Error(data.error?.message);
      setMessages((previous) => [...previous, { role: "assistant", text: data.message! }]); if (data.document) onUpdated(data.document, data.quota); setSelectedText("");
    } catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : t.error); }
    finally { if (requestStarted) setBusy(false); }
  };
  const showPanel = (panel: StudioPanelId) => {
    setHiddenPanels((current) => current.filter((value) => value !== panel));
    setFocusedPanel(null);
  };
  const hidePanel = (panel: StudioPanelId) => {
    setHiddenPanels((current) => current.includes(panel) ? current : [...current, panel]);
    if (focusedPanel === panel) setFocusedPanel(null);
  };
  const focusPanel = (panel: StudioPanelId) => {
    setHiddenPanels((current) => current.filter((value) => value !== panel));
    setFocusedPanel((current) => current === panel ? null : panel);
  };
  const reorderPanel = (panel: StudioPanelId, target: StudioPanelId) => {
    if (panel === target || focusedPanel) return;
    setPanelOrder((current) => {
      const sourceIndex = current.indexOf(panel);
      const originalTargetIndex = current.indexOf(target);
      const next = current.filter((value) => value !== panel);
      const targetIndex = next.indexOf(target);
      if (sourceIndex < 0 || originalTargetIndex < 0 || targetIndex < 0) return current;
      next.splice(sourceIndex < originalTargetIndex ? targetIndex + 1 : targetIndex, 0, panel);
      return next;
    });
  };
  const dropPanel = (target: StudioPanelId) => {
    if (!draggedPanel || draggedPanel === target || focusedPanel) return;
    reorderPanel(draggedPanel, target);
    setDraggedPanel(null);
  };
  const startPointerDrag = (panel: StudioPanelId, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (focusedPanel || event.button !== 0) return;
    pointerDragRef.current = { panel, pointerId: event.pointerId, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedPanel(panel);
  };
  const continuePointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || Math.abs(event.clientX - drag.startX) < 8) return;
    const targetNode = window.document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-studio-panel]") as HTMLElement | null;
    const target = targetNode?.dataset.studioPanel as StudioPanelId | undefined;
    if (target && target !== drag.panel) reorderPanel(drag.panel, target);
  };
  const finishPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerDragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointerDragRef.current = null;
    setDraggedPanel(null);
  };
  const visiblePanels = focusedPanel ? [focusedPanel] : panelOrder.filter((panel) => !hiddenPanels.includes(panel));
  const applyPanelResize = (resize: StudioPanelResize, clientX: number) => {
    const leftPanel = resize.panels[resize.index];
    const rightPanel = resize.panels[resize.index + 1];
    if (!leftPanel || !rightPanel) return;
    const pairWidth = resize.widths[resize.index] + resize.widths[resize.index + 1];
    const leftMinimum = studioPanelMinimumWidths[leftPanel];
    const rightMinimum = studioPanelMinimumWidths[rightPanel];
    const maximumLeft = Math.max(leftMinimum, pairWidth - rightMinimum);
    const nextLeft = Math.min(maximumLeft, Math.max(leftMinimum, resize.widths[resize.index] + clientX - resize.startX));
    const nextWidths = [...resize.widths];
    nextWidths[resize.index] = nextLeft;
    nextWidths[resize.index + 1] = pairWidth - nextLeft;
    const totalWidth = nextWidths.reduce((total, width) => total + width, 0);
    setPanelRatios((current) => {
      const next = { ...current };
      resize.panels.forEach((panel, index) => { next[panel] = nextWidths[index] / totalWidth; });
      return next;
    });
  };
  const startPanelResize = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (focusedPanel || event.button !== 0 || window.matchMedia("(max-width: 980px)").matches || !panelGridRef.current) return;
    const panelNodes = visiblePanels.map((panel) => panelGridRef.current?.querySelector<HTMLElement>(`[data-studio-panel="${panel}"]`) ?? null);
    if (panelNodes.some((node) => !node)) return;
    panelResizeRef.current = { pointerId: event.pointerId, index, startX: event.clientX, panels: [...visiblePanels], widths: panelNodes.map((node) => node!.getBoundingClientRect().width) };
    event.currentTarget.setPointerCapture(event.pointerId);
    setEqualPanels(false);
    setResizingPanels(true);
    window.document.body.classList.add("studio-panels-resizing");
  };
  const continuePanelResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = panelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    applyPanelResize(resize, event.clientX);
  };
  const finishPanelResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (panelResizeRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    panelResizeRef.current = null;
    setResizingPanels(false);
    window.document.body.classList.remove("studio-panels-resizing");
  };
  const resetLayout = () => {
    setPanelOrder(defaultStudioPanelOrder);
    setHiddenPanels([]);
    setFocusedPanel(null);
    setEqualPanels(false);
    setPanelRatios({ ...defaultStudioPanelRatios });
  };
  const panelGridStyle = {
    "--studio-panel-columns": visiblePanels.map((panel) => `minmax(0, ${equalPanels ? 1 : panelRatios[panel]}fr)`).join(" "),
  } as CSSProperties;
  const panelControls = (panel: StudioPanelId) => {
    return <div className="studio-panel-controls">
      <button type="button" title={focusedPanel === panel ? t.collapse : t.focusPanel} aria-label={`${focusedPanel === panel ? t.collapse : t.focusPanel}: ${panelLabels[panel]}`} onClick={() => focusPanel(panel)}>{focusedPanel === panel ? "↙" : "↗"}</button>
      {!focusedPanel && <button type="button" title={t.hidePanel} aria-label={`${t.hidePanel}: ${panelLabels[panel]}`} onClick={() => hidePanel(panel)}>−</button>}
    </div>;
  };
  const panelGrip = (panel: StudioPanelId) => <button
    className="studio-panel-grip"
    type="button"
    draggable={!focusedPanel}
    disabled={Boolean(focusedPanel)}
    aria-label={`${t.dragPanel}: ${panelLabels[panel]}`}
    title={focusedPanel ? undefined : t.dragPanel}
    onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedPanel(panel); }}
    onDragEnd={() => setDraggedPanel(null)}
    onPointerDown={(event) => startPointerDrag(panel, event)}
    onPointerMove={continuePointerDrag}
    onPointerUp={finishPointerDrag}
    onPointerCancel={finishPointerDrag}
  ><span aria-hidden="true">⠿</span></button>;
  const panels = {
    insights: <aside className="studio-insights-panel studio-flex-panel" onDragOver={(event) => event.preventDefault()} onDrop={() => dropPanel("insights")}>
      <header className="studio-panel-header"><div>{panelGrip("insights")}<strong>{t.insightsPanel}</strong></div>{panelControls("insights")}</header>
      <div className="studio-panel-scroll"><div className="studio-draft-navigation"><button className="studio-back-button" type="button" onClick={() => void handleBack()}>← {t.back}</button><button className="studio-new-document-button" type="button" onClick={() => void handleNew()}>＋ {t.newDocument}</button></div>{document.preSignatureCheck && <div className="studio-final-check-result"><strong>✓ {t.preSignDone}</strong><p>{t.preSignChecks}</p></div>}<div className={`studio-confidence ${document.confidence}`}><small>{t.confidence}</small><strong>{document.confidence.toUpperCase()}</strong>{document.confidence === "low" && <p>{t.lowConfidence}</p>}</div><div><small>{t.issues}</small>{annotations.length || document.assumptions.length || document.unresolvedIssues.length ? <ul>{[...document.assumptions, ...document.unresolvedIssues.map((issue) => issue.issue)].map((value, index) => <li key={index}>{value}</li>)}</ul> : <p>{t.noIssues}</p>}</div>{annotations.length > 0 && <div className="studio-annotation-list"><small>{t.missingDetails}</small>{annotations.map((annotation, index) => <button type="button" key={`${annotation.sectionHeading}-${index}`} onClick={() => pickAnnotation(annotation.excerpt, annotation.question)}><strong>{annotation.sectionHeading}</strong><span>{annotation.reason}</span></button>)}</div>}{document.legalSources.length > 0 && <div><small>{t.sources}</small><ul>{document.legalSources.map((source, index) => <li key={index}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></div>}{quota && <div><small>{t.limit}</small><p>{quota.remaining} · 24h {quota.dailyUsed}/{quota.dailyLimit}</p></div>}</div>
    </aside>,
    document: <article className="studio-document-paper studio-flex-panel" onDragOver={(event) => event.preventDefault()} onDrop={() => dropPanel("document")}>
      <div className="studio-document-commandbar">
      <div className="studio-document-toolbar studio-panel-header"><div className="studio-panel-title">{panelGrip("document")}<strong>{t.editDocument}</strong><span className={`studio-save-state ${saveState === "unsaved" ? "dirty" : ""}`}>{saving ? t.saving : saveState === "unsaved" ? t.unsaved : t.saved}</span></div><div className="studio-document-actions"><button type="button" className="studio-save-button" disabled={!dirty || saving} onClick={() => void saveManualEdit()}>{saving ? "…" : t.save}</button><button type="button" onClick={() => void navigator.clipboard.writeText(editorRef.current?.innerText || document.plainText)}>{t.copy}</button><button type="button" onClick={() => void handleDownload("docx")}>{t.docx}</button><button type="button" onClick={() => void handleDownload("pdf")}>{t.pdf}</button>{panelControls("document")}</div></div>
      <div className="studio-editor-formatbar" role="toolbar" aria-label={t.editDocument}>
        <select aria-label="Text style" defaultValue="p" onChange={(event) => runEditorCommand("formatBlock", event.target.value)}><option value="p">Text</option><option value="h1">Title</option><option value="h2">Heading</option><option value="h3">Subheading</option></select>
        <select aria-label="Font size" defaultValue="3" onChange={(event) => runEditorCommand("fontSize", event.target.value)}><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">Extra large</option></select>
        <div><button type="button" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("bold")}><b>B</b></button><button type="button" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("italic")}><i>I</i></button><button type="button" aria-label="Underline" title="Underline" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("underline")}><u>U</u></button></div>
        <div><button type="button" aria-label="Bulleted list" title="Bulleted list" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("insertUnorderedList")}>• List</button><button type="button" aria-label="Numbered list" title="Numbered list" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("insertOrderedList")}>1. List</button></div>
        <div className="studio-color-swatches" aria-label="Text color">{Object.entries(editorColors).map(([name, value]) => <button type="button" key={name} aria-label={`${name} text`} title={`${name} text`} style={{ "--editor-swatch": value } as CSSProperties} onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("foreColor", value)} />)}</div>
        <div className="studio-highlight-swatches" aria-label="Highlight color">{Object.entries(editorHighlights).map(([name, value]) => <button type="button" key={name} aria-label={`${name} highlight`} title={`${name} highlight`} style={{ "--editor-swatch": value } as CSSProperties} onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("hiliteColor", value)} />)}</div>
        <div><button type="button" aria-label="Undo" title="Undo" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("undo")}>↶</button><button type="button" aria-label="Redo" title="Redo" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("redo")}>↷</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("removeFormat")}>Clear</button></div>
      </div>
      </div>
      <div className="studio-document-scroll studio-rich-editor" ref={editorRef} role="textbox" aria-label={t.editDocument} aria-multiline="true" contentEditable suppressContentEditableWarning onScroll={(event) => updateReadingControls(event.currentTarget.scrollTop, lastDocumentScrollRef)} onInput={() => { setDirty(true); setSaveState("unsaved"); }} onMouseUp={selectFromDocument} onKeyUp={selectFromDocument} onTouchEnd={selectFromDocument} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveManualEdit(); } }} />
    </article>,
    assistant: <aside className="studio-document-assistant studio-flex-panel" aria-label={t.documentAssistant} onDragOver={(event) => event.preventDefault()} onDrop={() => dropPanel("assistant")}>
      <header className="studio-panel-header"><div>{panelGrip("assistant")}<small>AI</small><h2>{t.documentAssistant}</h2></div>{panelControls("assistant")}</header>
      <div className="studio-panel-scroll"><p>{t.documentAssistantIntro}</p><button type="button" className="studio-ai-polish" disabled={busy || saving} onClick={() => void ask(t.polishPrompt)}>✦ {t.polish}</button>{selectedText && <blockquote><span>{t.selected}</span><p>{selectedText}</p><button type="button" onClick={() => setSelectedText("")}>{t.clearSelection}</button></blockquote>}<div className="studio-assistant-messages" aria-live="polite">{messages.map((message, index) => <p className={message.role} key={`${message.role}-${index}`}>{message.text}</p>)}</div>{error && <p className="studio-api-error" role="alert">{error}</p>}<div className="studio-assistant-composer"><textarea rows={3} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={t.editPlaceholder} /><button type="button" disabled={!instruction.trim() || busy} onClick={() => void ask()}>{busy ? "…" : t.send}</button></div></div>
    </aside>,
  } satisfies Record<StudioPanelId, ReactNode>;
  return <div className={`studio-draft-workspace${focusedPanel ? ` panel-focused focus-${focusedPanel}` : ""}`}>
    {!focusedPanel && <nav className={`studio-layout-dock${dockRetreating ? " retreating" : ""}`} aria-label={t.layout}>
      <div><strong>{t.layout}</strong><small>{t.layoutHint}</small></div>
      <div className="studio-layout-actions">{panelOrder.map((panel) => <button type="button" key={panel} className={!hiddenPanels.includes(panel) ? "active" : ""} aria-pressed={!hiddenPanels.includes(panel)} onClick={() => focusedPanel ? focusPanel(panel) : hiddenPanels.includes(panel) ? showPanel(panel) : hidePanel(panel)}><span>{panel === "insights" ? "☰" : panel === "document" ? "▤" : "✦"}</span>{panelLabels[panel]}</button>)}<button type="button" className={equalPanels ? "active" : ""} aria-pressed={equalPanels} onClick={() => setEqualPanels((current) => !current)}>▦ {t.equalPanels}</button><button type="button" onClick={resetLayout}>↺ {t.resetLayout}</button></div>
    </nav>}
    <div ref={panelGridRef} className={`studio-panel-grid${equalPanels ? " equal-panels" : ""}${resizingPanels ? " resizing" : ""}`} data-panels={visiblePanels.length} style={panelGridStyle}>{visiblePanels.map((panel, index) => <div className={`studio-panel-slot panel-${panel}${draggedPanel === panel ? " dragging" : ""}`} data-studio-panel={panel} key={panel}>{panels[panel]}{!focusedPanel && index < visiblePanels.length - 1 && <button className="studio-panel-resize-handle" type="button" title={`${panelLabels[panel]} ↔ ${panelLabels[visiblePanels[index + 1]]}`} aria-label={`${panelLabels[panel]} ↔ ${panelLabels[visiblePanels[index + 1]]}`} onPointerDown={(event) => startPanelResize(index, event)} onPointerMove={continuePanelResize} onPointerUp={finishPanelResize} onPointerCancel={finishPanelResize}><span aria-hidden="true" /></button>}</div>)}</div>
  </div>;
}
