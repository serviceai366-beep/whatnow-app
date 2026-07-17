import { isSameOriginRequest } from "../../security.ts";
import { SUBSCRIPTION_PRICING_DRAFT } from "../../subscription-plans.ts";
import { createStripeTestCheckout, createStripeTestPortal, privateSubscriptionReference, stripeTestConfiguration } from "../../stripe-server.ts";
import { getSubscriptionStore } from "../../subscription-store.ts";
import type { SubscriptionPublicPayload } from "../../subscription-types.ts";
import { verifySupabaseRequest } from "../../supabase-server-auth.ts";

type SubscriptionApiError =
  | "authentication_required"
  | "authentication_invalid"
  | "authentication_unavailable"
  | "legal_acceptance_required"
  | "forbidden"
  | "invalid_request"
  | "checkout_unavailable"
  | "checkout_failed"
  | "portal_unavailable"
  | "already_subscribed"
  | "storage_unavailable";

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function error(code: SubscriptionApiError, message: string, status: number): Response {
  return response({ error: { code, message } }, status);
}

function publicPayload(
  checkoutAvailable: boolean,
  subscription?: SubscriptionPublicPayload["subscription"],
): SubscriptionPublicPayload {
  return {
    subscription: subscription ?? {
      planCode: "free",
      state: "free",
      checkoutAvailable,
      managementAvailable: false,
      testMode: true,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    pricing: {
      productName: SUBSCRIPTION_PRICING_DRAFT.productName,
      currency: SUBSCRIPTION_PRICING_DRAFT.currency,
      monthlyGrossCents: SUBSCRIPTION_PRICING_DRAFT.monthlyGrossCents,
      rolling24HourSafetyThreshold: SUBSCRIPTION_PRICING_DRAFT.fairUseDraft.rolling24HourSafetyThreshold,
      rolling30DaySafetyThreshold: SUBSCRIPTION_PRICING_DRAFT.fairUseDraft.rolling30DaySafetyThreshold,
    },
  };
}

function authenticationError(auth: Exclude<Awaited<ReturnType<typeof verifySupabaseRequest>>, { ok: true }>): Response {
  return error(auth.code, "Account verification failed.", auth.status);
}

export async function GET(request: Request): Promise<Response> {
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) return authenticationError(auth);
  const checkoutConfigured = Boolean(stripeTestConfiguration());
  const store = await getSubscriptionStore();
  const stored = store ? await store.readForUser(auth.user.id) : null;
  const subscription = stored ? {
    planCode: stored.planCode,
    state: stored.state,
    checkoutAvailable: checkoutConfigured && stored.state !== "active",
    managementAvailable: checkoutConfigured && stored.state === "active" && stored.managementAvailable,
    testMode: stored.testMode,
    currentPeriodEnd: stored.currentPeriodEnd,
    cancelAtPeriodEnd: stored.cancelAtPeriodEnd,
  } : undefined;
  return response(publicPayload(checkoutConfigured, subscription));
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return error("forbidden", "Request origin was rejected.", 403);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return error("invalid_request", "Expected a JSON request.", 415);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > 1_024) {
    return error("invalid_request", "Request is too large.", 413);
  }
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) return authenticationError(auth);
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  const action = body?.action === "portal" ? "portal" : body?.action === undefined ? "checkout" : null;
  if (!action) return error("invalid_request", "Unknown subscription action.", 400);
  const configuration = stripeTestConfiguration();
  if (!configuration) {
    return error("checkout_unavailable", "Test checkout is not configured and no payment can be taken.", 503);
  }
  const store = await getSubscriptionStore();
  if (!store) return error("storage_unavailable", "Subscription storage is unavailable.", 503);
  const existing = await store.readForUser(auth.user.id);
  if (action === "portal") {
    if (existing?.state !== "active" || existing.planCode !== "pro" || !existing.stripeCustomerId) {
      return error("portal_unavailable", "No active test subscription is available to manage.", 409);
    }
    const portal = await createStripeTestPortal({ request, customerId: existing.stripeCustomerId, configuration });
    if (!portal.ok) return error("checkout_failed", "Stripe test portal could not be created.", 502);
    return response({ portalUrl: portal.url, testMode: true });
  }
  if (existing?.state === "active" && existing.planCode === "pro") {
    return error("already_subscribed", "This account already has an active test subscription.", 409);
  }
  const accountReference = await privateSubscriptionReference(auth.user.id);
  await store.markCheckoutPending(auth.user.id, accountReference);
  const checkout = await createStripeTestCheckout({ request, user: auth.user, configuration });
  if (!checkout.ok) return error("checkout_failed", "Stripe test checkout could not be created.", 502);
  return response({ checkoutUrl: checkout.url, testMode: true });
}
