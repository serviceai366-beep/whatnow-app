import { getSubscriptionStore, type StripeEvent, type SubscriptionStore } from "./subscription-store.ts";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

type WebhookEnvironment = Record<string, string | undefined>;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function signatureParts(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && /^\d{10,13}$/.test(value ?? "")) timestamp = Number(value);
    if (key === "v1" && /^[a-f0-9]{64}$/.test(value ?? "")) signatures.push(value);
  }
  return timestamp > 0 && signatures.length ? { timestamp, signatures } : null;
}

export async function verifyStripeWebhookSignature({
  payload,
  signatureHeader,
  secret,
  now = Date.now(),
}: {
  payload: string;
  signatureHeader: string;
  secret: string;
  now?: number;
}): Promise<boolean> {
  if (!secret.startsWith("whsec_") || payload.length > MAX_WEBHOOK_BYTES) return false;
  const parts = signatureParts(signatureHeader);
  if (!parts || Math.abs(Math.floor(now / 1000) - parts.timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.timestamp}.${payload}`)));
  return parts.signatures.some((candidate) => constantTimeEqual(candidate, digest));
}

function validEvent(value: unknown): value is StripeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  const data = event.data;
  return typeof event.id === "string"
    && typeof event.type === "string"
    && typeof event.created === "number"
    && typeof event.livemode === "boolean"
    && Boolean(data && typeof data === "object" && (data as Record<string, unknown>).object && typeof (data as Record<string, unknown>).object === "object");
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function handleStripeWebhook(
  request: Request,
  options: { environment?: WebhookEnvironment; store?: SubscriptionStore | null; now?: number } = {},
): Promise<Response> {
  const environment = options.environment ?? process.env;
  if (environment.STRIPE_TEST_CHECKOUT_ENABLED !== "true") return json({ error: "webhook_unavailable" }, 503);
  const secret = environment.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret.startsWith("whsec_")) return json({ error: "webhook_unavailable" }, 503);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return json({ error: "invalid_request" }, 415);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length > MAX_WEBHOOK_BYTES) return json({ error: "invalid_request" }, 413);
  const payload = await request.text();
  if (!payload || payload.length > MAX_WEBHOOK_BYTES) return json({ error: "invalid_request" }, 413);
  const verified = await verifyStripeWebhookSignature({
    payload,
    signatureHeader: request.headers.get("stripe-signature") ?? "",
    secret,
    now: options.now,
  });
  if (!verified) return json({ error: "invalid_signature" }, 400);
  let event: unknown;
  try {
    event = JSON.parse(payload) as unknown;
  } catch {
    return json({ error: "invalid_event" }, 400);
  }
  if (!validEvent(event) || event.livemode) return json({ error: "invalid_event" }, 400);
  const store = options.store === undefined ? await getSubscriptionStore() : options.store;
  if (!store) return json({ error: "storage_unavailable" }, 503);
  await store.applyStripeEvent(event, options.now);
  return json({ received: true }, 200);
}
