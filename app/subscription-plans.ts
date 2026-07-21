export type SubscriptionPlanCode = "free" | "pro";

export const SUBSCRIPTION_PLAN = Object.freeze({
  status: "available_when_configured" as const,
  planCode: "pro" as const,
  productName: "WhatNow? Pro",
  currency: "USD" as const,
  monthlyGrossCents: 999,
  annualGrossCents: 9_990,
  vatPlanningRateBasisPoints: 2_100,
  positioning: "High-use personal access",
  fairUse: Object.freeze({
    rolling24HourSafetyThreshold: 30,
    rolling30DaySafetyThreshold: 300,
    followupQuestionsPerDocument: 30,
    largeDocumentReviewRequired: true,
  }),
});

// Kept temporarily for imports from older builds. New code should use SUBSCRIPTION_PLAN.
export const SUBSCRIPTION_PRICING_DRAFT = SUBSCRIPTION_PLAN;

export const FREE_PLAN_ENTITLEMENTS = Object.freeze({
  planCode: "free" as const,
  rolling24HourAnalyses: 3,
  rolling7DayAnalyses: 10,
  savedFiles: 10,
  activeReminders: 3,
  weeklyReminderCreations: 10,
  followupQuestionsPerDocument: 3,
});
