// Cloudflare's documented dummy key keeps automated/local browser checks
// deterministic. Production always uses the real public widget key.
const DEVELOPMENT_SITE_KEY = "1x00000000000000000000AA";
const PRODUCTION_SITE_KEY = "0x4AAAAAAD1twK3mhXWZqxK9";

export const TURNSTILE_SITE_KEY = process.env.NODE_ENV === "development"
  ? DEVELOPMENT_SITE_KEY
  : process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || PRODUCTION_SITE_KEY;

export function isTurnstileConfigured(): boolean {
  return TURNSTILE_SITE_KEY.length > 0;
}
