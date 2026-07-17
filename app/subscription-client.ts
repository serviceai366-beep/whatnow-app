"use client";

import { getAccessToken } from "./supabase-auth";
import type { SubscriptionPublicPayload } from "./subscription-types";

type ApiErrorPayload = { error?: { code?: string; message?: string } };

export class SubscriptionRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SubscriptionRequestError";
  }
}

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw new SubscriptionRequestError("authentication_required", "Authentication required");
  return value;
}

export async function loadSubscription(): Promise<SubscriptionPublicPayload> {
  const response = await fetch("/api/subscription", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Authorization: `Bearer ${await token()}` },
  });
  const payload = await response.json().catch(() => null) as SubscriptionPublicPayload & ApiErrorPayload | null;
  if (!response.ok || !payload?.subscription || !payload.pricing) {
    throw new SubscriptionRequestError(payload?.error?.code ?? "subscription_error", payload?.error?.message ?? "Subscription could not be loaded");
  }
  return payload;
}

export async function startTestCheckout(): Promise<string> {
  const response = await fetch("/api/subscription", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = await response.json().catch(() => null) as ({ checkoutUrl?: unknown } & ApiErrorPayload) | null;
  if (!response.ok || typeof payload?.checkoutUrl !== "string") {
    throw new SubscriptionRequestError(payload?.error?.code ?? "checkout_error", payload?.error?.message ?? "Checkout could not be started");
  }
  return payload.checkoutUrl;
}
