import {
  attachmentContentDisposition,
  deleteUserFile,
  FileStoreError,
  getUserFileDownload,
} from "../../../file-store.ts";
import { isSameOriginRequest } from "../../../security.ts";
import { verifySupabaseRequest, type VerifiedSupabaseUser } from "../../../supabase-server-auth.ts";

export const dynamic = "force-dynamic";

const baseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: baseHeaders });
}

function storageError(error: unknown): Response {
  if (error instanceof FileStoreError) {
    return json({ error: { code: error.code, retryable: error.status === 429 || error.status === 503 } }, error.status);
  }
  return json({ error: { code: "file_storage_unavailable", retryable: true } }, 503);
}

type AuthenticatedRequest = { user: VerifiedSupabaseUser } | { response: Response };

async function authenticate(request: Request): Promise<AuthenticatedRequest> {
  if (!isSameOriginRequest(request)) {
    return { response: json({ error: { code: "forbidden", retryable: false } }, 403) } as const;
  }
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) {
    return { response: json({ error: { code: auth.code, retryable: auth.status === 503 } }, auth.status) } as const;
  }
  return { user: auth.user } as const;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  try {
    const download = await getUserFileDownload(auth.user.id, id);
    if (!download) return json({ error: { code: "file_not_found", retryable: false } }, 404);
    return new Response(download.body as BodyInit, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Type": download.file.mimeType,
        "Content-Length": String(download.file.sizeBytes),
        "Content-Disposition": attachmentContentDisposition(download.file.originalName, download.file.extension),
      },
    });
  } catch (error) {
    return storageError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  try {
    if (!await deleteUserFile(auth.user.id, id)) {
      return json({ error: { code: "file_not_found", retryable: false } }, 404);
    }
    return json({ deleted: true });
  } catch (error) {
    return storageError(error);
  }
}
