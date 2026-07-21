"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { askFollowupQuestion, FollowupClientError, loadFollowupConversation } from "./followup-client";
import type { FollowupConversation } from "./followup-types";
import type { ProfileLanguage } from "./profile-types";

const copy = {
  en: { eyebrow: "Continue with this document", title: "Ask a follow-up question", body: "Clarify any conclusion without uploading the document again.", open: "Ask about this document", selected: "Ask about selected text", selectedLabel: "Selected passage", close: "Close document chat", expand: "Expand to full screen", collapse: "Return to side panel", placeholder: "Ask what a deadline means, what to prepare, or what a sentence says…", send: "Send", sending: "Thinking…", loading: "Loading your questions…", empty: "Ask your first question about this analysis.", evidence: "Based on", remaining: "{count} questions left", free: "Free", pro: "Pro", limit: "You have used all questions available for this document.", save: "The analysis is still being saved. The chat will be available in a moment.", error: "The chat is temporarily unavailable. Please try again.", retry: "Try again", uncertain: "This answer is uncertain — check the original document.", privacy: "The original document is not uploaded again. Answers use the saved analysis and its evidence excerpts.", inputLabel: "Your question" },
  ru: { eyebrow: "Продолжить работу с документом", title: "Задать дополнительный вопрос", body: "Уточните любой вывод без повторной загрузки документа.", open: "Спросить об этом документе", selected: "Спросить о выделенном", selectedLabel: "Выделенный фрагмент", close: "Закрыть чат по документу", expand: "Развернуть на весь экран", collapse: "Вернуть боковую панель", placeholder: "Спросите, что означает срок, что подготовить или как понять фразу…", send: "Отправить", sending: "Думаю…", loading: "Загружаем ваши вопросы…", empty: "Задайте первый вопрос по этому разбору.", evidence: "Основание", remaining: "Осталось вопросов: {count}", free: "Free", pro: "Pro", limit: "Вы использовали все вопросы, доступные для этого документа.", save: "Разбор ещё сохраняется. Чат станет доступен через несколько секунд.", error: "Чат временно недоступен. Попробуйте ещё раз.", retry: "Повторить", uncertain: "Ответ неуверенный — проверьте оригинал документа.", privacy: "Исходный документ не загружается повторно. Ответы используют сохранённый разбор и фрагменты-доказательства.", inputLabel: "Ваш вопрос" },
  lv: { eyebrow: "Turpināt darbu ar dokumentu", title: "Uzdot papildjautājumu", body: "Precizējiet jebkuru secinājumu, vēlreiz neaugšupielādējot dokumentu.", open: "Jautāt par šo dokumentu", selected: "Jautāt par atlasīto tekstu", selectedLabel: "Atlasītais fragments", close: "Aizvērt dokumenta čatu", expand: "Atvērt pilnekrānā", collapse: "Atgriezt sānu paneli", placeholder: "Jautājiet par termiņu, nepieciešamajiem dokumentiem vai teikuma nozīmi…", send: "Sūtīt", sending: "Domāju…", loading: "Ielādējam jautājumus…", empty: "Uzdodiet pirmo jautājumu par šo analīzi.", evidence: "Pamatojums", remaining: "Atlikuši {count} jautājumi", free: "Free", pro: "Pro", limit: "Šim dokumentam pieejamie jautājumi ir izmantoti.", save: "Analīze vēl tiek saglabāta. Čats drīz būs pieejams.", error: "Čats pašlaik nav pieejams. Mēģiniet vēlreiz.", retry: "Mēģināt vēlreiz", uncertain: "Atbilde nav droša — pārbaudiet oriģinālo dokumentu.", privacy: "Oriģinālais dokuments netiek augšupielādēts atkārtoti. Atbildēs tiek izmantota saglabātā analīze un pierādījumu fragmenti.", inputLabel: "Jūsu jautājums" },
  es: { eyebrow: "Continúa con este documento", title: "Haz una pregunta adicional", body: "Aclara cualquier conclusión sin volver a subir el documento.", open: "Preguntar sobre este documento", selected: "Preguntar sobre el texto seleccionado", selectedLabel: "Fragmento seleccionado", close: "Cerrar el chat del documento", expand: "Ampliar a pantalla completa", collapse: "Volver al panel lateral", placeholder: "Pregunta qué significa un plazo, qué preparar o cómo entender una frase…", send: "Enviar", sending: "Pensando…", loading: "Cargando tus preguntas…", empty: "Haz tu primera pregunta sobre este análisis.", evidence: "Basado en", remaining: "Quedan {count} preguntas", free: "Free", pro: "Pro", limit: "Has usado todas las preguntas disponibles para este documento.", save: "El análisis aún se está guardando. El chat estará disponible en un momento.", error: "El chat no está disponible temporalmente. Inténtalo de nuevo.", retry: "Reintentar", uncertain: "La respuesta no es segura; comprueba el documento original.", privacy: "El documento original no se vuelve a subir. Las respuestas usan el análisis guardado y sus fragmentos de evidencia.", inputLabel: "Tu pregunta" },
  pt: { eyebrow: "Continue com este documento", title: "Faça uma pergunta adicional", body: "Esclareça qualquer conclusão sem enviar o documento novamente.", open: "Perguntar sobre este documento", selected: "Perguntar sobre o texto selecionado", selectedLabel: "Trecho selecionado", close: "Fechar o chat do documento", expand: "Expandir para ecrã inteiro", collapse: "Voltar ao painel lateral", placeholder: "Pergunte o significado de um prazo, o que preparar ou como entender uma frase…", send: "Enviar", sending: "A pensar…", loading: "A carregar as suas perguntas…", empty: "Faça a primeira pergunta sobre esta análise.", evidence: "Com base em", remaining: "Restam {count} perguntas", free: "Free", pro: "Pro", limit: "Utilizou todas as perguntas disponíveis para este documento.", save: "A análise ainda está a ser guardada. O chat estará disponível em breve.", error: "O chat está temporariamente indisponível. Tente novamente.", retry: "Tentar novamente", uncertain: "A resposta é incerta — verifique o documento original.", privacy: "O documento original não é enviado novamente. As respostas usam a análise guardada e os respetivos trechos de evidência.", inputLabel: "A sua pergunta" },
  fr: { eyebrow: "Continuer avec ce document", title: "Poser une question complémentaire", body: "Clarifiez une conclusion sans télécharger à nouveau le document.", open: "Interroger ce document", selected: "Interroger le texte sélectionné", selectedLabel: "Passage sélectionné", close: "Fermer le chat du document", expand: "Agrandir en plein écran", collapse: "Revenir au panneau latéral", placeholder: "Demandez ce que signifie une échéance, quoi préparer ou comment comprendre une phrase…", send: "Envoyer", sending: "Réflexion…", loading: "Chargement de vos questions…", empty: "Posez votre première question sur cette analyse.", evidence: "Fondé sur", remaining: "{count} questions restantes", free: "Free", pro: "Pro", limit: "Vous avez utilisé toutes les questions disponibles pour ce document.", save: "L’analyse est encore en cours d’enregistrement. Le chat sera bientôt disponible.", error: "Le chat est temporairement indisponible. Réessayez.", retry: "Réessayer", uncertain: "Cette réponse est incertaine — vérifiez le document original.", privacy: "Le document original n’est pas renvoyé. Les réponses utilisent l’analyse enregistrée et ses extraits justificatifs.", inputLabel: "Votre question" },
  de: { eyebrow: "Mit diesem Dokument fortfahren", title: "Eine Zusatzfrage stellen", body: "Klären Sie jede Schlussfolgerung, ohne das Dokument erneut hochzuladen.", open: "Zu diesem Dokument fragen", selected: "Zum markierten Text fragen", selectedLabel: "Markierter Abschnitt", close: "Dokument-Chat schließen", expand: "Im Vollbild öffnen", collapse: "Zur Seitenleiste zurückkehren", placeholder: "Fragen Sie nach einer Frist, benötigten Unterlagen oder der Bedeutung eines Satzes…", send: "Senden", sending: "Denke nach…", loading: "Ihre Fragen werden geladen…", empty: "Stellen Sie Ihre erste Frage zu dieser Analyse.", evidence: "Gestützt auf", remaining: "Noch {count} Fragen", free: "Free", pro: "Pro", limit: "Sie haben alle verfügbaren Fragen für dieses Dokument verwendet.", save: "Die Analyse wird noch gespeichert. Der Chat ist gleich verfügbar.", error: "Der Chat ist vorübergehend nicht verfügbar. Bitte erneut versuchen.", retry: "Erneut versuchen", uncertain: "Diese Antwort ist unsicher — prüfen Sie das Originaldokument.", privacy: "Das Originaldokument wird nicht erneut hochgeladen. Antworten nutzen die gespeicherte Analyse und ihre Belegstellen.", inputLabel: "Ihre Frage" },
} satisfies Record<ProfileLanguage, Record<string, string>>;

export function DocumentChat({ analysisId, locale, selectedText, onSelectionConsumed }: {
  analysisId: string | null;
  locale: ProfileLanguage;
  selectedText: string | null;
  onSelectionConsumed: () => void;
}) {
  const t = copy[locale];
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [conversation, setConversation] = useState<FollowupConversation | null>(null);
  const [question, setQuestion] = useState("");
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remainingLabel = useMemo(() => conversation
    ? t.remaining.replace("{count}", String(conversation.quota.remaining))
    : null, [conversation, t.remaining]);

  const load = async () => {
    if (!analysisId) return;
    setLoading(true);
    setError(null);
    try { setConversation(await loadFollowupConversation(analysisId)); }
    catch { setError(t.error); }
    finally { setLoading(false); }
  };

  const openChat = (selection: string | null = null) => {
    if (!analysisId) return;
    setQuotedText(selection);
    setOpen(true);
    onSelectionConsumed();
    if (!conversation || conversation.analysisId !== analysisId) void load();
    window.setTimeout(() => textareaRef.current?.focus(), 80);
  };

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (expanded) setExpanded(false);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open, expanded]);

  useEffect(() => { messageEndRef.current?.scrollIntoView({ block: "end" }); }, [conversation, sending]);

  const submit = async () => {
    const clean = question.trim();
    if (!analysisId || clean.length < 2 || sending || conversation?.quota.remaining === 0) return;
    setSending(true);
    setError(null);
    try {
      setConversation(await askFollowupQuestion({ analysisId, question: clean, selectedText: quotedText }));
      setQuestion("");
      setQuotedText(null);
    } catch (cause) {
      const code = cause instanceof FollowupClientError ? cause.code : "";
      setError(code === "followup_limit_reached" ? t.limit : t.error);
      if (code === "followup_limit_reached") await load().catch(() => undefined);
    } finally { setSending(false); }
  };

  return <>
    <article className="document-chat-cta">
      <div className="document-chat-cta-icon" aria-hidden="true"><span>?</span></div>
      <div><p>{t.eyebrow}</p><h2>{t.title}</h2><span>{t.body}</span></div>
      <button type="button" onClick={() => openChat()} disabled={!analysisId} title={!analysisId ? t.save : undefined}>{t.open}<span aria-hidden="true">→</span></button>
    </article>

    {selectedText && <button className="selection-followup-button" type="button" onClick={() => openChat(selectedText)} disabled={!analysisId}>
      <span aria-hidden="true">?</span>{analysisId ? t.selected : t.save}
    </button>}

    {open && <div className="document-chat-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={`document-chat-panel${expanded ? " expanded" : ""}`} role="dialog" aria-modal="true" aria-labelledby="document-chat-title">
        <header className="document-chat-header">
          <div><p>{t.eyebrow}</p><h2 id="document-chat-title">{t.title}</h2></div>
          <div className="document-chat-window-actions">
            <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? t.collapse : t.expand} title={expanded ? t.collapse : t.expand}><span aria-hidden="true">{expanded ? "↘" : "↗"}</span></button>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.close} title={t.close}><span aria-hidden="true">×</span></button>
          </div>
        </header>

        <div className="document-chat-statusbar">
          <span className={`document-chat-plan ${conversation?.quota.planCode === "pro" ? "pro" : ""}`}>{conversation?.quota.planCode === "pro" ? t.pro : t.free}</span>
          <span>{remainingLabel ?? (analysisId ? "…" : t.save)}</span>
        </div>

        <div className="document-chat-messages" aria-live="polite">
          {loading && <p className="document-chat-state">{t.loading}</p>}
          {!loading && conversation?.messages.length === 0 && <div className="document-chat-empty"><span aria-hidden="true">?</span><p>{t.empty}</p></div>}
          {conversation?.messages.map((message) => <article className="document-chat-exchange" key={message.id}>
            <div className="document-chat-user-message">
              {message.selectedText && <blockquote><small>{t.selectedLabel}</small>{message.selectedText}</blockquote>}
              <p>{message.question}</p>
            </div>
            <div className="document-chat-answer">
              <span className="document-chat-answer-mark" aria-hidden="true">W</span>
              <div><p>{message.answer}</p>
                {message.evidenceIds.length > 0 && <div className="document-chat-evidence">{t.evidence}: {message.evidenceIds.map((id) => <a href={`#evidence-${id}`} onClick={() => setOpen(false)} key={id}>{id.toUpperCase()}</a>)}</div>}
                {message.uncertain && <small className="document-chat-uncertain">{t.uncertain}</small>}
                {message.safetyNotice && <small className="document-chat-safety">{message.safetyNotice}</small>}
              </div>
            </div>
          </article>)}
          {sending && <div className="document-chat-thinking" role="status"><span /><span /><span /><p>{t.sending}</p></div>}
          <div ref={messageEndRef} />
        </div>

        <footer className="document-chat-composer">
          {quotedText && <blockquote className="document-chat-selection"><button type="button" onClick={() => setQuotedText(null)} aria-label="Remove selected passage">×</button><small>{t.selectedLabel}</small><p>{quotedText}</p></blockquote>}
          {error && <div className="document-chat-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>{t.retry}</button></div>}
          {conversation?.quota.remaining === 0 && <p className="document-chat-limit" role="status">{t.limit}</p>}
          <label htmlFor="document-chat-question">{t.inputLabel}</label>
          <div className="document-chat-input-row">
            <textarea id="document-chat-question" ref={textareaRef} value={question} maxLength={1_200} rows={2} placeholder={t.placeholder} disabled={sending || loading || conversation?.quota.remaining === 0}
              onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); } }} />
            <button type="button" onClick={() => void submit()} disabled={question.trim().length < 2 || sending || loading || conversation?.quota.remaining === 0} aria-label={t.send}><span aria-hidden="true">↑</span></button>
          </div>
          <p className="document-chat-privacy">{t.privacy}</p>
        </footer>
      </section>
    </div>}
  </>;
}
