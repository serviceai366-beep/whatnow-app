"use client";

import { useEffect, useState } from "react";
import type { ProfileLanguage } from "./profile-types";
import { interfaceCopyFallback } from "./language-options";
import {
  deleteAnalysisFromHistory,
  listAnalysisHistory,
  type AnalysisHistoryItem,
} from "./analysis-history";

const copy = {
  ru: { title: "История разборов", intro: "Здесь автоматически хранятся только последние 10 результатов — не исходные файлы и не вставленный текст.", close: "Закрыть историю", loading: "Загружаем историю…", empty: "Сохранённых разборов пока нет.", open: "Открыть", remove: "Удалить", confirm: "Удалить этот разбор без возможности восстановления?", error: "Не удалось загрузить историю. Попробуйте ещё раз.", deleteError: "Не удалось удалить разбор.", file: "Файл", text: "Текст" },
  lv: { title: "Analīžu vēsture", intro: "Automātiski tiek glabāti tikai pēdējie 10 rezultāti — ne sākotnējie faili vai ievadītais teksts.", close: "Aizvērt vēsturi", loading: "Ielādējam vēsturi…", empty: "Saglabātu analīžu vēl nav.", open: "Atvērt", remove: "Dzēst", confirm: "Neatgriezeniski dzēst šo analīzi?", error: "Neizdevās ielādēt vēsturi. Mēģiniet vēlreiz.", deleteError: "Neizdevās dzēst analīzi.", file: "Fails", text: "Teksts" },
  en: { title: "Analysis history", intro: "Only your latest 10 results are stored automatically — never the original files or pasted text.", close: "Close history", loading: "Loading history…", empty: "You have no saved analyses yet.", open: "Open", remove: "Delete", confirm: "Permanently delete this analysis?", error: "We could not load your history. Please try again.", deleteError: "We could not delete this analysis.", file: "File", text: "Text" },
} as const;

export function HistoryPanel({ locale, onClose, onOpen }: {
  locale: ProfileLanguage;
  onClose: () => void;
  onOpen: (item: AnalysisHistoryItem) => void;
}) {
  const t = copy[interfaceCopyFallback(locale)];
  const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listAnalysisHistory()
      .then((value) => { if (active) setItems(value); })
      .catch(() => { if (active) setError(t.error); })
      .finally(() => { if (active) setLoading(false); });
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => { active = false; document.removeEventListener("keydown", onKeyDown); };
  }, [onClose, t.error]);

  const remove = async (item: AnalysisHistoryItem) => {
    if (!window.confirm(t.confirm)) return;
    setDeletingId(item.id);
    setError(null);
    try {
      await deleteAnalysisFromHistory(item.id);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch {
      setError(t.deleteError);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="history-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="history-panel" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="history-heading">
          <div><p className="eyebrow">WhatNow?</p><h2 id="history-title">{t.title}</h2></div>
          <button type="button" aria-label={t.close} onClick={onClose}>×</button>
        </div>
        <p className="history-intro">{t.intro}</p>
        {loading && <p className="history-state" role="status">{t.loading}</p>}
        {error && <p className="history-error" role="alert">{error}</p>}
        {!loading && !error && items.length === 0 && <p className="history-state">{t.empty}</p>}
        <div className="history-list">
          {items.map((item) => (
            <article key={item.id}>
              <div>
                <span>{item.sourceKind === "file" ? t.file : t.text} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</span>
                <h3>{item.title}</h3>
                <p>{item.result.summary}</p>
              </div>
              <div className="history-item-actions">
                <button type="button" onClick={() => onOpen(item)}>{t.open}</button>
                <button className="danger" type="button" disabled={deletingId === item.id} onClick={() => remove(item)}>{t.remove}</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
