import { favoriteModes, getFavoriteModeStore, type FavoriteMode } from "../../favorite-mode-store.ts";
import { isSameOriginRequest } from "../../security.ts";
import { verifySupabaseRequest } from "../../supabase-server-auth.ts";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512;
const headers = {
  "Cache-Control": "no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers });
}

function error(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

function parseMode(value: unknown): FavoriteMode | undefined {
  if (value === null) return null;
  return typeof value === "string" && favoriteModes.includes(value as Exclude<FavoriteMode, null>)
    ? value as Exclude<FavoriteMode, null>
    : undefined;
}

async function authenticate(request: Request) {
  const auth = await verifySupabaseRequest(request);
  return auth.ok ? auth : { response: error(auth.code, "A confirmed account is required.", auth.status) } as const;
}

async function getStore() {
  return getFavoriteModeStore();
}

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return error("forbidden", "The request origin was rejected.", 403);
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  const store = await getStore();
  if (!store) return error("favorite_mode_unavailable", "Favorite mode storage is unavailable.", 503);
  try {
    return json({ favoriteMode: await store.read(auth.user.id) });
  } catch {
    return error("favorite_mode_unavailable", "Favorite mode storage is unavailable.", 503);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return error("forbidden", "The request origin was rejected.", 403);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return error("invalid_request", "Expected a JSON request.", 415);
  const bodyText = await request.text();
  if (!bodyText || new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) return error("invalid_request", "The request is too large.", 413);
  const body = (() => {
    try {
      const parsed = JSON.parse(bodyText) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  })();
  if (!body || Object.keys(body).length !== 1 || !("favoriteMode" in body)) return error("invalid_request", "Favorite mode is invalid.", 400);
  const favoriteMode = parseMode(body.favoriteMode);
  if (favoriteMode === undefined) return error("invalid_request", "Favorite mode is invalid.", 400);
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;
  const store = await getStore();
  if (!store) return error("favorite_mode_unavailable", "Favorite mode storage is unavailable.", 503);
  try {
    return json({ favoriteMode: await store.write(auth.user.id, favoriteMode) });
  } catch {
    return error("favorite_mode_unavailable", "Favorite mode storage is unavailable.", 503);
  }
}
