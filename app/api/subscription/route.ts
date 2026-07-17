import { isSameOriginRequest } from "../../security.ts";
import { SUBSCRIPTION_PRICING_DRAFT } from "../../subscription-plans.ts";
import { createStripeTestCheckout, stripeTestConfiguration } from "../../stripe-server.ts";
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
  | "checkout_failed";

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

function publicPayload(checkoutAvailable: boolean): SubscriptionPublicPayload {
  return {
    subscription: {
      planCode: "free",
      state: "free",
      checkoutAvailable,
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
  return response(publicPayload(Boolean(stripeTestConfiguration())));
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
  const configuration = stripeTestConfiguration();
  if (!configuration) {
    return error("checkout_unavailable", "Test checkout is not configured and no payment can be taken.", 503);
  }
  const checkout = await createStripeTestCheckout({ request, user: auth.user, configuration });
  if (!checkout.ok) return error("checkout_failed", "Stripe test checkout could not be created.", 502);
  return response({ checkoutUrl: checkout.url, testMode: true });
}
