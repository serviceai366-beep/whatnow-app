import type { VerifiedSupabaseUser } from "./supabase-server-auth.ts";

const STRIPE_CHECKOUT_URL = "https://api.stripe.com/v1/checkout/sessions";
const STRIPE_REQUEST_TIMEOUT_MS = 10_000;

type StripeEnvironment = Record<string, string | undefined>;

export type StripeTestConfiguration = {
  secretKey: string;
  priceId: string;
};

export type StripeCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; code: "not_configured" | "stripe_error" | "invalid_response" | "timeout" };

export function stripeTestConfiguration(environment: StripeEnvironment = process.env): StripeTestConfiguration | null {
  if (environment.STRIPE_TEST_CHECKOUT_ENABLED !== "true") return null;
  const secretKey = environment.STRIPE_SECRET_KEY?.trim() ?? "";
  const priceId = environment.STRIPE_PRO_PRICE_ID?.trim() ?? "";
  if (!secretKey.startsWith("sk_test_") || !/^price_[A-Za-z0-9]+$/.test(priceId)) return null;
  return { secretKey, priceId };
}

export async function privateSubscriptionReference(userId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`whatnow-subscription:${userId}`),
  ));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

export function checkoutForm({
  priceId,
  user,
  userReference,
  origin,
}: {
  priceId: string;
  user: VerifiedSupabaseUser;
  userReference: string;
  origin: string;
}): URLSearchParams {
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("client_reference_id", userReference);
  form.set("customer_email", user.email);
  form.set("success_url", `${origin}/?subscription=success`);
  form.set("cancel_url", `${origin}/?subscription=canceled`);
  form.set("subscription_data[metadata][whatnow_account]", userReference);
  form.set("metadata[whatnow_account]", userReference);
  return form;
}

function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

export async function createStripeTestCheckout({
  request,
  user,
  configuration,
  fetchImpl = fetch,
}: {
  request: Request;
  user: VerifiedSupabaseUser;
  configuration: StripeTestConfiguration;
  fetchImpl?: typeof fetch;
}): Promise<StripeCheckoutResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STRIPE_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(STRIPE_CHECKOUT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: checkoutForm({
        priceId: configuration.priceId,
        user,
        userReference: await privateSubscriptionReference(user.id),
        origin: new URL(request.url).origin,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, code: "stripe_error" };
    const payload = await response.json().catch(() => null) as { url?: unknown } | null;
    if (!isStripeCheckoutUrl(payload?.url)) return { ok: false, code: "invalid_response" };
    return { ok: true, url: payload.url };
  } catch (error) {
    return { ok: false, code: error instanceof Error && error.name === "AbortError" ? "timeout" : "stripe_error" };
  } finally {
    clearTimeout(timeout);
  }
}
