import { isSameOriginRequest } from "../../security.ts";
import { verifySupabaseRequest } from "../../supabase-server-auth.ts";
import { readAnalysisQuota } from "../../usage-control.ts";
import { activePlanForUser } from "../../subscription-store.ts";

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
    const planCode = await activePlanForUser(auth.user.id);
    const quota = await readAnalysisQuota({ userKey: auth.user.id, planCode });
    if (quota.backend === "unavailable") {
      return response({ error: { code: "usage_control_unavailable" } }, 503);
    }
    return response({ quota });
  } catch (error) {
    console.error("[quota] Usage control error", { name: error instanceof Error ? error.name : "unknown" });
    return response({ error: { code: "usage_control_unavailable" } }, 503);
  }
}
