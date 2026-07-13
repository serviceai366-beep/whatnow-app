export const MAX_REQUEST_BODY_SIZE = 12 * 1024 * 1024;
export const ANALYSIS_RATE_LIMIT = 4;
export const ANALYSIS_RATE_WINDOW_MS = 10 * 60 * 1000;

type RateBucket = { count: number; resetAt: number };

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

export function isSameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function hasSupportedRequestContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.startsWith("multipart/form-data;") && contentType.includes("boundary=");
}

export function isRequestBodySizeAllowed(request: Request): boolean {
  const value = request.headers.get("content-length");
  if (!value) return true;
  const length = Number(value);
  return Number.isSafeInteger(length) && length >= 0 && length <= MAX_REQUEST_BODY_SIZE;
}

function clientIdentity(request: Request): string {
  const authenticatedEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (authenticatedEmail) return `account:${authenticatedEmail}`;

  const cloudflareAddress = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareAddress) return `ip:${cloudflareAddress}`;

  const forwardedAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedAddress) return `ip:${forwardedAddress}`;

  const realAddress = request.headers.get("x-real-ip")?.trim();
  return realAddress ? `ip:${realAddress}` : "anonymous";
}

export async function privacySafeClientKey(request: Request, secret = "local-development"): Promise<string> {
  const input = new TextEncoder().encode(`whatnow-rate-limit:${secret}:${clientIdentity(request)}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest.subarray(0, 12), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createRateLimiter({
  limit,
  windowMs,
  now = () => Date.now(),
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const buckets = new Map<string, RateBucket>();
  const maximumBuckets = 10_000;

  return {
    check(key: string): RateLimitResult {
      const currentTime = now();
      let bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= currentTime) {
        if (buckets.size >= maximumBuckets) {
          for (const [existingKey, existingBucket] of buckets) {
            if (existingBucket.resetAt <= currentTime || buckets.size >= maximumBuckets) {
              buckets.delete(existingKey);
            }
            if (buckets.size < maximumBuckets) break;
          }
        }
        bucket = { count: 0, resetAt: currentTime + windowMs };
        buckets.set(key, bucket);
      }

      if (bucket.count >= limit) {
        return {
          allowed: false,
          limit,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
          resetAt: bucket.resetAt,
        };
      }

      bucket.count += 1;
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSeconds: 0,
        resetAt: bucket.resetAt,
      };
    },
  };
}
