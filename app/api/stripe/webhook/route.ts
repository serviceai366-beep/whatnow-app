import { handleStripeWebhook } from "../../../stripe-webhook.ts";

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleStripeWebhook(request);
  } catch (error) {
    console.error("[stripe-webhook] Processing failed", { name: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: "webhook_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
