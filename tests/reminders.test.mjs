import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { availableReminderOffsets, zonedLocalDateTimeToUtc } from "../app/reminder-time.ts";
import { parseReminderAction } from "../app/reminder-validation.ts";

test("converts Europe/Riga local event times without guessing a fixed UTC offset", () => {
  assert.equal(zonedLocalDateTimeToUtc("2026-07-20", "14:00", "Europe/Riga")?.toISOString(), "2026-07-20T11:00:00.000Z");
  assert.equal(zonedLocalDateTimeToUtc("2026-01-20", "14:00", "Europe/Riga")?.toISOString(), "2026-01-20T12:00:00.000Z");
  assert.equal(zonedLocalDateTimeToUtc("2026-03-29", "03:30", "Europe/Riga"), null);
});

test("offers only reminder offsets that are still in the future", () => {
  const offsets = availableReminderOffsets({
    localDate: "2026-07-20",
    localTime: "14:00",
    timeZone: "Europe/Riga",
    now: new Date("2026-07-14T00:00:00.000Z"),
  });
  assert.deepEqual(offsets, [60, 1_440]);
});

test("validates and sanitizes every reminder mutation", () => {
  const valid = parseReminderAction({
    action: "schedule",
    analysisId: "11111111-1111-4111-8111-111111111111",
    eventKey: "event_1",
    eventTitle: "  Parent meeting  ",
    localDate: "2026-07-20",
    localTime: "14:00",
    timezone: "Europe/Riga",
    remindBeforeMinutes: 1_440,
    sourceLanguage: "lv",
  });
  assert.equal(valid?.action, "schedule");
  assert.equal(valid?.eventTitle, "Parent meeting");
  assert.equal(parseReminderAction({ ...valid, remindBeforeMinutes: 30 }), null);
  assert.equal(parseReminderAction({ ...valid, timezone: "Not/AZone" }), null);
  assert.equal(parseReminderAction({ ...valid, eventKey: "../../secret" }), null);
  assert.equal(parseReminderAction({ action: "cancel", reminderId: "not-a-uuid" }), null);
});

test("database design keeps reminders private, bounded, and idempotent", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260714_email_reminders.sql", import.meta.url), "utf8");
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /auth\.uid\(\) = user_id/g);
  assert.match(migration, /revoke all on table public\.email_reminders from anon, authenticated/i);
  assert.match(migration, /unique \(user_id, analysis_id, event_key\)/i);
  assert.match(migration, />= 25/);
  assert.match(migration, /80 - count\(\*\) filter/i);
  assert.match(migration, /3 - coalesce\(recent\.reserved_count, 0\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /status = 'sending' and locked_at >=/i);
  assert.match(migration, /row_number\(\) over/i);
  assert.match(migration, /for update(?: of reminder)? skip locked/i);
  assert.match(migration, /status in \('scheduled', 'sending'\)/i);
  assert.match(migration, /join public\.reminder_preferences preference/i);
  assert.match(migration, /preference\.email_consent_at is not null/i);
  assert.doesNotMatch(migration, /recipient_email|email_address|original_document|document_text/i);
});

test("dispatcher restricts pilot delivery and prevents duplicate email sends", async () => {
  const dispatcher = await readFile(new URL("../supabase/functions/dispatch-reminders/index.ts", import.meta.url), "utf8");
  assert.match(dispatcher, /REMINDER_TEST_RECIPIENT/);
  assert.match(dispatcher, /mode === "pilot" && email !== pilotRecipient/);
  assert.match(dispatcher, /Idempotency-Key/);
  assert.match(dispatcher, /whatnow-reminder\/\$\{reminder\.id\}/);
  assert.match(dispatcher, /email_confirmed_at/);
  assert.match(dispatcher, /from\("reminder_preferences"\)/);
  assert.match(dispatcher, /consent_revoked/);
  assert.match(dispatcher, /source_language/);
  assert.doesNotMatch(dispatcher, /console\.log\(|SUPABASE_SERVICE_ROLE_KEY.*Response/);
});

test("result UI requires one-time consent and uses 24 hours as the automatic default", async () => {
  const [center, profile, copy] = await Promise.all([
    readFile(new URL("../app/reminder-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reminder-profile-section.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reminder-copy.ts", import.meta.url), "utf8"),
  ]);
  assert.match(center, /consentChecked/);
  assert.match(center, /scheduleEvent\(candidate, 1_440, true\)/);
  assert.match(center, /existingFor\(event\)/);
  assert.match(center, /event\.localDate \|\| !event\.localTime/);
  assert.match(profile, /updatePreference\(false\)/);
  assert.match(profile, /action: "cancel"/);
  for (const phrase of ["Не пропустите важную дату", "Nepalaidiet garām svarīgu datumu", "Do not miss an important date"]) {
    assert.match(copy, new RegExp(phrase));
  }
});

test("reminder API authenticates the account and maps schedule requests to the protected RPC", async () => {
  const originalFetch = globalThis.fetch;
  process.env.WHATNOW_REMINDER_MODE = "pilot";
  process.env.WHATNOW_REMINDER_PILOT_EMAIL = "owner@example.com";
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({ id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", email_confirmed_at: "2026-07-14T10:00:00Z" });
    }
    if (String(url).includes("/rpc/schedule_email_reminder")) return Response.json({ id: "scheduled" });
    if (String(url).includes("reminder_preferences?")) return Response.json([{ email_consent_at: "2026-07-14T10:00:00Z", timezone: "Europe/Riga" }]);
    if (String(url).includes("email_reminders?")) return Response.json([]);
    return new Response(null, { status: 404 });
  };
  try {
    const { POST } = await import(`../app/api/reminders/route.ts?test=${Date.now()}`);
    const response = await POST(new Request("https://whatnow.example/api/reminders", {
      method: "POST",
      headers: { Authorization: "Bearer token.valid_123", Origin: "https://whatnow.example", "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "schedule",
        analysisId: "22222222-2222-4222-8222-222222222222",
        eventKey: "event_1",
        eventTitle: "Meeting",
        localDate: "2026-07-20",
        localTime: "14:00",
        timezone: "Europe/Riga",
        remindBeforeMinutes: 1_440,
        sourceLanguage: "lv",
      }),
    }));
    assert.equal(response.status, 200);
    const rpcCall = calls.find((call) => call.url.includes("/rpc/schedule_email_reminder"));
    assert.ok(rpcCall);
    const rpcBody = JSON.parse(String(rpcCall.init.body));
    assert.equal(rpcBody.p_remind_before_minutes, 1_440);
    assert.equal(rpcBody.p_timezone, "Europe/Riga");
    assert.equal(rpcBody.p_source_language, "lv");
    assert.equal(calls.filter((call) => call.url.includes("/rpc/schedule_email_reminder")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.WHATNOW_REMINDER_MODE;
    delete process.env.WHATNOW_REMINDER_PILOT_EMAIL;
  }
});
