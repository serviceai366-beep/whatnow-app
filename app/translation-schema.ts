import { supportedLanguages, type SupportedLanguage, type SourceLanguage } from "./analysis-schema.ts";

export type TranslationVariantStyle = "literal" | "conversational" | "bold" | "alternative";
export type TranslationVariant = {
  style: TranslationVariantStyle;
  label: string;
  translation: string;
  transcription: string;
};

export type TranslationResult = {
  schemaVersion: "1.1";
  sourceLanguage: SourceLanguage;
  targetLanguage: SupportedLanguage;
  // Kept as the first/primary variant for handoff compatibility.
  translation: string;
  transcription: string;
  variants: TranslationVariant[];
  notes: string[];
  uncertainties: string[];
};

export type TranslationVariantMode = "initial" | "more";

const stringArraySchema = {
  type: "array",
  items: { type: "string", maxLength: 500 },
  maxItems: 6,
} as const;

const variantSchema = {
  type: "object",
  properties: {
    style: { type: "string", enum: ["literal", "conversational", "bold", "alternative"] },
    label: { type: "string", minLength: 1, maxLength: 80 },
    translation: { type: "string", minLength: 1, maxLength: 100_000 },
    transcription: { type: "string", maxLength: 4_000 },
  },
  required: ["style", "label", "translation", "transcription"],
  additionalProperties: false,
} as const;

export const translationJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["1.1"] },
    sourceLanguage: { type: "string", enum: [...supportedLanguages, "unknown"] },
    targetLanguage: { type: "string", enum: supportedLanguages },
    translation: { type: "string", minLength: 1, maxLength: 100_000 },
    transcription: { type: "string", maxLength: 4_000 },
    variants: { type: "array", items: variantSchema, minItems: 1, maxItems: 5 },
    notes: stringArraySchema,
    uncertainties: stringArraySchema,
  },
  required: ["schemaVersion", "sourceLanguage", "targetLanguage", "translation", "transcription", "variants", "notes", "uncertainties"],
  additionalProperties: false,
} as const;

function isSupportedSourceLanguage(value: unknown): value is SourceLanguage {
  return value === "unknown" || (typeof value === "string" && (supportedLanguages as readonly string[]).includes(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 6
    && value.every((item) => typeof item === "string" && item.length <= 500);
}

function isVariantStyle(value: unknown): value is TranslationVariantStyle {
  return value === "literal" || value === "conversational" || value === "bold" || value === "alternative";
}

function isVariant(value: unknown): value is TranslationVariant {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return isVariantStyle(candidate.style)
    && typeof candidate.label === "string"
    && candidate.label.trim().length > 0
    && candidate.label.length <= 80
    && typeof candidate.translation === "string"
    && candidate.translation.trim().length > 0
    && candidate.translation.length <= 100_000
    && typeof candidate.transcription === "string"
    && candidate.transcription.length <= 4_000
    && Object.keys(candidate).every((key) => ["style", "label", "translation", "transcription"].includes(key));
}

export function validateTranslationResult(
  value: unknown,
  expectedTarget?: SupportedLanguage,
  expectedMode: TranslationVariantMode = "initial",
): value is TranslationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const target = candidate.targetLanguage;
  const variants = candidate.variants;
  if (!Array.isArray(variants) || variants.length < 1 || variants.length > 5 || !variants.every(isVariant)) return false;
  const styles = variants.map((variant) => variant.style);
  const styleValid = expectedMode === "more"
    ? variants.length <= 3 && variants.every((variant) => variant.style === "alternative")
    : variants.length === 3 && ["literal", "conversational", "bold"].every((style) => styles.includes(style as TranslationVariantStyle));
  return candidate.schemaVersion === "1.1"
    && isSupportedSourceLanguage(candidate.sourceLanguage)
    && typeof target === "string"
    && (supportedLanguages as readonly string[]).includes(target)
    && (!expectedTarget || target === expectedTarget)
    && typeof candidate.translation === "string"
    && candidate.translation.trim().length > 0
    && candidate.translation.length <= 100_000
    && typeof candidate.transcription === "string"
    && candidate.transcription.length <= 4_000
    && styleValid
    && isStringArray(candidate.notes)
    && isStringArray(candidate.uncertainties)
    && Object.keys(candidate).every((key) => ["schemaVersion", "sourceLanguage", "targetLanguage", "translation", "transcription", "variants", "notes", "uncertainties"].includes(key));
}
