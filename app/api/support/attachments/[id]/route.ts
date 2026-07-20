import { isSupportAdministrator } from "../../../../support-admin.ts";
import { getSupportAttachment } from "../../../../support-attachment-store.ts";
import { getSupportStore } from "../../../../support-store.ts";
import { isSameOriginRequest } from "../../../../security.ts";
import { verifySupabaseRequest } from "../../../../supabase-server-auth.ts";

export const dynamic = "force-dynamic";

const securityHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

function unavailable(status: number): Response {
  return new Response(null, { status, headers: securityHeaders });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOriginRequest(request)) return unavailable(403);
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) return unavailable(auth.status);
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return unavailable(404);

  try {
    const attachment = await getSupportAttachment(id);
    if (!attachment) return unavailable(404);
    const isAdmin = isSupportAdministrator(auth.user.email);
    const conversation = await (await getSupportStore()).getConversation(auth.user.id, attachment.conversationId, isAdmin);
    if (!conversation) return unavailable(404);
    return new Response(attachment.body as BodyInit, {
      status: 200,
      headers: {
        ...securityHeaders,
        "Content-Type": attachment.attachment.mimeType,
        "Content-Length": String(attachment.attachment.sizeBytes),
        "Content-Disposition": `inline; filename="${attachment.attachment.name.replace(/["\\]/g, "_")}"`,
      },
    });
  } catch {
    return unavailable(503);
  }
}
