export type SubscriptionPlanCode = "free" | "pro";

export const SUBSCRIPTION_PRICING_DRAFT = Object.freeze({
  status: "draft_not_for_sale" as const,
  planCode: "pro" as const,
  productName: "WhatNow? Pro",
  currency: "EUR" as const,
  monthlyGrossCents: 1_999,
  annualGrossCents: 19_990,
  vatPlanningRateBasisPoints: 2_100,
  positioning: "High-use personal access",
  checkoutEnabled: false,
  fairUseDraft: Object.freeze({
    rolling24HourSafetyThreshold: 30,
    rolling30DaySafetyThreshold: 300,
    largeDocumentReviewRequired: true,
  }),
});

export const FREE_PLAN_ENTITLEMENTS = Object.freeze({
  planCode: "free" as const,
  rolling24HourAnalyses: 3,
  rolling7DayAnalyses: 10,
  savedFiles: 10,
  activeReminders: 3,
  weeklyReminderCreations: 10,
});
