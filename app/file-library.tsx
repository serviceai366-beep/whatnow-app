"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteStoredFile, downloadStoredFile, FileClientError, loadStoredFile, loadStoredFiles, uploadStoredFile } from "./file-client";
import { formatFileSize, validateDocumentFile } from "./file-validation";
import type { FileStorageSnapshot, StoredUserFile } from "./file-store";
import type { ProfileLanguage } from "./profile-types";
import { interfaceCopyFallback } from "./language-options";

const copy = {
  en: { title: "My files", intro: "Private copies saved to your account. They are never published.", files: "files", storage: "storage", remaining: "remaining", add: "Save a file", uploading: "Saving…", use: "Use for analysis", preparing: "Preparing…", download: "Download", remove: "Delete", empty: "No saved files yet.", loadError: "Could not load your private files.", invalid: "Choose a supported PDF, photo, TXT, RTF, DOCX or ODT file.", saved: "File saved privately.", duplicate: "This file was already saved.", countLimit: "The 10-file limit is full. Delete a file before adding another.", bytesLimit: "The 25 MB storage limit is full. Delete files before adding another.", uploadLimit: "The 24-hour upload safety limit was reached. Try again later.", generic: "Could not save this file.", deleteConfirm: "Delete this saved file? This cannot be undone." },
  ru: { title: "Мои файлы", intro: "Приватные копии, сохранённые в аккаунте. Они никогда не публикуются.", files: "файлы", storage: "хранилище", remaining: "свободно", add: "Сохранить файл", uploading: "Сохраняем…", use: "Использовать для анализа", preparing: "Подготавливаем…", download: "Скачать", remove: "Удалить", empty: "Сохранённых файлов пока нет.", loadError: "Не удалось загрузить приватные файлы.", invalid: "Выберите поддерживаемый PDF, фото, TXT, RTF, DOCX или ODT.", saved: "Файл сохранён приватно.", duplicate: "Этот файл уже был сохранён.", countLimit: "Лимит в 10 файлов заполнен. Удалите файл перед добавлением нового.", bytesLimit: "Лимит хранилища 25 МБ заполнен. Освободите место.", uploadLimit: "Достигнут защитный лимит загрузок за 24 часа. Попробуйте позже.", generic: "Не удалось сохранить файл.", deleteConfirm: "Удалить сохранённый файл? Это действие нельзя отменить." },
  lv: { title: "Mani faili", intro: "Privātas kopijas, kas saglabātas kontā. Tās nekad netiek publicētas.", files: "faili", storage: "krātuve", remaining: "atlikums", add: "Saglabāt failu", uploading: "Saglabā…", use: "Izmantot analīzei", preparing: "Sagatavo…", download: "Lejupielādēt", remove: "Dzēst", empty: "Saglabātu failu vēl nav.", loadError: "Neizdevās ielādēt privātos failus.", invalid: "Izvēlieties atbalstītu PDF, fotoattēlu, TXT, RTF, DOCX vai ODT failu.", saved: "Fails saglabāts privāti.", duplicate: "Šis fails jau bija saglabāts.", countLimit: "10 failu limits ir pilns. Pirms jauna faila pievienošanas izdzēsiet kādu failu.", bytesLimit: "25 MB krātuves limits ir pilns. Atbrīvojiet vietu.", uploadLimit: "Sasniegts 24 stundu augšupielādes drošības limits. Mēģiniet vēlāk.", generic: "Neizdevās saglabāt failu.", deleteConfirm: "Dzēst saglabāto failu? Šo darbību nevar atsaukt." },
} as const;

export function FileLibrary({ locale, onUseFile }: { locale: ProfileLanguage; onUseFile?: (file: File) => void }) {
  const t = copy[interfaceCopyFallback(locale)];
  const input = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<FileStorageSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => { try { setSnapshot(await loadStoredFiles()); setError(null); } catch { setError(t.loadError); } }, [t.loadError]);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);
  const messageFor = (value: unknown) => value instanceof FileClientError && value.code === "file_count_limit" ? t.countLimit : value instanceof FileClientError && value.code === "file_bytes_limit" ? t.bytesLimit : value instanceof FileClientError && value.code === "upload_bytes_limit" ? t.uploadLimit : t.generic;
  const upload = async (file: File) => {
    if (!validateDocumentFile(file).ok) { setError(t.invalid); return; }
    setBusy("upload"); setError(null); setNotice(null);
    try { const result = await uploadStoredFile(file); setNotice(result.deduplicated ? t.duplicate : t.saved); await refresh(); }
    catch (uploadError) { setError(messageFor(uploadError)); }
    finally { setBusy(null); if (input.current) input.current.value = ""; }
  };
  const remove = async (file: StoredUserFile) => {
    if (!window.confirm(t.deleteConfirm)) return;
    setBusy(file.id); setError(null);
    try { await deleteStoredFile(file.id); await refresh(); }
    catch { setError(t.generic); }
    finally { setBusy(null); }
  };
  const use = async (file: StoredUserFile) => {
    setBusy(`use:${file.id}`); setError(null);
    try { onUseFile?.(await loadStoredFile(file)); }
    catch { setError(t.generic); }
    finally { setBusy(null); }
  };
  const countPct = snapshot ? Math.min(100, snapshot.usage.count / snapshot.usage.countLimit * 100) : 0;
  const bytePct = snapshot ? Math.min(100, snapshot.usage.bytes / snapshot.usage.bytesLimit * 100) : 0;

  return <section className="file-library" aria-labelledby="file-library-title"><header><div><h3 id="file-library-title">{t.title}</h3><p>{t.intro}</p></div><input ref={input} type="file" className="visually-hidden" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,application/rtf,text/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,.pdf,.jpg,.jpeg,.png,.webp,.txt,.rtf,.docx,.odt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /><button className="primary-mini" type="button" disabled={busy === "upload" || !snapshot || snapshot.usage.remainingCount <= 0 || snapshot.usage.remainingBytes <= 0} onClick={() => input.current?.click()}>{busy === "upload" ? t.uploading : `+ ${t.add}`}</button></header>{snapshot && <div className="file-quota"><div><span><strong>{snapshot.usage.count}</strong> / {snapshot.usage.countLimit} {t.files}</span><small>{snapshot.usage.remainingCount} {t.remaining}</small><progress max="100" value={countPct} /></div><div><span><strong>{formatFileSize(snapshot.usage.bytes, locale)}</strong> / {formatFileSize(snapshot.usage.bytesLimit, locale)}</span><small>{formatFileSize(snapshot.usage.remainingBytes, locale)} {t.remaining}</small><progress max="100" value={bytePct} /></div></div>}{snapshot && snapshot.files.length === 0 ? <p className="panel-state">{t.empty}</p> : <ul className="file-list">{snapshot?.files.map((file) => <li key={file.id}><div className="file-type" aria-hidden="true">{file.extension.toUpperCase()}</div><div><strong title={file.originalName}>{file.originalName}</strong><span>{formatFileSize(file.sizeBytes, locale)} · {new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-GB", { dateStyle: "medium" }).format(new Date(file.createdAt))}</span></div><div>{onUseFile && <button type="button" disabled={Boolean(busy)} onClick={() => void use(file)}>{busy === `use:${file.id}` ? t.preparing : t.use}</button>}<button type="button" disabled={Boolean(busy)} onClick={() => void downloadStoredFile(file)}>{t.download}</button><button className="danger-link" type="button" disabled={Boolean(busy)} onClick={() => void remove(file)}>{t.remove}</button></div></li>)}</ul>}{notice && <p className="hub-notice" role="status">✓ {notice}</p>}{error && <p className="hub-error" role="alert">{error}</p>}</section>;
}
