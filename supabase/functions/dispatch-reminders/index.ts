import { createClient } from "npm:@supabase/supabase-js@2.93.3";

type ReminderRow = {
  id: string;
  user_id: string;
  event_title: string;
  event_at: string;
  timezone: string;
  remind_before_minutes: number;
  source_language: "ru" | "lv" | "en";
  event_key: string;
};

const MAX_BATCH = 20;

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function offsetText(minutes: number, language: ReminderRow["source_language"]): string {
  const labels = {
    ru: { 0: "в выбранное время", 60: "за 1 час", 1440: "за 24 часа", 10080: "за 1 неделю", 43200: "за 30 дней" },
    lv: { 0: "izvēlētajā laikā", 60: "1 stundu iepriekš", 1440: "24 stundas iepriekš", 10080: "1 nedēļu iepriekš", 43200: "30 dienas iepriekš" },
    en: { 0: "at the selected time", 60: "1 hour before", 1440: "24 hours before", 10080: "1 week before", 43200: "30 days before" },
  } as const;
  return labels[language][minutes as keyof (typeof labels)[typeof language]] ?? String(minutes);
}

function emailContent(reminder: ReminderRow) {
  const locale = reminder.source_language === "ru" ? "ru-RU" : reminder.source_language === "lv" ? "lv-LV" : "en-GB";
  const eventTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: reminder.timezone,
  }).format(new Date(reminder.event_at));
  const title = reminder.event_title;
  const offset = offsetText(reminder.remind_before_minutes, reminder.source_language);
  const manual = reminder.event_key.startsWith("calendar_");
  const copy = reminder.source_language === "ru" ? {
    subject: `Напоминание: ${title}`,
    heading: "Скоро важное событие",
    when: "Дата и время",
    advance: "Когда отправлено",
    note: manual ? "Это автоматическое напоминание WhatNow? из вашего календаря." : "Это автоматическое напоминание WhatNow? по сохранённому разбору. Перед действием проверьте дату и требования в исходном документе.",
  } : reminder.source_language === "lv" ? {
    subject: `Atgādinājums: ${title}`,
    heading: "Drīzumā svarīgs notikums",
    when: "Datums un laiks",
    advance: "Atgādinājuma laiks",
    note: manual ? "Šis ir automātisks WhatNow? atgādinājums no jūsu kalendāra." : "Šis ir automātisks WhatNow? atgādinājums no saglabātās analīzes. Pirms rīcības pārbaudiet datumu un prasības sākotnējā dokumentā.",
  } : {
    subject: `Reminder: ${title}`,
    heading: "An important event is coming up",
    when: "Date and time",
    advance: "Reminder timing",
    note: manual ? "This is an automatic WhatNow? reminder from your calendar." : "This is an automatic WhatNow? reminder based on a saved analysis. Check the date and requirements against the original document before acting.",
  };
  const safeTitle = escapeHtml(title);
  const safeTime = escapeHtml(eventTime);
  const safeOffset = escapeHtml(offset);
  return {
    subject: copy.subject.slice(0, 190),
    text: `${copy.heading}\n\n${title}\n${copy.when}: ${eventTime}\n${copy.advance}: ${offset}\n\n${copy.note}`,
    html: `<!doctype html><html lang="${reminder.source_language}"><body style="margin:0;background:#f4f7f6;font-family:Arial,sans-serif;color:#17231f"><div style="max-width:600px;margin:32px auto;padding:28px;border:1px solid #dce7e3;border-radius:18px;background:#fff"><div style="font-size:22px;font-weight:800;color:#0f766e">WhatNow?</div><p style="margin:24px 0 8px;color:#0f766e;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(copy.heading)}</p><h1 style="margin:0 0 22px;font-size:26px;line-height:1.25">${safeTitle}</h1><div style="padding:17px;border-radius:13px;background:#edf8f5"><p style="margin:0 0 8px"><strong>${escapeHtml(copy.when)}:</strong> ${safeTime}</p><p style="margin:0"><strong>${escapeHtml(copy.advance)}:</strong> ${safeOffset}</p></div><p style="margin:22px 0 0;color:#5e6b66;font-size:13px;line-height:1.55">${escapeHtml(copy.note)}</p></div></body></html>`,
  };
}

async function resend(reminder: ReminderRow, recipient: string, apiKey: string, from: string) {
  const content = emailContent(reminder);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `whatnow-reminder/${reminder.id}`,
      },
      body: JSON.stringify({ from, to: [recipient], subject: content.subject, text: content.text, html: content.html }),
      signal: controller.signal,
    });
    const payload = await result.json().catch(() => null) as { id?: string; name?: string } | null;
    return { ok: result.ok && typeof payload?.id === "string", id: payload?.id ?? null, retryable: result.status === 429 || result.status >= 500, code: payload?.name ?? `resend_${result.status}` };
  } catch (error) {
    return { ok: false, id: null, retryable: true, code: error instanceof Error && error.name === "AbortError" ? "resend_timeout" : "resend_transport" };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET") ?? "";
  if (!constantTimeEqual(request.headers.get("x-whatnow-cron-secret") ?? "", cronSecret)) {
    return response({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("REMINDER_FROM_EMAIL") ?? "WhatNow? <onboarding@resend.dev>";
  const mode = (Deno.env.get("REMINDER_DELIVERY_MODE") ?? "pilot").toLowerCase();
  const pilotRecipient = Deno.env.get("REMINDER_TEST_RECIPIENT")?.trim().toLowerCase() ?? "";
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !cronSecret || (mode === "pilot" && !pilotRecipient)) {
    return response({ error: "not_configured" }, 503);
  }
  if (mode === "public" && from.includes("@resend.dev")) {
    return response({ error: "public_sender_not_verified" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("claim_due_email_reminders", { p_limit: MAX_BATCH });
  if (error) return response({ error: "claim_failed" }, 503);
  const reminders = Array.isArray(data) ? data as ReminderRow[] : [];
  let sent = 0;
  let failed = 0;

  for (const reminder of reminders) {
    const [{ data: userData, error: userError }, { data: preference, error: preferenceError }] = await Promise.all([
      supabase.auth.admin.getUserById(reminder.user_id),
      supabase
        .from("reminder_preferences")
        .select("email_consent_at")
        .eq("user_id", reminder.user_id)
        .maybeSingle(),
    ]);
    const email = userData.user?.email?.trim().toLowerCase() ?? "";
    const confirmed = Boolean(userData.user?.email_confirmed_at);
    const consented = typeof preference?.email_consent_at === "string";
    if (userError || preferenceError) {
      await supabase.rpc("mark_email_reminder_failed", {
        p_reminder_id: reminder.id,
        p_error_code: preferenceError ? "preference_lookup_failed" : "recipient_lookup_failed",
        p_retryable: true,
      });
      failed += 1;
      continue;
    }
    if (!consented || !email || !confirmed || (mode === "pilot" && email !== pilotRecipient)) {
      await supabase.rpc("mark_email_reminder_failed", {
        p_reminder_id: reminder.id,
        p_error_code: !consented ? "consent_revoked"
          : mode === "pilot" && email !== pilotRecipient ? "pilot_recipient_blocked"
          : "recipient_unavailable",
        p_retryable: false,
      });
      failed += 1;
      continue;
    }

    const delivery = await resend(reminder, email, resendApiKey, from);
    if (delivery.ok && delivery.id) {
      await supabase.rpc("mark_email_reminder_sent", { p_reminder_id: reminder.id, p_provider_email_id: delivery.id });
      sent += 1;
    } else {
      await supabase.rpc("mark_email_reminder_failed", {
        p_reminder_id: reminder.id,
        p_error_code: delivery.code,
        p_retryable: delivery.retryable,
      });
      failed += 1;
    }
  }

  return response({ claimed: reminders.length, sent, failed });
});
