export type TranslationFollowupAnswer = {
  answer: string;
  uncertain: boolean;
  transcription: string;
};

export const translationFollowupJsonSchema = {
  type: "object",
  properties: {
    answer: { type: "string", minLength: 1, maxLength: 5_000 },
    uncertain: { type: "boolean" },
    transcription: { type: "string", maxLength: 2_000 },
  },
  required: ["answer", "uncertain", "transcription"],
  additionalProperties: false,
} as const;

export function validateTranslationFollowup(value: unknown): value is TranslationFollowupAnswer {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.answer === "string"
    && candidate.answer.trim().length > 0
    && candidate.answer.length <= 5_000
    && typeof candidate.uncertain === "boolean"
    && typeof candidate.transcription === "string"
    && candidate.transcription.length <= 2_000
    && Object.keys(candidate).every((key) => ["answer", "uncertain", "transcription"].includes(key));
}
