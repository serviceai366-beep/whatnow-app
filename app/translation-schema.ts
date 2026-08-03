import { supportedLanguages, type SupportedLanguage, type SourceLanguage } from "./analysis-schema.ts";

export type TranslationResult = {
  schemaVersion: "1.0";
  sourceLanguage: SourceLanguage;
  targetLanguage: SupportedLanguage;
  translation: string;
  notes: string[];
  uncertainties: string[];
};

const stringArraySchema = {
  type: "array",
  items: { type: "string", maxLength: 500 },
  maxItems: 8,
} as const;

export const translationJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["1.0"] },
    sourceLanguage: { type: "string", enum: [...supportedLanguages, "unknown"] },
    targetLanguage: { type: "string", enum: supportedLanguages },
    translation: { type: "string", minLength: 1, maxLength: 100_000 },
    notes: stringArraySchema,
    uncertainties: stringArraySchema,
  },
  required: ["schemaVersion", "sourceLanguage", "targetLanguage", "translation", "notes", "uncertainties"],
  additionalProperties: false,
} as const;

function isSupportedSourceLanguage(value: unknown): value is SourceLanguage {
  return value === "unknown" || (typeof value === "string" && (supportedLanguages as readonly string[]).includes(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 8
    && value.every((item) => typeof item === "string" && item.length <= 500);
}

export function validateTranslationResult(value: unknown, expectedTarget?: SupportedLanguage): value is TranslationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const target = candidate.targetLanguage;
  return candidate.schemaVersion === "1.0"
    && isSupportedSourceLanguage(candidate.sourceLanguage)
    && typeof target === "string"
    && (supportedLanguages as readonly string[]).includes(target)
    && (!expectedTarget || target === expectedTarget)
    && typeof candidate.translation === "string"
    && candidate.translation.trim().length > 0
    && candidate.translation.length <= 100_000
    && isStringArray(candidate.notes)
    && isStringArray(candidate.uncertainties)
    && Object.keys(candidate).every((key) => ["schemaVersion", "sourceLanguage", "targetLanguage", "translation", "notes", "uncertainties"].includes(key));
}
