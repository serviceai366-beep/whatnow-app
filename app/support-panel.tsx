"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadSupport, SupportRequestError, updateSupport } from "./support-client";
import type { SupportCategory, SupportConversation, SupportConversationDetail, SupportSnapshot, SupportStatus } from "./support-types";
import type { ProfileLanguage } from "./profile-types";

type Props = { open: boolean; locale: ProfileLanguage; onClose: () => void };

const copy = {
  en: {
    eyebrow: "WhatNow? support", title: "How can we help?", subtitle: "Send a question, report a bug, or suggest an improvement. Your messages stay private to your account.", close: "Close support", newTicket: "New request", allTickets: "Owner queue", myTickets: "My requests", loading: "Loading support…", loadError: "Support is temporarily unavailable. Please try again.", empty: "No requests yet.", emptyAdmin: "No support requests yet.", subject: "Short subject", subjectPlaceholder: "For example: I cannot upload a PDF", category: "Type of request", question: "Question", bug: "Bug or error", feature: "Feature request", message: "Message", messagePlaceholder: "Tell us what happened or what would make WhatNow? better…", create: "Send request", sending: "Sending…", cancel: "Cancel", reply: "Write a reply", replyPlaceholder: "Write your message…", send: "Send", status: "Status", open: "Open", waiting: "Waiting for you", resolved: "Resolved", member: "Account", privacy: "For your safety, do not send passwords, one-time codes, bank-card details, or full document contents here.", replyNotice: "Replies appear here only — we do not send a copy of the conversation by email.", user: "You", support: "WhatNow? support", noSelection: "Choose a request or start a new one.", retry: "Try again", limit: "You have reached the limit for this action. Please wait a few minutes and try again.", conversationLimit: "You already have the maximum number of open support requests.", messageLimit: "This conversation has reached its message limit. Start a new request if you need to continue.", forbidden: "You do not have permission to change this request.", notFound: "This request is no longer available.", requestSaved: "Your request has been sent.", replySaved: "Your reply has been sent.", statusSaved: "Status updated.", accountHint: "Sign in to send a private request to support.", badge: "Support",
  },
  ru: {
    eyebrow: "Поддержка WhatNow?", title: "Чем мы можем помочь?", subtitle: "Задайте вопрос, сообщите об ошибке или предложите улучшение. Ваши сообщения видны только вашему аккаунту и поддержке.", close: "Закрыть поддержку", newTicket: "Новое обращение", allTickets: "Очередь владельца", myTickets: "Мои обращения", loading: "Загружаем поддержку…", loadError: "Поддержка временно недоступна. Попробуйте ещё раз.", empty: "Пока нет обращений.", emptyAdmin: "Пока нет обращений в поддержку.", subject: "Короткая тема", subjectPlaceholder: "Например: не удаётся загрузить PDF", category: "Тип обращения", question: "Вопрос", bug: "Ошибка или баг", feature: "Предложение функции", message: "Сообщение", messagePlaceholder: "Расскажите, что произошло или что улучшило бы WhatNow?…", create: "Отправить обращение", sending: "Отправляем…", cancel: "Отмена", reply: "Написать ответ", replyPlaceholder: "Напишите сообщение…", send: "Отправить", status: "Статус", open: "Открыто", waiting: "Ждём вас", resolved: "Решено", member: "Аккаунт", privacy: "Для безопасности не отправляйте сюда пароли, одноразовые коды, данные банковской карты или полный текст документов.", replyNotice: "Ответы отображаются только здесь — копию переписки на email не отправляем.", user: "Вы", support: "Поддержка WhatNow?", noSelection: "Выберите обращение или создайте новое.", retry: "Попробовать снова", limit: "Лимит для этого действия исчерпан. Подождите несколько минут и попробуйте снова.", conversationLimit: "У вас уже максимальное количество обращений в поддержку.", messageLimit: "В этом обращении достигнут лимит сообщений. Если нужно продолжить, создайте новое обращение.", forbidden: "У вас нет прав для изменения этого обращения.", notFound: "Это обращение больше недоступно.", requestSaved: "Обращение отправлено.", replySaved: "Ответ отправлен.", statusSaved: "Статус обновлён.", accountHint: "Войдите в аккаунт, чтобы написать в поддержку приватно.", badge: "Поддержка",
  },
  lv: {
    eyebrow: "WhatNow? atbalsts", title: "Kā varam palīdzēt?", subtitle: "Uzdodiet jautājumu, ziņojiet par kļūdu vai iesakiet uzlabojumu. Jūsu ziņas ir redzamas tikai jūsu kontam un atbalstam.", close: "Aizvērt atbalstu", newTicket: "Jauns pieprasījums", allTickets: "Īpašnieka rinda", myTickets: "Mani pieprasījumi", loading: "Ielādējam atbalstu…", loadError: "Atbalsts īslaicīgi nav pieejams. Mēģiniet vēlreiz.", empty: "Pieprasījumu vēl nav.", emptyAdmin: "Atbalsta pieprasījumu vēl nav.", subject: "Īsa tēma", subjectPlaceholder: "Piemēram: nevaru augšupielādēt PDF", category: "Pieprasījuma veids", question: "Jautājums", bug: "Kļūda vai problēma", feature: "Funkcijas ieteikums", message: "Ziņa", messagePlaceholder: "Pastāstiet, kas notika vai kas uzlabotu WhatNow?…", create: "Nosūtīt pieprasījumu", sending: "Sūta…", cancel: "Atcelt", reply: "Rakstīt atbildi", replyPlaceholder: "Rakstiet ziņu…", send: "Nosūtīt", status: "Statuss", open: "Atvērts", waiting: "Gaida jūs", resolved: "Atrisināts", member: "Konts", privacy: "Drošībai nesūtiet šeit paroles, vienreizējos kodus, bankas kartes datus vai pilnu dokumentu saturu.", replyNotice: "Atbildes redzamas tikai šeit — sarakstes kopiju uz e-pastu nesūtām.", user: "Jūs", support: "WhatNow? atbalsts", noSelection: "Izvēlieties pieprasījumu vai sāciet jaunu.", retry: "Mēģināt vēlreiz", limit: "Šīs darbības limits ir sasniegts. Pagaidiet dažas minūtes un mēģiniet vēlreiz.", conversationLimit: "Jums jau ir maksimālais atbalsta pieprasījumu skaits.", messageLimit: "Šajā pieprasījumā ir sasniegts ziņu limits. Ja nepieciešams turpināt, izveidojiet jaunu pieprasījumu.", forbidden: "Jums nav tiesību mainīt šo pieprasījumu.", notFound: "Šis pieprasījums vairs nav pieejams.", requestSaved: "Pieprasījums ir nosūtīts.", replySaved: "Jūsu atbilde ir nosūtīta.", statusSaved: "Statuss atjaunināts.", accountHint: "Pierakstieties, lai privāti rakstītu atbalstam.", badge: "Atbalsts",
  },
} as const;

type SupportCopy = { [Key in keyof typeof copy.en]: string };

function errorText(code: string, t: SupportCopy): string {
  if (code === "support_rate_limited") return t.limit;
  if (code === "support_conversation_limit") return t.conversationLimit;
  if (code === "support_message_limit") return t.messageLimit;
  if (code === "forbidden") return t.forbidden;
  if (code === "support_not_found") return t.notFound;
  return t.loadError;
}

function localDate(value: number, locale: ProfileLanguage): string {
  const language = locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-GB";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(value: SupportStatus, t: SupportCopy): string {
  return value === "open" ? t.open : value === "waiting_for_user" ? t.waiting : t.resolved;
}

function categoryLabel(value: SupportCategory, t: SupportCopy): string {
  return value === "question" ? t.question : value === "bug" ? t.bug : t.feature;
}

export function SupportPanel({ open, locale, onClose }: Props) {
  const t = copy[locale];
  const [snapshot, setSnapshot] = useState<SupportSnapshot | null>(null);
  const [detail, setDetail] = useState<SupportConversationDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("question");
  const [newMessage, setNewMessage] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSummary = useMemo(
    () => snapshot?.conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [selectedId, snapshot],
  );

  const refresh = useCallback(async (conversationId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await loadSupport(conversationId ?? undefined);
      setSnapshot(payload.snapshot);
      setDetail(payload.conversation);
      if (conversationId && !payload.conversation) setSelectedId(null);
    } catch (cause) {
      setError(errorText(cause instanceof SupportRequestError ? cause.code : "support_error", copy[locale]));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (!open) return;
    setNotice(null);
    void refresh(selectedId);
  }, [open, refresh]); // Reload every opening so the queue cannot become stale.

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose, open]);

  const selectConversation = (conversation: SupportConversation) => {
    if (busy) return;
    setSelectedId(conversation.id);
    setReply("");
    setNotice(null);
    void refresh(conversation.id);
  };

  const startNew = () => {
    if (busy) return;
    setSelectedId(null);
    setDetail(null);
    setSubject("");
    setCategory("question");
    setNewMessage("");
    setError(null);
    setNotice(null);
  };

  const apply = async (kind: "create" | "reply" | "status", status?: SupportStatus) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = kind === "create"
        ? await updateSupport({ action: "create", subject, category, message: newMessage })
        : kind === "reply" && detail
          ? await updateSupport({ action: "reply", conversationId: detail.id, message: reply })
          : detail && status
            ? await updateSupport({ action: "set_status", conversationId: detail.id, status })
            : null;
      if (!result?.conversation) throw new SupportRequestError("invalid_support_response", 502);
      setSnapshot(result.snapshot);
      setDetail(result.conversation);
      setSelectedId(result.conversation.id);
      if (kind === "create") {
        setSubject("");
        setNewMessage("");
        setNotice(t.requestSaved);
      } else if (kind === "reply") {
        setReply("");
        setNotice(t.replySaved);
      } else {
        setNotice(t.statusSaved);
      }
    } catch (cause) {
      setError(errorText(cause instanceof SupportRequestError ? cause.code : "support_error", t));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return <div className="hub-backdrop support-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="support-panel" role="dialog" aria-modal="true" aria-labelledby="support-title">
      <header className="hub-panel-header support-panel-header">
        <div><p className="eyebrow">{t.eyebrow}</p><h2 id="support-title">{t.title}</h2><p>{t.subtitle}</p></div>
        <button className="icon-button" type="button" aria-label={t.close} disabled={busy} onClick={onClose}>×</button>
      </header>
      <div className="support-layout">
        <aside className="support-sidebar" aria-label={snapshot?.isAdmin ? t.allTickets : t.myTickets}>
          <div className="support-sidebar-actions"><strong>{snapshot?.isAdmin ? t.allTickets : t.myTickets}</strong><button type="button" className="primary-mini" disabled={busy} onClick={startNew}>+ {t.newTicket}</button></div>
          {loading && !snapshot ? <p className="panel-state">{t.loading}</p> : null}
          {!loading && snapshot?.conversations.length === 0 ? <p className="panel-state">{snapshot.isAdmin ? t.emptyAdmin : t.empty}</p> : null}
          <div className="support-conversation-list">
            {snapshot?.conversations.map((conversation) => <button key={conversation.id} type="button" className={`support-conversation-card ${conversation.id === selectedId ? "active" : ""}`} onClick={() => selectConversation(conversation)} disabled={busy}>
              <span className={`support-status support-status-${conversation.status}`}>{statusLabel(conversation.status, t)}</span>
              <strong>{conversation.subject}</strong>
              <small>{categoryLabel(conversation.category, t)} · {localDate(conversation.lastMessageAt, locale)}</small>
              {snapshot.isAdmin && conversation.ownerReference ? <em>{t.member}: {conversation.ownerReference.replace(/^Member\s/, "")}</em> : null}
              {conversation.lastMessagePreview ? <span>{conversation.lastMessagePreview}</span> : null}
            </button>)}
          </div>
        </aside>
        <div className="support-main">
          {error ? <div className="support-alert error" role="alert"><p>{error}</p><button type="button" onClick={() => void refresh(selectedId)} disabled={busy}>{t.retry}</button></div> : null}
          {notice ? <div className="support-alert success" role="status">{notice}</div> : null}
          {selectedId === null ? <form className="support-compose" onSubmit={(event) => { event.preventDefault(); void apply("create"); }}>
            <div className="support-form-heading"><h3>{t.newTicket}</h3><p>{t.privacy}</p></div>
            <label>{t.subject}<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={140} placeholder={t.subjectPlaceholder} required disabled={busy} /></label>
            <label>{t.category}<select value={category} onChange={(event) => setCategory(event.target.value as SupportCategory)} disabled={busy}><option value="question">{t.question}</option><option value="bug">{t.bug}</option><option value="feature">{t.feature}</option></select></label>
            <label>{t.message}<textarea value={newMessage} onChange={(event) => setNewMessage(event.target.value)} maxLength={4000} placeholder={t.messagePlaceholder} required disabled={busy} /></label>
            <div className="support-form-actions"><small>{newMessage.length}/4000</small><button className="primary-mini" type="submit" disabled={busy || !subject.trim() || !newMessage.trim()}>{busy ? t.sending : t.create}</button></div>
          </form> : detail ? <div className="support-thread">
            <div className="support-thread-heading"><div><span className={`support-status support-status-${detail.status}`}>{statusLabel(detail.status, t)}</span><h3>{detail.subject}</h3><p>{categoryLabel(detail.category, t)} · {localDate(detail.createdAt, locale)}</p></div>{snapshot?.isAdmin ? <label className="support-status-control">{t.status}<select value={detail.status} disabled={busy} onChange={(event) => void apply("status", event.target.value as SupportStatus)}><option value="open">{t.open}</option><option value="waiting_for_user">{t.waiting}</option><option value="resolved">{t.resolved}</option></select></label> : null}</div>
            <div className="support-messages" aria-live="polite">{detail.messages.map((message) => <article key={message.id} className={`support-message support-message-${message.sender}`}><header><strong>{message.sender === "support" ? t.support : t.user}</strong><time dateTime={new Date(message.createdAt).toISOString()}>{localDate(message.createdAt, locale)}</time></header><p>{message.body}</p></article>)}</div>
            <form className="support-reply" onSubmit={(event) => { event.preventDefault(); void apply("reply"); }}><label>{t.reply}<textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={4000} placeholder={t.replyPlaceholder} required disabled={busy} /></label><div className="support-form-actions"><small>{t.replyNotice}</small><button className="primary-mini" type="submit" disabled={busy || !reply.trim()}>{busy ? t.sending : t.send}</button></div></form>
          </div> : <p className="panel-state">{loading ? t.loading : t.noSelection}</p>}
        </div>
      </div>
    </section>
  </div>;
}
