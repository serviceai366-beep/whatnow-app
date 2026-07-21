import type { SubscriptionPlanCode } from "./subscription-types";

export const FREE_FOLLOWUP_LIMIT = 3;
export const PRO_FOLLOWUP_LIMIT = 30;

export type FollowupMessage = {
  id: string;
  question: string;
  selectedText: string | null;
  answer: string;
  evidenceIds: string[];
  uncertain: boolean;
  safetyNotice: string | null;
  createdAt: number;
};

export type FollowupQuota = {
  planCode: SubscriptionPlanCode;
  used: number;
  limit: number;
  remaining: number;
};

export type FollowupConversation = {
  analysisId: string;
  messages: FollowupMessage[];
  quota: FollowupQuota;
};

export type FollowupAnswer = {
  answer: string;
  evidenceIds: string[];
  uncertain: boolean;
  safetyNotice: string | null;
};
