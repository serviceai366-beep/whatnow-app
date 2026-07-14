"use client";

import { useEffect, useRef } from "react";
import type { SupportedLanguage } from "./analysis-schema";
import { TURNSTILE_SITE_KEY } from "./turnstile-config";

const SCRIPT_ID = "whatnow-turnstile-script";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile_unavailable"));
    };
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("turnstile_unavailable")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("turnstile_unavailable")), { once: true });
    document.head.appendChild(script);
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
  language: SupportedLanguage;
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
