const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DEFAULT_EXPECTED_HOSTNAMES = [
  "whatnow-app.com",
  "whatnow-app.timurka-0701.chatgpt.site",
] as const;
const DEVELOPMENT_SECRET_KEY = "1x0000000000000000000000000000000AA";

export type TurnstileResult =
  | { ok: true }
  | { ok: false; code: "captcha_required" | "captcha_failed" | "captcha_unavailable" };

type SiteverifyPayload = {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
};

function expectedHostnames(development: boolean, requestHostname: string): Set<string> {
  if (development) return new Set([requestHostname]);
  const configured = process.env.TURNSTILE_EXPECTED_HOSTNAME
    ?.split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured?.length ? configured : DEFAULT_EXPECTED_HOSTNAMES);
}

export async function verifyTurnstileToken({
  request,
  token,
  action,
  fetchImpl = fetch,
}: {
  request: Request;
  token: FormDataEntryValue | null;
  action: "analyze";
  fetchImpl?: typeof fetch;
}): Promise<TurnstileResult> {
  if (typeof token !== "string" || token.length < 10 || token.length > 2048) {
    return { ok: false, code: "captcha_required" };
  }
  const development = process.env.NODE_ENV === "development";
  const secret = development ? DEVELOPMENT_SECRET_KEY : process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, code: "captcha_unavailable" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const body = new URLSearchParams({ secret, response: token });
    const remoteIp = request.headers.get("cf-connecting-ip");
    if (remoteIp) body.set("remoteip", remoteIp);
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, code: "captcha_unavailable" };
    const payload = await response.json().catch(() => null) as SiteverifyPayload | null;
    if (!payload || payload.success !== true) return { ok: false, code: "captcha_failed" };

    const requestHostname = new URL(request.url).hostname.toLowerCase();
    const verifiedHostname = typeof payload.hostname === "string" ? payload.hostname.toLowerCase() : "";
    const allowedHostnames = expectedHostnames(development, requestHostname);
    if (
      verifiedHostname !== requestHostname
      || !allowedHostnames.has(verifiedHostname)
      || payload.action !== action
    ) {
      return { ok: false, code: "captcha_failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "captcha_unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
