export type WindowQuota = {
  limit: number;
  remaining: number;
  resetAt: number;
};

export type QuotaSnapshot = {
  backend: "durable" | "memory" | "unavailable";
  checkedAt: number;
  planCode: "free" | "pro";
  secondaryWindowDays: 7 | 30;
  daily: WindowQuota;
  weekly: WindowQuota;
};
