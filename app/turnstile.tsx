"use client";

import { useEffect, useRef } from "react";
import type { ProfileLanguage } from "./profile-types";
import { TURNSTILE_SITE_KEY } from "./turnstile-config";

const SCRIPT_ID = "whatnow-turnstile-script";
const SCRIPT_CALLBACK = "whatNowTurnstileReady";
const SCRIPT_URL = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${SCRIPT_CALLBACK}`;
const SCRIPT_TIMEOUT_MS = 12_000;

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    whatNowTurnstileReady?: () => void;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    let settled = false;
    const startedAt = Date.now();
    const fail = () => {
      if (settled) return;
      settled = true;
      scriptPromise = null;
      reject(new Error("turnstile_unavailable"));
    };
    const waitForApi = () => {
      if (settled) return;
      if (window.turnstile) {
        settled = true;
        resolve(window.turnstile);
        return;
      }
      if (Date.now() - startedAt >= SCRIPT_TIMEOUT_MS) {
        fail();
        return;
      }
      window.setTimeout(waitForApi, 50);
    };
    window.whatNowTurnstileReady = waitForApi;
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("error", fail, { once: true });
      waitForApi();
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", waitForApi, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.appendChild(script);
    waitForApi();
  });
  return scriptPromise;
}

export function TurnstileWidget({
  action,
  language,
  theme,
  resetKey,
  onToken,
  onError,
}: {
  action: "analyze" | "email-login";
  language: ProfileLanguage;
  theme: "light" | "dark";
  resetKey: number;
  onToken: (token: string | null) => void;
  onError: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
  }, [onError, onToken]);

  useEffect(() => {
    let active = true;
    onTokenRef.current(null);
    if (!TURNSTILE_SITE_KEY) {
      onErrorRef.current();
      return;
    }

    loadTurnstile().then((api) => {
      if (!active || !containerRef.current) return;
      if (widgetIdRef.current) api.remove(widgetIdRef.current);
      widgetIdRef.current = api.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        language,
        theme,
        appearance: "interaction-only",
        retry: "auto",
        "response-field": false,
        callback: (token: string) => { if (active) onTokenRef.current(token); },
        "expired-callback": () => { if (active) onTokenRef.current(null); },
        "timeout-callback": () => { if (active) onTokenRef.current(null); },
        "error-callback": () => {
          if (active) { onTokenRef.current(null); onErrorRef.current(); }
          return true;
        },
      });
    }).catch(() => { if (active) onErrorRef.current(); });

    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action, language, resetKey, theme]);

  return <div className="turnstile-widget" ref={containerRef} />;
}
