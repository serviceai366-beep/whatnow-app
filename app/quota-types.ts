export type WindowQuota = {
  limit: number;
  remaining: number;
  resetAt: number;
};

export type QuotaSnapshot = {
  backend: "durable" | "memory" | "unavailable";
  checkedAt: number;
  daily: WindowQuota;
  weekly: WindowQuota;
};
