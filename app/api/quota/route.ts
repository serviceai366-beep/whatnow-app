import { isSameOriginRequest } from "../../security.ts";
import { verifySupabaseRequest } from "../../supabase-server-auth.ts";
import { estimatedAnalysisQuota, readAnalysisQuota } from "../../usage-control.ts";
import { activePlanForUser } from "../../subscription-store.ts";
import type { SubscriptionPlanCode } from "../../subscription-plans.ts";

const QUOTA_LOOKUP_TIMEOUT_MS = 4_000;

async function settleQuotaLookup<T>(operation: Promise<T>, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((resolve) => { timeout = setTimeout(() => resolve(fallback), QUOTA_LOOKUP_TIMEOUT_MS); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return response({ error: { code: "forbidden" } }, 403);
  }

  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) return response({ error: { code: auth.code } }, auth.status);

  try {
    const planCode = await settleQuotaLookup<SubscriptionPlanCode>(
      activePlanForUser(auth.user.id, undefined, auth.user.email),
      "free",
    );
    const quota = await settleQuotaLookup(
      readAnalysisQuota({ userKey: auth.user.id, planCode }),
      estimatedAnalysisQuota(planCode),
    );
    // A read outage must never remove the limits UI. The client labels this
    // snapshot as an estimate and never treats it as a confirmed balance.
    return response({ quota: quota.backend === "unavailable" ? estimatedAnalysisQuota(planCode) : quota });
  } catch (error) {
    console.error("[quota] Usage control error", { name: error instanceof Error ? error.name : "unknown" });
    return response({ quota: estimatedAnalysisQuota("free") });
  }
}
