import { supportedLanguages, type SupportedLanguage } from "./analysis-schema.ts";

export type StudioMode = "create" | "improve" | "review";
export type StudioReadinessLevel = "red" | "yellow" | "green";

export const studioTemplateIds = [
  "lease", "service", "nda", "loan", "power", "complaint", "request", "termination",
  "letter", "proposal", "sow", "minutes", "cv", "birthday", "wedding", "event", "thanks", "custom",
] as const;

export const studioCountries = [
  "Latvia", "Estonia", "Lithuania", "Germany", "France", "Spain", "Portugal", "Italy", "Poland",
  "Netherlands", "Ireland", "United Kingdom", "United States", "Canada", "Brazil", "Argentina",
] as const;

export type StudioRequest = {
  mode: StudioMode;
  templateId: string;
  country: string;
  region: string | null;
  outputLanguage: SupportedLanguage;
  details: Record<string, string>;
  confirmedInsufficient: boolean;
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
  assumptions: string[];
  changes: { summary: string; reason: string }[];
  unresolvedIssues: { issue: string; severity: "low" | "medium" | "high"; recommendation: string }[];
  legalSources: { title: string; url: string; accessedAt: string; claim: string }[];
  reviewChecklist: string[];
  confidence: "low" | "medium" | "high";
  safetyNotice: string;
};

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
    templateId,
    country,
    region: text(value.region, 100) || null,
    outputLanguage: value.outputLanguage as SupportedLanguage,
    details,
    confirmedInsufficient: value.confirmedInsufficient === true,
  };
}

export function assessStudioReadiness(input: StudioRequest): GeneratedDocument["readiness"] {
  const critical: string[] = [];
  const helpful: string[] = [];
  if (input.mode !== "create") {
    if (!input.details.existing?.trim()) critical.push("existing_document");
    if (!input.details.goal?.trim()) critical.push("requested_changes");
  } else if (input.templateId === "lease") {
    if (!input.details.landlord || !input.details.tenant) critical.push("parties");
    if (!input.details.property) critical.push("property_address");
    if (!input.details.start) critical.push("start_date");
    if (!input.details.rent) critical.push("rent_amount");
    if (!input.details.end) helpful.push("end_date");
    if (!input.details.notes) helpful.push("deposit_utilities_and_notice_terms");
  } else {
    const goal = input.details.goal?.trim() ?? "";
    if (goal.length < 20) critical.push("purpose_and_key_facts");
    else if (goal.length < 80) helpful.push("more_specific_details");
  }
  const level: StudioReadinessLevel = critical.length >= 3 ? "red" : critical.length > 0 || helpful.length > 1 ? "yellow" : "green";
  return { level, score: level === "green" ? 100 : level === "yellow" ? 62 : 28, missingCritical: critical, missingHelpful: helpful };
}

const stringArray = (v: unknown, max = 30) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && x.length <= 8_000);
export function validateGeneratedDocument(value: unknown): value is GeneratedDocument {
  if (!record(value) || value.schemaVersion !== "1.0" || typeof value.title !== "string" || !["create", "improve", "review"].includes(String(value.mode))) return false;
  if (!supportedLanguages.includes(value.outputLanguage as SupportedLanguage) || !studioCountries.includes(value.country as (typeof studioCountries)[number]) || !studioTemplateIds.includes(value.templateId as (typeof studioTemplateIds)[number])) return false;
  if (!(value.region === null || typeof value.region === "string")) return false;
  if (!Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 80 || !value.sections.every((s) => record(s) && typeof s.heading === "string" && typeof s.body === "string")) return false;
  if (typeof value.plainText !== "string" || value.plainText.length > 100_000 || !stringArray(value.assumptions) || !stringArray(value.reviewChecklist)) return false;
  if (!Array.isArray(value.changes) || !value.changes.every((x) => record(x) && typeof x.summary === "string" && typeof x.reason === "string")) return false;
  if (!Array.isArray(value.unresolvedIssues) || !value.unresolvedIssues.every((x) => record(x) && typeof x.issue === "string" && ["low", "medium", "high"].includes(String(x.severity)) && typeof x.recommendation === "string")) return false;
  if (!Array.isArray(value.legalSources) || !value.legalSources.every((x) => record(x) && typeof x.title === "string" && typeof x.url === "string" && /^https:\/\//.test(x.url) && typeof x.accessedAt === "string" && typeof x.claim === "string")) return false;
  return record(value.readiness) && ["red", "yellow", "green"].includes(String(value.readiness.level)) && Number.isInteger(value.readiness.score) && Number(value.readiness.score) >= 0 && Number(value.readiness.score) <= 100
    && stringArray(value.readiness.missingCritical) && stringArray(value.readiness.missingHelpful)
    && ["low", "medium", "high"].includes(String(value.confidence)) && typeof value.safetyNotice === "string";
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
    reviewChecklist: strings, confidence: { type: "string", enum: ["low", "medium", "high"] }, safetyNotice: str,
  },
  required: ["schemaVersion", "title", "mode", "templateId", "country", "region", "outputLanguage", "readiness", "sections", "plainText", "assumptions", "changes", "unresolvedIssues", "legalSources", "reviewChecklist", "confidence", "safetyNotice"],
};
