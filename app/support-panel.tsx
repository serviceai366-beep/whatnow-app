"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadSupport, openSupportAttachment, SupportRequestError, updateSupport } from "./support-client";
import type { SupportCategory, SupportConversation, SupportConversationDetail, SupportPriority, SupportSnapshot, SupportStatus } from "./support-types";
import type { ProfileLanguage } from "./profile-types";
import { interfaceCopyFallback } from "./language-options";

type Props = { open: boolean; locale: ProfileLanguage; onClose: () => void };

const copy = {
  en: {
    eyebrow: "WhatNow? support", title: "How can we help?", subtitle: "Send a question, report a bug, or suggest an improvement. Your messages stay private to your account.", close: "Close support", newTicket: "New request", allTickets: "Owner queue", myTickets: "My requests", loading: "Loading support…", loadError: "Support is temporarily unavailable. Please try again.", empty: "No requests yet.", emptyAdmin: "No support requests yet.", subject: "Short subject", subjectPlaceholder: "For example: I cannot upload a PDF", category: "Type of request", question: "Question", bug: "Bug or error", feature: "Feature request", message: "Message", messagePlaceholder: "Tell us what happened or what would make WhatNow? better…", create: "Send request", sending: "Sending…", cancel: "Cancel", reply: "Write a reply", replyPlaceholder: "Write your message…", send: "Send", status: "Status", open: "Open", waiting: "Waiting for you", resolved: "Resolved", member: "Account", privacy: "For your safety, do not send passwords, one-time codes, bank-card details, or full document contents here.", replyNotice: "Replies stay securely inside the app.", emailReplyNotice: "We will email you when support replies. The conversation itself stays private in the app.", user: "You", support: "WhatNow? support", noSelection: "Choose a request or start a new one.", retry: "Try again", limit: "You have reached the limit for this action. Please wait a few minutes and try again.", conversationLimit: "You already have the maximum number of open support requests.", messageLimit: "This conversation has reached its message limit. Start a new request if you need to continue.", forbidden: "You do not have permission to change this request.", notFound: "This request is no longer available.", requestSaved: "Your request has been sent.", replySaved: "Your reply has been sent.", statusSaved: "Status updated.", prioritySaved: "Priority updated.", accountHint: "Sign in to send a private request to support.", badge: "Support", search: "Search requests", priority: "Priority", low: "Low", normal: "Normal", high: "High", urgent: "Urgent", attachments: "Screenshots", chooseAttachments: "Choose screenshots", noAttachments: "No screenshots selected", selectedAttachments: "{count} screenshots selected", attachmentHint: "Up to 2 JPG, PNG, or WebP images, 3 MB each.", remove: "Remove", openAttachment: "Open screenshot", attachmentError: "The message was sent, but a screenshot could not be saved. Please try attaching it again.", emailError: "The message was saved, but the email notification could not be sent.", invalidAttachment: "Choose up to 2 JPG, PNG, or WebP images, no larger than 3 MB each.", noSearchResults: "No requests match your search.",
  },
  ru: {
    eyebrow: "Поддержка WhatNow?", title: "Чем мы можем помочь?", subtitle: "Задайте вопрос, сообщите об ошибке или предложите улучшение. Ваши сообщения видны только вашему аккаунту и поддержке.", close: "Закрыть поддержку", newTicket: "Новое обращение", allTickets: "Очередь владельца", myTickets: "Мои обращения", loading: "Загружаем поддержку…", loadError: "Поддержка временно недоступна. Попробуйте ещё раз.", empty: "Пока нет обращений.", emptyAdmin: "Пока нет обращений в поддержку.", subject: "Короткая тема", subjectPlaceholder: "Например: не удаётся загрузить PDF", category: "Тип обращения", question: "Вопрос", bug: "Ошибка или баг", feature: "Предложение функции", message: "Сообщение", messagePlaceholder: "Расскажите, что произошло или что улучшило бы WhatNow?…", create: "Отправить обращение", sending: "Отправляем…", cancel: "Отмена", reply: "Написать ответ", replyPlaceholder: "Напишите сообщение…", send: "Отправить", status: "Статус", open: "Открыто", waiting: "Ждём вас", resolved: "Решено", member: "Аккаунт", privacy: "Для безопасности не отправляйте сюда пароли, одноразовые коды, данные банковской карты или полный текст документов.", replyNotice: "Ответы безопасно хранятся внутри приложения.", emailReplyNotice: "Мы пришлём email, когда поддержка ответит. Сама переписка останется приватной внутри приложения.", user: "Вы", support: "Поддержка WhatNow?", noSelection: "Выберите обращение или создайте новое.", retry: "Попробовать снова", limit: "Лимит для этого действия исчерпан. Подождите несколько минут и попробуйте снова.", conversationLimit: "У вас уже максимальное количество обращений в поддержку.", messageLimit: "В этом обращении достигнут лимит сообщений. Если нужно продолжить, создайте новое обращение.", forbidden: "У вас нет прав для изменения этого обращения.", notFound: "Это обращение больше недоступно.", requestSaved: "Обращение отправлено.", replySaved: "Ответ отправлен.", statusSaved: "Статус обновлён.", prioritySaved: "Приоритет обновлён.", accountHint: "Войдите в аккаунт, чтобы написать в поддержку приватно.", badge: "Поддержка", search: "Поиск обращений", priority: "Приоритет", low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочный", attachments: "Скриншоты", chooseAttachments: "Выбрать скриншоты", noAttachments: "Скриншоты не выбраны", selectedAttachments: "Выбрано скриншотов: {count}", attachmentHint: "До 2 изображений JPG, PNG или WebP, не более 3 МБ каждое.", remove: "Удалить", openAttachment: "Открыть скриншот", attachmentError: "Сообщение отправлено, но скриншот сохранить не удалось. Попробуйте прикрепить его ещё раз.", emailError: "Сообщение сохранено, но email-уведомление отправить не удалось.", invalidAttachment: "Выберите до 2 изображений JPG, PNG или WebP, не более 3 МБ каждое.", noSearchResults: "По вашему запросу ничего не найдено.",
  },
  lv: {
    eyebrow: "WhatNow? atbalsts", title: "Kā varam palīdzēt?", subtitle: "Uzdodiet jautājumu, ziņojiet par kļūdu vai iesakiet uzlabojumu. Jūsu ziņas ir redzamas tikai jūsu kontam un atbalstam.", close: "Aizvērt atbalstu", newTicket: "Jauns pieprasījums", allTickets: "Īpašnieka rinda", myTickets: "Mani pieprasījumi", loading: "Ielādējam atbalstu…", loadError: "Atbalsts īslaicīgi nav pieejams. Mēģiniet vēlreiz.", empty: "Pieprasījumu vēl nav.", emptyAdmin: "Atbalsta pieprasījumu vēl nav.", subject: "Īsa tēma", subjectPlaceholder: "Piemēram: nevaru augšupielādēt PDF", category: "Pieprasījuma veids", question: "Jautājums", bug: "Kļūda vai problēma", feature: "Funkcijas ieteikums", message: "Ziņa", messagePlaceholder: "Pastāstiet, kas notika vai kas uzlabotu WhatNow?…", create: "Nosūtīt pieprasījumu", sending: "Sūta…", cancel: "Atcelt", reply: "Rakstīt atbildi", replyPlaceholder: "Rakstiet ziņu…", send: "Nosūtīt", status: "Statuss", open: "Atvērts", waiting: "Gaida jūs", resolved: "Atrisināts", member: "Konts", privacy: "Drošībai nesūtiet šeit paroles, vienreizējos kodus, bankas kartes datus vai pilnu dokumentu saturu.", replyNotice: "Atbildes droši glabājas lietotnē.", emailReplyNotice: "Mēs nosūtīsim e-pastu, kad atbalsts atbildēs. Sarakste paliks privāta lietotnē.", user: "Jūs", support: "WhatNow? atbalsts", noSelection: "Izvēlieties pieprasījumu vai sāciet jaunu.", retry: "Mēģināt vēlreiz", limit: "Šīs darbības limits ir sasniegts. Pagaidiet dažas minūtes un mēģiniet vēlreiz.", conversationLimit: "Jums jau ir maksimālais atbalsta pieprasījumu skaits.", messageLimit: "Šajā pieprasījumā ir sasniegts ziņu limits. Ja nepieciešams turpināt, izveidojiet jaunu pieprasījumu.", forbidden: "Jums nav tiesību mainīt šo pieprasījumu.", notFound: "Šis pieprasījums vairs nav pieejams.", requestSaved: "Pieprasījums ir nosūtīts.", replySaved: "Jūsu atbilde ir nosūtīta.", statusSaved: "Statuss atjaunināts.", prioritySaved: "Prioritāte atjaunināta.", accountHint: "Pierakstieties, lai privāti rakstītu atbalstam.", badge: "Atbalsts", search: "Meklēt pieprasījumus", priority: "Prioritāte", low: "Zema", normal: "Parasta", high: "Augsta", urgent: "Steidzama", attachments: "Ekrānuzņēmumi", chooseAttachments: "Izvēlēties ekrānuzņēmumus", noAttachments: "Ekrānuzņēmumi nav izvēlēti", selectedAttachments: "Izvēlēti ekrānuzņēmumi: {count}", attachmentHint: "Līdz 2 JPG, PNG vai WebP attēliem, ne vairāk kā 3 MB katram.", remove: "Noņemt", openAttachment: "Atvērt ekrānuzņēmumu", attachmentError: "Ziņa tika nosūtīta, bet ekrānuzņēmumu neizdevās saglabāt. Mēģiniet to pievienot vēlreiz.", emailError: "Ziņa tika saglabāta, bet e-pasta paziņojumu neizdevās nosūtīt.", invalidAttachment: "Izvēlieties līdz 2 JPG, PNG vai WebP attēliem, ne vairāk kā 3 MB katram.", noSearchResults: "Neviens pieprasījums neatbilst meklējumam.",
  },
} as const;

const lifecycleCopy = {
  en: {
    emptyAdmin: "No active support requests. Resolved requests are hidden from this queue.",
    resolvedForUser: "Resolved — support marked this problem as fixed. Reply here if you still need help; the request will reopen automatically.",
    resolvedHidden: "Marked as resolved and removed from the owner queue.",
    deleteRequest: "Delete request",
    deleteTitle: "Delete this request permanently?",
    deleteBody: "The request, every message, and all screenshots will be erased. This cannot be undone.",
    deletePermanently: "Delete permanently",
    deleting: "Deleting…",
    deleted: "The support request was permanently deleted.",
  },
  ru: {
    emptyAdmin: "Активных обращений нет. Решённые обращения скрыты из этой очереди.",
    resolvedForUser: "Решено — поддержка отметила проблему как устранённую. Если помощь всё ещё нужна, ответьте здесь: обращение откроется снова автоматически.",
    resolvedHidden: "Обращение отмечено как решённое и убрано из очереди владельца.",
    deleteRequest: "Удалить обращение",
    deleteTitle: "Удалить это обращение навсегда?",
    deleteBody: "Обращение, все сообщения и скриншоты будут стёрты. Это действие нельзя отменить.",
    deletePermanently: "Удалить навсегда",
    deleting: "Удаляем…",
    deleted: "Обращение в поддержку безвозвратно удалено.",
  },
  lv: {
    emptyAdmin: "Nav aktīvu atbalsta pieprasījumu. Atrisinātie pieprasījumi šajā rindā ir paslēpti.",
    resolvedForUser: "Atrisināts — atbalsts atzīmēja problēmu kā novērstu. Ja palīdzība vēl ir vajadzīga, atbildiet šeit; pieprasījums automātiski tiks atvērts no jauna.",
    resolvedHidden: "Pieprasījums atzīmēts kā atrisināts un noņemts no īpašnieka rindas.",
    deleteRequest: "Dzēst pieprasījumu",
    deleteTitle: "Neatgriezeniski dzēst šo pieprasījumu?",
    deleteBody: "Pieprasījums, visas ziņas un ekrānuzņēmumi tiks dzēsti. Šo darbību nevar atsaukt.",
    deletePermanently: "Dzēst neatgriezeniski",
    deleting: "Dzēš…",
    deleted: "Atbalsta pieprasījums ir neatgriezeniski izdzēsts.",
  },
} as const;

type SupportCopy = { [Key in keyof typeof copy.en]: string } & { [Key in keyof typeof lifecycleCopy.en]: string };

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

function priorityLabel(value: SupportPriority, t: SupportCopy): string {
  return value === "low" ? t.low : value === "high" ? t.high : value === "urgent" ? t.urgent : t.normal;
}

function validAttachments(files: File[]): boolean {
  return files.length <= 2 && files.every((file) => file.size > 0 && file.size <= 3 * 1024 * 1024
    && (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp"));
}

function attachmentSelection(files: File[], t: SupportCopy): string {
  if (files.length === 0) return t.noAttachments;
  if (files.length === 1) return files[0]?.name ?? t.selectedAttachments.replace("{count}", "1");
  return t.selectedAttachments.replace("{count}", String(files.length));
}

export function SupportPanel({ open, locale, onClose }: Props) {
  const supportLocale = interfaceCopyFallback(locale);
  const t = useMemo<SupportCopy>(() => ({ ...copy[supportLocale], ...lifecycleCopy[supportLocale] }), [supportLocale]);
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
  const [search, setSearch] = useState("");
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    if (!query) return snapshot?.conversations ?? [];
    return (snapshot?.conversations ?? []).filter((conversation) => [conversation.subject, conversation.lastMessagePreview,
      conversation.ownerReference, categoryLabel(conversation.category, t), statusLabel(conversation.status, t), priorityLabel(conversation.priority, t)]
      .some((value) => value?.toLocaleLowerCase(locale).includes(query)));
  }, [locale, search, snapshot, t]);

  const refresh = useCallback(async (conversationId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await loadSupport(conversationId ?? undefined);
      setSnapshot(payload.snapshot);
      setDetail(payload.conversation);
      if (conversationId && !payload.conversation) setSelectedId(null);
    } catch (cause) {
      setError(errorText(cause instanceof SupportRequestError ? cause.code : "support_error", t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(selectedId);
    // The selected conversation is intentionally read only when the panel opens; clicks call refresh directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setReplyAttachments([]);
    setConfirmDelete(false);
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
    setNewAttachments([]);
    setConfirmDelete(false);
    setError(null);
    setNotice(null);
  };

  const apply = async (kind: "create" | "reply" | "status" | "priority" | "delete", value?: SupportStatus | SupportPriority) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = kind === "create"
        ? await updateSupport({ action: "create", subject, category, message: newMessage, locale: supportLocale }, newAttachments)
        : kind === "reply" && detail
          ? await updateSupport({ action: "reply", conversationId: detail.id, message: reply, locale: supportLocale }, replyAttachments)
          : kind === "status" && detail && value
            ? await updateSupport({ action: "set_status", conversationId: detail.id, status: value as SupportStatus })
            : kind === "priority" && detail && value
              ? await updateSupport({ action: "set_priority", conversationId: detail.id, priority: value as SupportPriority })
              : kind === "delete" && detail
                ? await updateSupport({ action: "delete", conversationId: detail.id })
              : null;
      if (!result) throw new SupportRequestError("invalid_support_response", 502);
      setSnapshot(result.snapshot);
      if (kind === "delete") {
        setDetail(null);
        setSelectedId(null);
        setConfirmDelete(false);
        setNotice(t.deleted);
        return;
      }
      if (!result.conversation) throw new SupportRequestError("invalid_support_response", 502);
      if (kind === "status" && value === "resolved" && result.snapshot.isAdmin) {
        setDetail(null);
        setSelectedId(null);
        setConfirmDelete(false);
        setNotice(t.resolvedHidden);
        return;
      }
      setDetail(result.conversation);
      setSelectedId(result.conversation.id);
      if (kind === "create") {
        setSubject("");
        setNewMessage("");
        setNewAttachments([]);
        setNotice(t.requestSaved);
      } else if (kind === "reply") {
        setReply("");
        setReplyAttachments([]);
        setNotice(t.replySaved);
      } else if (kind === "status") {
        setNotice(t.statusSaved);
      } else {
        setNotice(t.prioritySaved);
      }
      if (result.attachmentWarning) setError(t.attachmentError);
      else if (result.notificationWarning) setError(t.emailError);
    } catch (cause) {
      setError(errorText(cause instanceof SupportRequestError ? cause.code : "support_error", t));
    } finally {
      setBusy(false);
    }
  };

  const chooseAttachments = (files: File[], target: "new" | "reply") => {
    if (!validAttachments(files)) {
      setError(t.invalidAttachment);
      return;
    }
    setError(null);
    if (target === "new") setNewAttachments(files);
    else setReplyAttachments(files);
  };

  const viewAttachment = async (id: string, name: string) => {
    try { await openSupportAttachment(id, name); }
    catch { setError(t.attachmentError); }
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
          <label className="support-search"><span className="sr-only">{t.search}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} /></label>
          {loading && !snapshot ? <p className="panel-state">{t.loading}</p> : null}
          {!loading && snapshot?.conversations.length === 0 ? <p className="panel-state">{snapshot.isAdmin ? t.emptyAdmin : t.empty}</p> : null}
          {!loading && snapshot && snapshot.conversations.length > 0 && filteredConversations.length === 0 ? <p className="panel-state">{t.noSearchResults}</p> : null}
          <div className="support-conversation-list">
            {filteredConversations.map((conversation) => <button key={conversation.id} type="button" className={`support-conversation-card ${conversation.id === selectedId ? "active" : ""}`} onClick={() => selectConversation(conversation)} disabled={busy}>
              <span className="support-card-badges"><span className={`support-status support-status-${conversation.status}`}>{statusLabel(conversation.status, t)}</span>{snapshot?.isAdmin ? <span className={`support-priority support-priority-${conversation.priority}`}>{priorityLabel(conversation.priority, t)}</span> : null}</span>
              <strong>{conversation.subject}</strong>
              <small>{categoryLabel(conversation.category, t)} · {localDate(conversation.lastMessageAt, locale)}</small>
              {snapshot?.isAdmin && conversation.ownerReference ? <em>{t.member}: {conversation.ownerReference.replace(/^Member\s/, "")}</em> : null}
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
            <label className="support-file-input"><span>{t.attachments}</span><span className="support-file-picker"><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(event) => chooseAttachments(Array.from(event.target.files ?? []), "new")} /><span className="support-file-button">{t.chooseAttachments}</span><span className="support-file-selection" aria-live="polite">{attachmentSelection(newAttachments, t)}</span></span><small>{t.attachmentHint}</small></label>
            {newAttachments.length ? <div className="support-file-chips">{newAttachments.map((file, index) => <span key={`${file.name}-${file.size}`}><b>{file.name}</b><button type="button" onClick={() => setNewAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>{t.remove}</button></span>)}</div> : null}
            <div className="support-form-actions"><small>{newMessage.length}/4000</small><button className="primary-mini" type="submit" disabled={busy || !subject.trim() || !newMessage.trim()}>{busy ? t.sending : t.create}</button></div>
          </form> : detail ? <div className="support-thread">
            <div className="support-thread-heading">
              <div>
                <span className={`support-status support-status-${detail.status}`}>{statusLabel(detail.status, t)}</span>
                <h3>{detail.subject}</h3>
                <p>{categoryLabel(detail.category, t)} · {localDate(detail.createdAt, locale)}</p>
                {!snapshot?.isAdmin && detail.status === "resolved" ? <div className="support-resolved-note" role="status">{t.resolvedForUser}</div> : null}
              </div>
              {snapshot?.isAdmin ? <div className="support-admin-column">
                <div className="support-admin-controls">
                  <label className="support-status-control">{t.status}<select value={detail.status} disabled={busy} onChange={(event) => void apply("status", event.target.value as SupportStatus)}><option value="open">{t.open}</option><option value="waiting_for_user">{t.waiting}</option><option value="resolved">{t.resolved}</option></select></label>
                  <label className="support-status-control">{t.priority}<select value={detail.priority} disabled={busy} onChange={(event) => void apply("priority", event.target.value as SupportPriority)}><option value="low">{t.low}</option><option value="normal">{t.normal}</option><option value="high">{t.high}</option><option value="urgent">{t.urgent}</option></select></label>
                  <button className="support-delete-button" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>{t.deleteRequest}</button>
                </div>
                {confirmDelete ? <div className="support-delete-confirm" role="alertdialog" aria-labelledby="support-delete-title" aria-describedby="support-delete-description">
                  <strong id="support-delete-title">{t.deleteTitle}</strong>
                  <p id="support-delete-description">{t.deleteBody}</p>
                  <div><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>{t.cancel}</button><button className="danger" type="button" disabled={busy} onClick={() => void apply("delete")}>{busy ? t.deleting : t.deletePermanently}</button></div>
                </div> : null}
              </div> : null}
            </div>
            <div className="support-messages" aria-live="polite">{detail.messages.map((message) => <article key={message.id} className={`support-message support-message-${message.sender}`}><header><strong>{message.sender === "support" ? t.support : t.user}</strong><time dateTime={new Date(message.createdAt).toISOString()}>{localDate(message.createdAt, locale)}</time></header><p>{message.body}</p>{message.attachments.length ? <div className="support-message-attachments">{message.attachments.map((attachment) => <button type="button" key={attachment.id} onClick={() => void viewAttachment(attachment.id, attachment.name)}><span aria-hidden="true">▧</span> {t.openAttachment}: {attachment.name}</button>)}</div> : null}</article>)}</div>
            <form className="support-reply" onSubmit={(event) => { event.preventDefault(); void apply("reply"); }}><label>{t.reply}<textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={4000} placeholder={t.replyPlaceholder} required disabled={busy} /></label><label className="support-file-input"><span>{t.attachments}</span><span className="support-file-picker"><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(event) => chooseAttachments(Array.from(event.target.files ?? []), "reply")} /><span className="support-file-button">{t.chooseAttachments}</span><span className="support-file-selection" aria-live="polite">{attachmentSelection(replyAttachments, t)}</span></span><small>{t.attachmentHint}</small></label>{replyAttachments.length ? <div className="support-file-chips">{replyAttachments.map((file, index) => <span key={`${file.name}-${file.size}`}><b>{file.name}</b><button type="button" onClick={() => setReplyAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>{t.remove}</button></span>)}</div> : null}<div className="support-form-actions"><small>{snapshot?.emailNotificationsEnabled ? t.emailReplyNotice : t.replyNotice}</small><button className="primary-mini" type="submit" disabled={busy || !reply.trim()}>{busy ? t.sending : t.send}</button></div></form>
          </div> : <p className="panel-state">{loading ? t.loading : t.noSelection}</p>}
        </div>
      </div>
    </section>
  </div>;
}
