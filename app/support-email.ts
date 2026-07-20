import type { SupportLocale, SupportPriority } from "./support-types.ts";

type SupportEmailEnvironment = Record<string, string | undefined>;
type NotificationKind = "new_ticket" | "user_reply" | "support_reply";

function firstAdminEmail(environment: SupportEmailEnvironment): string | null {
  const email = (environment.WHATNOW_SUPPORT_ADMIN_EMAILS ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function configuration(environment: SupportEmailEnvironment) {
  const apiKey = environment.RESEND_API_KEY?.trim() ?? "";
  const from = environment.SUPPORT_FROM_EMAIL?.trim() || "WhatNow? Support <support@whatnow-app.com>";
  return /^re_[A-Za-z0-9_-]{12,}$/.test(apiKey) && /<[^\s@]+@[^\s@]+\.[^\s@]+>$/.test(from)
    ? { apiKey, from }
    : null;
}

export function supportEmailConfigured(environment: SupportEmailEnvironment = process.env): boolean {
  return Boolean(configuration(environment));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

const userCopy = {
  en: { subject: "New reply from WhatNow? support", title: "Support replied to your request", intro: "A new reply is waiting in your private WhatNow? support centre.", button: "Open support", note: "For privacy, the message text is not included in this email." },
  ru: { subject: "Новый ответ от поддержки WhatNow?", title: "Поддержка ответила на обращение", intro: "В вашем приватном центре поддержки WhatNow? появился новый ответ.", button: "Открыть поддержку", note: "Для конфиденциальности текст сообщения не включён в это письмо." },
  lv: { subject: "Jauna WhatNow? atbalsta atbilde", title: "Atbalsts atbildēja uz jūsu pieprasījumu", intro: "Jūsu privātajā WhatNow? atbalsta centrā ir jauna atbilde.", button: "Atvērt atbalstu", note: "Privātuma dēļ ziņas teksts e-pastā nav iekļauts." },
} as const;

function adminCopy(kind: Exclude<NotificationKind, "support_reply">, priority: SupportPriority) {
  return {
    subject: kind === "new_ticket" ? `[${priority.toUpperCase()}] New WhatNow? support request` : `[${priority.toUpperCase()}] New customer reply`,
    title: kind === "new_ticket" ? "A new support request arrived" : "A customer replied",
    intro: "Open the private owner queue in WhatNow? to review and respond.",
    button: "Open owner queue",
    note: "The message text is omitted from email for privacy.",
  };
}

export async function sendSupportNotification({
  kind,
  contactEmail,
  locale,
  ticketSubject,
  ticketId,
  priority,
  environment = process.env,
  fetchImpl = fetch,
}: {
  kind: NotificationKind;
  contactEmail: string | null;
  locale: SupportLocale;
  ticketSubject: string;
  ticketId: string;
  priority: SupportPriority;
  environment?: SupportEmailEnvironment;
  fetchImpl?: typeof fetch;
}): Promise<{ configured: boolean; sent: boolean }> {
  const configured = configuration(environment);
  if (!configured) return { configured: false, sent: false };
  const recipient = kind === "support_reply" ? contactEmail : firstAdminEmail(environment);
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return { configured: true, sent: false };
  const text = kind === "support_reply" ? userCopy[locale] : adminCopy(kind, priority);
  const safeTicket = escapeHtml(ticketSubject.slice(0, 140));
  const safeReference = escapeHtml(ticketId.slice(0, 8).toUpperCase());
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#17211e"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #d9e3de;border-radius:20px;padding:28px"><p style="margin:0 0 12px;color:#0f766e;font-weight:700">WhatNow? Support</p><h1 style="margin:0 0 14px;font-size:26px">${escapeHtml(text.title)}</h1><p style="line-height:1.6">${escapeHtml(text.intro)}</p><div style="margin:20px 0;padding:14px;border-radius:12px;background:#eef4f1"><strong>${safeTicket}</strong><br><small>Ticket ${safeReference}</small></div><a href="https://whatnow-app.com/?support=1" style="display:inline-block;padding:12px 18px;border-radius:11px;background:#0f766e;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(text.button)}</a><p style="margin:20px 0 0;color:#5f6e68;font-size:12px">${escapeHtml(text.note)}</p></div></div></body></html>`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${configured.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: configured.from, to: [recipient], subject: `${text.subject}: ${ticketSubject.slice(0, 80)}`, html }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as { id?: unknown } | null;
    return { configured: true, sent: response.ok && typeof payload?.id === "string" };
  } catch {
    return { configured: true, sent: false };
  } finally {
    clearTimeout(timeout);
  }
}
