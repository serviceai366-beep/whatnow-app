export const TERMS_VERSION = "2026-07-17";
export const PRIVACY_VERSION = "2026-07-17";
export const LEGAL_EFFECTIVE_AT = "2026-07-17T00:00:00.000Z";
export const LEGAL_CONTACT_EMAIL = "serviceai366@gmail.com";

export type LegalAcceptanceMetadata = {
  terms_accepted_at?: unknown;
  terms_version?: unknown;
  privacy_version?: unknown;
};

export function hasCurrentLegalAcceptance(metadata: LegalAcceptanceMetadata | null | undefined): boolean {
  return typeof metadata?.terms_accepted_at === "string"
    && metadata.terms_version === TERMS_VERSION
    && metadata.privacy_version === PRIVACY_VERSION;
}

export function legalAcceptanceMetadata(acceptedAt = new Date().toISOString()) {
  return {
    terms_accepted_at: acceptedAt,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
  } as const;
}
