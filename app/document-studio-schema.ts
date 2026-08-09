import { supportedLanguages, type SupportedLanguage } from "./analysis-schema.ts";
import { guideFor, requiredRegionFor } from "./document-studio-guides.ts";

export type StudioMode = "create" | "improve" | "review";
export type StudioReadinessLevel = "red" | "yellow" | "green";

export const studioTemplateIds = [
  "lease", "service", "nda", "loan", "power", "complaint", "request", "termination",
  "letter", "proposal", "sow", "minutes", "cv", "birthday", "wedding", "event", "thanks", "custom",
] as const;

export const studioCountries = [
  "Latvia", "Estonia", "Lithuania", "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia",
  "Denmark", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland", "Italy", "Luxembourg",
  "Malta", "Netherlands", "Norway", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain",
  "Sweden", "Switzerland", "United Kingdom", "United States", "Canada", "Australia", "Brazil", "Argentina",
  "Chile", "Colombia", "Mexico",
] as const;

export type StudioRequest = {
  mode: StudioMode;
  workflow: "guided" | "quick";
  templateId: string;
  country: string;
  region: string | null;
  outputLanguage: SupportedLanguage;
  details: Record<string, string>;
  confirmedInsufficient: boolean;
  preSignatureCheck: boolean;
};

export type GeneratedDocument = {
  schemaVersion: "1.0";
  title: string;
  mode: StudioMode;
  templateId: string;
  country: string;
  region: string | null;
  outputLanguage: SupportedLanguage;
  readiness: { level: StudioReadinessLevel; score: number; missingCritical: string[]; missingHelpful: string[] };
  sections: { heading: string; body: string }[];
  plainText: string;
  /** Safe, user-edited rich text. AI responses never provide this field. */
  editorHtml?: string;
  assumptions: string[];
  changes: { summary: string; reason: string }[];
  unresolvedIssues: { issue: string; severity: "low" | "medium" | "high"; recommendation: string }[];
  legalSources: { title: string; url: string; accessedAt: string; claim: string }[];
  reviewChecklist: string[];
  confidence: "low" | "medium" | "high";
  annotations?: { sectionHeading: string; excerpt: string; reason: string; kind: "missing" | "uncertain"; question: string }[];
  safetyNotice: string;
  preSignatureCheck?: boolean;
};

export type StudioRevisionResult = { message: string; changed: boolean; document: GeneratedDocument };

const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function parseStudioRequest(value: unknown): StudioRequest | null {
  if (!record(value) || !["create", "improve", "review"].includes(String(value.mode))) return null;
  if (!supportedLanguages.includes(value.outputLanguage as SupportedLanguage) || !record(value.details)) return null;
  const details: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value.details).slice(0, 24)) {
    if (/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(key)) details[key] = text(raw, key === "existing" ? 60_000 : 4_000);
  }
  const country = text(value.country, 80);
  const templateId = text(value.templateId, 60);
  if (!studioCountries.includes(country as (typeof studioCountries)[number]) || !studioTemplateIds.includes(templateId as (typeof studioTemplateIds)[number])) return null;
  return {
    mode: value.mode as StudioMode,
    workflow: value.workflow === "quick" ? "quick" : "guided",
    templateId,
    country,
    region: text(value.region, 100) || null,
    outputLanguage: value.outputLanguage as SupportedLanguage,
    details,
    confirmedInsufficient: value.confirmedInsufficient === true,
    preSignatureCheck: value.preSignatureCheck === true,
  };
}

export function assessStudioReadiness(input: StudioRequest): GeneratedDocument["readiness"] {
  const critical: string[] = [];
  const helpful: string[] = [];
  if (requiredRegionFor(input.country) && !input.region) critical.push("region_or_state");
  if (input.workflow === "quick") {
    const promptLength = input.details.prompt?.trim().length ?? 0;
    if (promptLength < 20) critical.push("quick_prompt");
    else if (promptLength < 100) helpful.push("more_prompt_detail");
    if (input.mode !== "create" && !input.details.existing?.trim()) helpful.push("existing_document_or_full_text");
    const level: StudioReadinessLevel = critical.length ? "red" : helpful.length ? "yellow" : "green";
    const score = level === "green" ? 88 : level === "yellow" ? 68 : 30;
    return { level, score, missingCritical: critical, missingHelpful: helpful };
  }
  if (input.mode !== "create") {
    if (!input.details.existing?.trim()) critical.push("existing_document");
    if (!input.preSignatureCheck && !input.details.goal?.trim()) critical.push("requested_changes");
  } else {
    for (const field of guideFor(input.templateId).fields) {
      if (input.details[field.key]?.trim()) continue;
      (field.required ? critical : helpful).push(field.key);
    }
  }
  const total = critical.length + helpful.length;
  const level: StudioReadinessLevel = critical.length >= 3 ? "red" : critical.length > 0 || helpful.length > 2 ? "yellow" : "green";
  const score = level === "green" ? Math.max(88, 100 - total * 3) : level === "yellow" ? Math.max(48, 78 - critical.length * 10 - helpful.length * 3) : Math.max(15, 45 - critical.length * 6);
  return { level, score, missingCritical: critical, missingHelpful: helpful };
}

const stringArray = (v: unknown, max = 30) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && x.length <= 8_000);
export function validateGeneratedDocument(value: unknown): value is GeneratedDocument {
  if (!record(value) || value.schemaVersion !== "1.0" || typeof value.title !== "string" || !["create", "improve", "review"].includes(String(value.mode))) return false;
  if (!supportedLanguages.includes(value.outputLanguage as SupportedLanguage) || !studioCountries.includes(value.country as (typeof studioCountries)[number]) || !studioTemplateIds.includes(value.templateId as (typeof studioTemplateIds)[number])) return false;
  if (!(value.region === null || typeof value.region === "string")) return false;
  if (!Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 80 || !value.sections.every((s) => record(s) && typeof s.heading === "string" && typeof s.body === "string")) return false;
  if (typeof value.plainText !== "string" || value.plainText.length > 100_000 || !(value.editorHtml === undefined || typeof value.editorHtml === "string" && value.editorHtml.length <= 180_000 && isSafeStudioEditorHtml(value.editorHtml)) || !stringArray(value.assumptions) || !stringArray(value.reviewChecklist)) return false;
  if (!Array.isArray(value.changes) || !value.changes.every((x) => record(x) && typeof x.summary === "string" && typeof x.reason === "string")) return false;
  if (!Array.isArray(value.unresolvedIssues) || !value.unresolvedIssues.every((x) => record(x) && typeof x.issue === "string" && ["low", "medium", "high"].includes(String(x.severity)) && typeof x.recommendation === "string")) return false;
  if (!Array.isArray(value.legalSources) || !value.legalSources.every((x) => record(x) && typeof x.title === "string" && typeof x.url === "string" && /^https:\/\//.test(x.url) && typeof x.accessedAt === "string" && typeof x.claim === "string")) return false;
  if (!(value.annotations === undefined || Array.isArray(value.annotations) && value.annotations.length <= 80 && value.annotations.every((x) => record(x) && typeof x.sectionHeading === "string" && typeof x.excerpt === "string" && typeof x.reason === "string" && ["missing", "uncertain"].includes(String(x.kind)) && typeof x.question === "string"))) return false;
  return record(value.readiness) && ["red", "yellow", "green"].includes(String(value.readiness.level)) && Number.isInteger(value.readiness.score) && Number(value.readiness.score) >= 0 && Number(value.readiness.score) <= 100
    && stringArray(value.readiness.missingCritical) && stringArray(value.readiness.missingHelpful)
    && ["low", "medium", "high"].includes(String(value.confidence)) && typeof value.safetyNotice === "string";
}

const editorTag = /^(?:<\/?(?:p|h1|h2|h3|ul|ol|li|strong|em|u|br)\s*\/?\s*>|<\/?span(?:\s+class="editor-color-(?:accent|red|blue|gray)")?\s*>)$/i;

export function isSafeStudioEditorHtml(value: string) {
  if (value.length > 180_000 || /<(?:script|style|iframe|object|embed|svg|math|img|a)\b/i.test(value) || /\son[a-z]+\s*=|\sstyle\s*=|javascript:/i.test(value)) return false;
  return (value.match(/<[^>]*>/g) ?? []).every((tag) => editorTag.test(tag));
}

export function parseManualStudioDocument(value: unknown, original: GeneratedDocument): GeneratedDocument | null {
  if (!record(value)) return null;
  const title = text(value.title, 300);
  const plainText = text(value.plainText, 100_000);
  const editorHtml = typeof value.editorHtml === "string" ? value.editorHtml.trim().slice(0, 180_000) : "";
  if (!title || !plainText || !editorHtml || !isSafeStudioEditorHtml(editorHtml) || !Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 80) return null;
  const sections = value.sections.flatMap((section) => {
    if (!record(section)) return [];
    const heading = text(section.heading, 500), body = text(section.body, 30_000);
    return heading && body ? [{ heading, body }] : [];
  });
  if (!sections.length) return null;
  const next: GeneratedDocument = {
    ...original,
    title,
    plainText,
    editorHtml,
    sections,
    annotations: (original.annotations ?? []).filter((annotation) => plainText.includes(annotation.excerpt)),
  };
  return validateGeneratedDocument(next) ? next : null;
}

const str = { type: "string" };
const strings = { type: "array", items: str };
export const generatedDocumentJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    schemaVersion: { type: "string", enum: ["1.0"] }, title: str,
    mode: { type: "string", enum: ["create", "improve", "review"] }, templateId: str, country: str,
    region: { type: ["string", "null"] }, outputLanguage: { type: "string", enum: supportedLanguages },
    readiness: { type: "object", additionalProperties: false, properties: { level: { type: "string", enum: ["red", "yellow", "green"] }, score: { type: "integer", minimum: 0, maximum: 100 }, missingCritical: strings, missingHelpful: strings }, required: ["level", "score", "missingCritical", "missingHelpful"] },
    sections: { type: "array", items: { type: "object", additionalProperties: false, properties: { heading: str, body: str }, required: ["heading", "body"] } },
    plainText: str, assumptions: strings,
    changes: { type: "array", items: { type: "object", additionalProperties: false, properties: { summary: str, reason: str }, required: ["summary", "reason"] } },
    unresolvedIssues: { type: "array", items: { type: "object", additionalProperties: false, properties: { issue: str, severity: { type: "string", enum: ["low", "medium", "high"] }, recommendation: str }, required: ["issue", "severity", "recommendation"] } },
    legalSources: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: str, url: str, accessedAt: str, claim: str }, required: ["title", "url", "accessedAt", "claim"] } },
    annotations: { type: "array", items: { type: "object", additionalProperties: false, properties: { sectionHeading: str, excerpt: str, reason: str, kind: { type: "string", enum: ["missing", "uncertain"] }, question: str }, required: ["sectionHeading", "excerpt", "reason", "kind", "question"] } },
    reviewChecklist: strings, confidence: { type: "string", enum: ["low", "medium", "high"] }, safetyNotice: str,
  },
  required: ["schemaVersion", "title", "mode", "templateId", "country", "region", "outputLanguage", "readiness", "sections", "plainText", "assumptions", "changes", "unresolvedIssues", "legalSources", "annotations", "reviewChecklist", "confidence", "safetyNotice"],
};

export const studioRevisionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: { message: str, changed: { type: "boolean" }, document: generatedDocumentJsonSchema },
  required: ["message", "changed", "document"],
};

export function validateStudioRevision(value: unknown): value is StudioRevisionResult {
  return record(value) && typeof value.message === "string" && typeof value.changed === "boolean" && validateGeneratedDocument(value.document);
}
