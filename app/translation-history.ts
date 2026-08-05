import { supportedLanguages, type SupportedLanguage } from "./analysis-schema.ts";
import type { TranslationResult, TranslationVariant, TranslationVariantStyle } from "./translation-schema.ts";

export const TRANSLATION_HISTORY_LIMIT = 10;

const STORAGE_PREFIX = "whatnow.translation-history.v1";
const MAX_SOURCE_PREVIEW_LENGTH = 240;

export type TranslationHistoryItem = {
  id: string;
  createdAt: string;
  sourceKind: "text" | "file";
  sourceName: string;
  sourcePreview: string;
  result: TranslationResult;
};

export type SaveTranslationHistoryInput = {
  result: TranslationResult;
  sourceKind: "text" | "file";
  sourceName?: string;
  sourcePreview?: string;
};

function storageKey(accountId: string): string {
  return `${STORAGE_PREFIX}.${encodeURIComponent(accountId)}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && (supportedLanguages as readonly string[]).includes(value);
}

function isSourceLanguage(value: unknown): value is TranslationResult["sourceLanguage"] {
  return value === "unknown" || isSupportedLanguage(value);
}

function isVariantStyle(value: unknown): value is TranslationVariantStyle {
  return value === "literal" || value === "conversational" || value === "official" || value === "bold" || value === "alternative";
}

function parseVariant(value: unknown): TranslationVariant | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!isVariantStyle(candidate.style)) return null;
  if (typeof candidate.label !== "string" || candidate.label.trim().length === 0 || candidate.label.length > 80) return null;
  if (typeof candidate.translation !== "string" || candidate.translation.trim().length === 0 || candidate.translation.length > 100_000) return null;
  if (typeof candidate.transcription !== "string" || candidate.transcription.length > 4_000) return null;
  if (typeof candidate.backTranslation !== "string" || candidate.backTranslation.trim().length === 0 || candidate.backTranslation.length > 100_000) return null;
  return {
    style: candidate.style,
    label: candidate.label,
    translation: candidate.translation,
    transcription: candidate.transcription,
    backTranslation: candidate.backTranslation,
  };
}

function parseResult(value: unknown): TranslationResult | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== "1.1" || !isSourceLanguage(candidate.sourceLanguage) || !isSupportedLanguage(candidate.targetLanguage)) return null;
  if (typeof candidate.translation !== "string" || candidate.translation.trim().length === 0 || candidate.translation.length > 100_000) return null;
  if (typeof candidate.transcription !== "string" || candidate.transcription.length > 4_000) return null;
  if (!Array.isArray(candidate.variants) || candidate.variants.length < 1 || candidate.variants.length > 5) return null;
  const variants = candidate.variants.map(parseVariant);
  if (variants.some((variant): variant is null => variant === null)) return null;
  if (!Array.isArray(candidate.notes) || candidate.notes.length > 6 || !candidate.notes.every((note) => typeof note === "string" && note.length <= 500)) return null;
  if (!Array.isArray(candidate.uncertainties) || candidate.uncertainties.length > 6 || !candidate.uncertainties.every((note) => typeof note === "string" && note.length <= 500)) return null;
  return {
    schemaVersion: "1.1",
    sourceLanguage: candidate.sourceLanguage,
    targetLanguage: candidate.targetLanguage,
    translation: candidate.translation,
    transcription: candidate.transcription,
    variants: variants as TranslationVariant[],
    notes: candidate.notes,
    uncertainties: candidate.uncertainties,
  };
}

function parseItem(value: unknown): TranslationHistoryItem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const result = parseResult(candidate.result);
  if (!result || typeof candidate.id !== "string" || candidate.id.length < 1 || candidate.id.length > 120) return null;
  if (typeof candidate.createdAt !== "string" || !Number.isFinite(Date.parse(candidate.createdAt))) return null;
  if (candidate.sourceKind !== "text" && candidate.sourceKind !== "file") return null;
  return {
    id: candidate.id,
    createdAt: candidate.createdAt,
    sourceKind: candidate.sourceKind,
    sourceName: boundedText(candidate.sourceName, 180),
    sourcePreview: boundedText(candidate.sourcePreview, MAX_SOURCE_PREVIEW_LENGTH),
    result,
  };
}

function writeHistory(accountId: string, items: TranslationHistoryItem[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(storageKey(accountId), JSON.stringify(items.slice(0, TRANSLATION_HISTORY_LIMIT)));
  } catch {
    // Local history is optional. A full or disabled browser store must not
    // interrupt an otherwise successful translation.
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function listTranslationHistory(accountId: string): TranslationHistoryItem[] {
  if (!accountId) return [];
  const storage = getStorage();
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(storageKey(accountId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const items = parsed.map(parseItem).filter((item): item is TranslationHistoryItem => item !== null);
    if (items.length !== parsed.length || items.length > TRANSLATION_HISTORY_LIMIT) writeHistory(accountId, items);
    return items.slice(0, TRANSLATION_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveTranslationHistory(accountId: string, input: SaveTranslationHistoryInput): TranslationHistoryItem | null {
  if (!accountId) return null;
  const item: TranslationHistoryItem = {
    id: createId(),
    createdAt: new Date().toISOString(),
    sourceKind: input.sourceKind,
    sourceName: boundedText(input.sourceName, 180),
    sourcePreview: boundedText(input.sourcePreview, MAX_SOURCE_PREVIEW_LENGTH).replace(/\s+/g, " ").trim(),
    result: input.result,
  };
  writeHistory(accountId, [item, ...listTranslationHistory(accountId)]);
  return item;
}

export function updateTranslationHistory(accountId: string, id: string, result: TranslationResult): void {
  if (!accountId || !id) return;
  const items = listTranslationHistory(accountId);
  writeHistory(accountId, items.map((item) => item.id === id ? { ...item, result } : item));
}

export function deleteTranslationHistory(accountId: string, id: string): void {
  if (!accountId || !id) return;
  writeHistory(accountId, listTranslationHistory(accountId).filter((item) => item.id !== id));
}
