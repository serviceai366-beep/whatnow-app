export type SubscriptionPlanCode = "free" | "pro";
export type SubscriptionState = "free" | "test_checkout_pending" | "active" | "past_due" | "canceled";

export type SubscriptionSnapshot = {
  planCode: SubscriptionPlanCode;
  state: SubscriptionState;
  checkoutAvailable: boolean;
  testMode: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type SubscriptionPublicPayload = {
  subscription: SubscriptionSnapshot;
  pricing: {
    productName: string;
    currency: "USD";
    monthlyGrossCents: number;
    rolling24HourSafetyThreshold: number;
    rolling30DaySafetyThreshold: number;
  };
};
