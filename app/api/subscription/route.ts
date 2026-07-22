import { isSameOriginRequest } from "../../security.ts";
import { SUBSCRIPTION_PLAN } from "../../subscription-plans.ts";
import { createStripeCheckout, createStripePortal, privateSubscriptionReference, stripeConfiguration, testCheckoutAllowed } from "../../stripe-server.ts";
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
  testMode: boolean,
  subscription?: SubscriptionPublicPayload["subscription"],
): SubscriptionPublicPayload {
  return {
    subscription: subscription ?? {
      planCode: "free",
      state: "free",
      checkoutAvailable,
      managementAvailable: false,
      testMode,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    pricing: {
      productName: SUBSCRIPTION_PLAN.productName,
      currency: SUBSCRIPTION_PLAN.currency,
      monthlyGrossCents: SUBSCRIPTION_PLAN.monthlyGrossCents,
      rolling24HourSafetyThreshold: SUBSCRIPTION_PLAN.fairUse.rolling24HourSafetyThreshold,
      rolling30DaySafetyThreshold: SUBSCRIPTION_PLAN.fairUse.rolling30DaySafetyThreshold,
    },
  };
}

function authenticationError(auth: Exclude<Awaited<ReturnType<typeof verifySupabaseRequest>>, { ok: true }>): Response {
  return error(auth.code, "Account verification failed.", auth.status);
}

export async function GET(request: Request): Promise<Response> {
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) return authenticationError(auth);
  const configuration = stripeConfiguration();
  const checkoutConfigured = Boolean(configuration)
    && (configuration?.mode === "live" || testCheckoutAllowed(auth.user.email));
  const store = await getSubscriptionStore();
  const stored = store ? await store.readForUser(auth.user.id) : null;
  // A previous sandbox purchase must never be treated as a paid live plan.
  // It stays in storage for auditability, but the account can start a live
  // checkout as soon as the site switches to production billing.
  const storedForCurrentMode = stored && configuration && stored.testMode === (configuration.mode === "test")
    ? stored
    : null;
  const subscription = storedForCurrentMode ? {
    planCode: storedForCurrentMode.planCode,
    state: storedForCurrentMode.state,
    checkoutAvailable: checkoutConfigured && storedForCurrentMode.state !== "active",
    managementAvailable: checkoutConfigured && storedForCurrentMode.state === "active" && storedForCurrentMode.managementAvailable,
    testMode: storedForCurrentMode.testMode,
    currentPeriodEnd: storedForCurrentMode.currentPeriodEnd,
    cancelAtPeriodEnd: storedForCurrentMode.cancelAtPeriodEnd,
  } : undefined;
  return response(publicPayload(checkoutConfigured, configuration?.mode === "test", subscription));
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return error("forbidden", "Request origin was rejected.", 403);
  if (!request.headers.get("content-type")?.trim().toLowerCase().startsWith("application/json")) {
    return error("invalid_request", "Expected a JSON request.", 415);
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 1_024) {
    return error("invalid_request", "Request is too large.", 413);
  }
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) return authenticationError(auth);
  const body = (() => {
    try { return JSON.parse(rawBody) as { action?: unknown }; }
    catch { return null; }
  })();
  const action = body?.action === "portal"
    ? "portal"
    : body?.action === "checkout" || body?.action === undefined
      ? "checkout"
      : null;
  if (!action) return error("invalid_request", "Unknown subscription action.", 400);
  const configuration = stripeConfiguration();
  if (!configuration) {
    return error("checkout_unavailable", "Subscription checkout is not configured.", 503);
  }
  if (configuration.mode === "test" && !testCheckoutAllowed(auth.user.email)) {
    return error("checkout_unavailable", "Subscription checkout is not open for this account yet.", 403);
  }
  const store = await getSubscriptionStore();
  if (!store) return error("storage_unavailable", "Subscription storage is unavailable.", 503);
  const storedExisting = await store.readForUser(auth.user.id);
  const existing = storedExisting && storedExisting.testMode === (configuration.mode === "test")
    ? storedExisting
    : null;
  if (action === "portal") {
    if (existing?.state !== "active" || existing.planCode !== "pro" || !existing.stripeCustomerId) {
      return error("portal_unavailable", "No active test subscription is available to manage.", 409);
    }
    const portal = await createStripePortal({ request, customerId: existing.stripeCustomerId, configuration });
    if (!portal.ok) return error("checkout_failed", "Stripe subscription portal could not be created.", 502);
    return response({ portalUrl: portal.url, testMode: configuration.mode === "test" });
  }
  if (existing?.state === "active" && existing.planCode === "pro") {
    return error("already_subscribed", "This account already has an active subscription.", 409);
  }
  const accountReference = await privateSubscriptionReference(auth.user.id);
  await store.markCheckoutPending(auth.user.id, accountReference, configuration.mode === "test");
  const checkout = await createStripeCheckout({ request, user: auth.user, configuration });
  if (!checkout.ok) return error("checkout_failed", "Stripe checkout could not be created.", 502);
  return response({ checkoutUrl: checkout.url, testMode: configuration.mode === "test" });
}
