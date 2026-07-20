// Languages in which WhatNow? can return a complete, structured explanation.
// Keep this separate from interface locales: a person may use an English UI and
// still ask for a Polish or Portuguese explanation of their document.
export const supportedLanguages = [
  "en", "ru", "lv", "es", "pt", "fr", "de", "it", "pl", "uk", "nl", "ro", "sv", "cs",
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];
export type SourceLanguage = SupportedLanguage | "unknown";
export type FindingStatus = "found" | "not_found" | "unclear";
export type Confidence = "low" | "medium" | "high";
export type Basis = "fact" | "inference";

export type Finding = {
  value: string | null;
  status: FindingStatus;
  evidenceIds: string[];
  confidence: Confidence;
  basis: Basis;
};

export type Deadline = {
  dateText: string | null;
  normalizedDate: string | null;
  meaning: string;
  status: FindingStatus;
  evidenceIds: string[];
  confidence: Confidence;
  basis: Basis;
};

export type DocumentEvent = {
  id: string;
  title: string;
  kind: "appointment" | "meeting" | "deadline" | "payment" | "other";
  dateText: string | null;
  localDate: string | null;
  localTime: string | null;
  documentTimeZone: string | null;
  location: string | null;
  status: FindingStatus;
  evidenceIds: string[];
  confidence: Confidence;
  basis: Basis;
};

export type ActionStep = {
  step: number;
  action: string;
  evidenceIds: string[];
  confidence: Confidence;
  basis: Basis;
};

export type Evidence = {
  id: string;
  quote: string;
  location: string;
  supports: string[];
};

export type AnalysisResult = {
  schemaVersion: "1.0" | "1.1";
  outputLanguage: SupportedLanguage;
  sourceLanguage?: SourceLanguage;
  documentType: Finding;
  sender: Finding;
  summary: string;
  requiredActions: Finding[];
  deadlines: Deadline[];
  events?: DocumentEvent[];
  requiredDocuments: Finding[];
  consequencesOfInaction: Finding[];
  actionPlan: ActionStep[];
  replyNeeded: "yes" | "no" | "unclear";
  suggestedReply: string | null;
  evidence: Evidence[];
  uncertainties: string[];
  confidence: Confidence;
  safetyNotice: string;
};

const confidenceSchema = { type: "string", enum: ["low", "medium", "high"] };
const basisSchema = { type: "string", enum: ["fact", "inference"] };
const statusSchema = { type: "string", enum: ["found", "not_found", "unclear"] };
const evidenceIdsSchema = { type: "array", items: { type: "string" } };

const findingSchema = {
  type: "object",
  properties: {
    value: { type: ["string", "null"] },
    status: statusSchema,
    evidenceIds: evidenceIdsSchema,
    confidence: confidenceSchema,
    basis: basisSchema,
  },
  required: ["value", "status", "evidenceIds", "confidence", "basis"],
  additionalProperties: false,
};

export const documentAnalysisJsonSchema = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["1.1"] },
    outputLanguage: { type: "string", enum: supportedLanguages },
    sourceLanguage: { type: "string", enum: [...supportedLanguages, "unknown"] },
    documentType: findingSchema,
    sender: findingSchema,
    summary: { type: "string" },
    requiredActions: { type: "array", items: findingSchema },
    deadlines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dateText: { type: ["string", "null"] },
          normalizedDate: { type: ["string", "null"] },
          meaning: { type: "string" },
          status: statusSchema,
          evidenceIds: evidenceIdsSchema,
          confidence: confidenceSchema,
          basis: basisSchema,
        },
        required: ["dateText", "normalizedDate", "meaning", "status", "evidenceIds", "confidence", "basis"],
        additionalProperties: false,
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^event_[1-9][0-9]*$" },
          title: { type: "string" },
          kind: { type: "string", enum: ["appointment", "meeting", "deadline", "payment", "other"] },
          dateText: { type: ["string", "null"] },
          localDate: { type: ["string", "null"], pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
          localTime: { type: ["string", "null"], pattern: "^[0-9]{2}:[0-9]{2}$" },
          documentTimeZone: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          status: statusSchema,
          evidenceIds: evidenceIdsSchema,
          confidence: confidenceSchema,
          basis: basisSchema,
        },
        required: ["id", "title", "kind", "dateText", "localDate", "localTime", "documentTimeZone", "location", "status", "evidenceIds", "confidence", "basis"],
        additionalProperties: false,
      },
    },
    requiredDocuments: { type: "array", items: findingSchema },
    consequencesOfInaction: { type: "array", items: findingSchema },
    actionPlan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "integer", minimum: 1 },
          action: { type: "string" },
          evidenceIds: evidenceIdsSchema,
          confidence: confidenceSchema,
          basis: basisSchema,
        },
        required: ["step", "action", "evidenceIds", "confidence", "basis"],
        additionalProperties: false,
      },
    },
    replyNeeded: { type: "string", enum: ["yes", "no", "unclear"] },
    suggestedReply: { type: ["string", "null"] },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          quote: { type: "string" },
          location: { type: "string" },
          supports: { type: "array", items: { type: "string" } },
        },
        required: ["id", "quote", "location", "supports"],
        additionalProperties: false,
      },
    },
    uncertainties: { type: "array", items: { type: "string" } },
    confidence: confidenceSchema,
    safetyNotice: { type: "string" },
  },
  required: [
    "schemaVersion",
    "outputLanguage",
    "sourceLanguage",
    "documentType",
    "sender",
    "summary",
    "requiredActions",
    "deadlines",
    "events",
    "requiredDocuments",
    "consequencesOfInaction",
    "actionPlan",
    "replyNeeded",
    "suggestedReply",
    "evidence",
    "uncertainties",
    "confidence",
    "safetyNotice",
  ],
  additionalProperties: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isConfidence(value: unknown): value is Confidence {
  return value === "low" || value === "medium" || value === "high";
}

function isBasis(value: unknown): value is Basis {
  return value === "fact" || value === "inference";
}

function isStatus(value: unknown): value is FindingStatus {
  return value === "found" || value === "not_found" || value === "unclear";
}

function isFinding(value: unknown): value is Finding {
  if (!isRecord(value)) return false;
  return (
    (typeof value.value === "string" || value.value === null) &&
    isStatus(value.status) &&
    isStringArray(value.evidenceIds) &&
    isConfidence(value.confidence) &&
    isBasis(value.basis)
  );
}

function isDeadline(value: unknown): value is Deadline {
  if (!isRecord(value)) return false;
  return (
    (typeof value.dateText === "string" || value.dateText === null) &&
    (typeof value.normalizedDate === "string" || value.normalizedDate === null) &&
    typeof value.meaning === "string" &&
    isStatus(value.status) &&
    isStringArray(value.evidenceIds) &&
    isConfidence(value.confidence) &&
    isBasis(value.basis)
  );
}

function isSourceLanguage(value: unknown): value is SourceLanguage {
  return value === "unknown" || supportedLanguages.includes(value as SupportedLanguage);
}

function isDocumentEvent(value: unknown): value is DocumentEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" && /^event_[1-9][0-9]*$/.test(value.id) &&
    typeof value.title === "string" &&
    (value.kind === "appointment" || value.kind === "meeting" || value.kind === "deadline" || value.kind === "payment" || value.kind === "other") &&
    (typeof value.dateText === "string" || value.dateText === null) &&
    (typeof value.localDate === "string" || value.localDate === null) &&
    (typeof value.localTime === "string" || value.localTime === null) &&
    (typeof value.documentTimeZone === "string" || value.documentTimeZone === null) &&
    (typeof value.location === "string" || value.location === null) &&
    isStatus(value.status) &&
    isStringArray(value.evidenceIds) &&
    isConfidence(value.confidence) &&
    isBasis(value.basis)
  );
}

function isActionStep(value: unknown): value is ActionStep {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.step) &&
    Number(value.step) >= 1 &&
    typeof value.action === "string" &&
    isStringArray(value.evidenceIds) &&
    isConfidence(value.confidence) &&
    isBasis(value.basis)
  );
}

function isEvidence(value: unknown): value is Evidence {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.quote === "string" &&
    typeof value.location === "string" &&
    isStringArray(value.supports)
  );
}

export function validateAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value)) return false;
  const isLegacy = value.schemaVersion === "1.0";
  const hasEventData = isSourceLanguage(value.sourceLanguage)
    && Array.isArray(value.events) && value.events.every(isDocumentEvent);
  return (
    (isLegacy || value.schemaVersion === "1.1") &&
    (isLegacy || hasEventData) &&
    supportedLanguages.includes(value.outputLanguage as SupportedLanguage) &&
    isFinding(value.documentType) &&
    isFinding(value.sender) &&
    typeof value.summary === "string" &&
    Array.isArray(value.requiredActions) && value.requiredActions.every(isFinding) &&
    Array.isArray(value.deadlines) && value.deadlines.every(isDeadline) &&
    Array.isArray(value.requiredDocuments) && value.requiredDocuments.every(isFinding) &&
    Array.isArray(value.consequencesOfInaction) && value.consequencesOfInaction.every(isFinding) &&
    Array.isArray(value.actionPlan) && value.actionPlan.every(isActionStep) &&
    (value.replyNeeded === "yes" || value.replyNeeded === "no" || value.replyNeeded === "unclear") &&
    (typeof value.suggestedReply === "string" || value.suggestedReply === null) &&
    Array.isArray(value.evidence) && value.evidence.every(isEvidence) &&
    isStringArray(value.uncertainties) &&
    isConfidence(value.confidence) &&
    typeof value.safetyNotice === "string"
  );
}
