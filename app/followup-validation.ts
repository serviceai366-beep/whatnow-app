import type { FollowupAnswer } from "./followup-types";

export const FOLLOWUP_QUESTION_MAX_LENGTH = 1_200;
export const FOLLOWUP_SELECTION_MAX_LENGTH = 1_600;

export type FollowupQuestionInput = {
  analysisId: string;
  question: string;
  selectedText: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFollowupQuestion(value: unknown): FollowupQuestionInput | null {
  if (!isRecord(value) || typeof value.analysisId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.analysisId)) return null;
  if (typeof value.question !== "string") return null;
  const question = value.question.trim();
  if (question.length < 2 || question.length > FOLLOWUP_QUESTION_MAX_LENGTH) return null;
  if (value.selectedText !== null && value.selectedText !== undefined && typeof value.selectedText !== "string") return null;
  const selectedText = typeof value.selectedText === "string" ? value.selectedText.trim() : "";
  if (selectedText.length > FOLLOWUP_SELECTION_MAX_LENGTH) return null;
  return { analysisId: value.analysisId, question, selectedText: selectedText || null };
}

export function validateFollowupAnswer(value: unknown): value is FollowupAnswer {
  if (!isRecord(value) || typeof value.answer !== "string" || value.answer.trim().length < 1 || value.answer.length > 5_000) return false;
  if (!Array.isArray(value.evidenceIds) || value.evidenceIds.length > 12 || !value.evidenceIds.every((item) => typeof item === "string" && item.length <= 40)) return false;
  return typeof value.uncertain === "boolean" && (value.safetyNotice === null || (typeof value.safetyNotice === "string" && value.safetyNotice.length <= 1_000));
}

export const followupAnswerJsonSchema = {
  type: "object",
  properties: {
    answer: { type: "string", maxLength: 5_000 },
    evidenceIds: { type: "array", items: { type: "string", maxLength: 40 }, maxItems: 12 },
    uncertain: { type: "boolean" },
    safetyNotice: { type: ["string", "null"], maxLength: 1_000 },
  },
  required: ["answer", "evidenceIds", "uncertain", "safetyNotice"],
  additionalProperties: false,
} as const;
