import {
  FileStoreError,
  listUserFiles,
  saveUserFile,
} from "../../file-store.ts";
import {
  hasSupportedRequestContentType,
  isRequestBodySizeAllowed,
  isSameOriginRequest,
} from "../../security.ts";
import { verifySupabaseRequest } from "../../supabase-server-auth.ts";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: { ...responseHeaders, ...Object.fromEntries(new Headers(extraHeaders)) },
  });
}

function storageError(error: unknown): Response {
  if (error instanceof FileStoreError) {
    const retryable = error.status === 429 || error.status === 503;
    return json(
      { error: { code: error.code, retryable } },
      error.status,
      error.status === 429 ? { "Retry-After": "3600" } : {},
    );
  }
  return json({ error: { code: "file_storage_unavailable", retryable: true } }, 503);
}

async function authenticate(request: Request) {
  if (!isSameOriginRequest(request)) {
    return { response: json({ error: { code: "forbidden", retryable: false } }, 403) } as const;
  }
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) {
    return { response: json({ error: { code: auth.code, retryable: auth.status === 503 } }, auth.status) } as const;
  }
  return { user: auth.user } as const;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  try {
    return json(await listUserFiles(auth.user.id));
  } catch (error) {
    return storageError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  if (!hasSupportedRequestContentType(request)) {
    return json({ error: { code: "invalid_request", retryable: false } }, 415);
  }
  if (!isRequestBodySizeAllowed(request)) {
    return json({ error: { code: "file_too_large", retryable: false } }, 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: { code: "invalid_request", retryable: false } }, 400);
  }
  const uploaded = formData.get("file");
  if (!(uploaded instanceof File)) {
    return json({ error: { code: "invalid_request", retryable: false } }, 400);
  }

  try {
    const result = await saveUserFile({
      userId: auth.user.id,
      name: uploaded.name,
      declaredMimeType: uploaded.type,
      bytes: new Uint8Array(await uploaded.arrayBuffer()),
    });
    return json(result, result.deduplicated ? 200 : 201);
  } catch (error) {
    return storageError(error);
  }
}
