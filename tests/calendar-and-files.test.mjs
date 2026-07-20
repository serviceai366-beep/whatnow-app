import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deleteUserFile,
  FileStoreError,
  listUserFiles,
  saveUserFile,
  USER_FILE_COUNT_LIMIT,
} from "../app/file-store.ts";
import { parseCalendarAction, parseCalendarRange } from "../app/calendar-validation.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

function memoryRuntime() {
  const rows = new Map();
  const objects = new Map();
  return {
    rows,
    objects,
    metadata: {
      async initialize() {},
      async consumeUploadBudget() { return true; },
      async reserve(input) {
        const duplicate = [...rows.values()].find((row) => row.userId === input.userId && row.sha256 === input.sha256);
        if (duplicate) return duplicate.status === "ready" ? { kind: "duplicate", row: duplicate } : { kind: "rejected", code: "file_upload_in_progress" };
        const owned = [...rows.values()].filter((row) => row.userId === input.userId);
        if (owned.length >= USER_FILE_COUNT_LIMIT) return { kind: "rejected", code: "file_count_limit" };
        const row = { ...input, status: "pending" };
        rows.set(row.id, row);
        return { kind: "reserved", row };
      },
      async markReady(userId, id, now) {
        const row = rows.get(id);
        if (!row || row.userId !== userId || row.status !== "pending") return false;
        rows.set(id, { ...row, status: "ready", updatedAt: now });
        return true;
      },
      async findOwned(userId, id, readyOnly = false) {
        const row = rows.get(id);
        return row && row.userId === userId && (!readyOnly || row.status === "ready") ? row : null;
      },
      async list(userId) { return [...rows.values()].filter((row) => row.userId === userId && row.status === "ready"); },
      async usage(userId) {
        const owned = [...rows.values()].filter((row) => row.userId === userId);
        return { count: owned.length, bytes: owned.reduce((total, row) => total + row.sizeBytes, 0) };
      },
      async stalePending() { return []; },
      async remove(userId, id) {
        const row = rows.get(id);
        return Boolean(row && row.userId === userId && rows.delete(id));
      },
    },
    bucket: {
      async put(key, value) { objects.set(key, new Uint8Array(value)); },
      async get(key) { const body = objects.get(key); return body ? { body, size: body.byteLength } : null; },
      async delete(key) { objects.delete(key); },
    },
  };
}

test("private file storage deduplicates, reports live quota, and enforces ownership", async () => {
  const runtime = memoryRuntime();
  const bytes = new TextEncoder().encode("Conference on 2026-08-20 at 10:00.");
  const first = await saveUserFile({ userId: USER_ID, name: "conference.txt", declaredMimeType: "text/plain", bytes, runtime });
  const duplicate = await saveUserFile({ userId: USER_ID, name: "copy.txt", declaredMimeType: "text/plain", bytes, runtime });
  assert.equal(first.deduplicated, false);
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.file.id, first.file.id);

  const snapshot = await listUserFiles(USER_ID, runtime);
  assert.equal(snapshot.files.length, 1);
  assert.equal(snapshot.usage.count, 1);
  assert.equal(snapshot.usage.remainingCount, 9);
  assert.equal(snapshot.usage.bytes, bytes.byteLength);
  assert.equal(await deleteUserFile(OTHER_USER_ID, first.file.id, runtime), false);
  assert.equal(await deleteUserFile(USER_ID, first.file.id, runtime), true);
  assert.equal((await listUserFiles(USER_ID, runtime)).usage.count, 0);
  assert.equal(runtime.objects.size, 0);
});

test("private file storage blocks the eleventh file and malformed content", async () => {
  const runtime = memoryRuntime();
  for (let index = 0; index < USER_FILE_COUNT_LIMIT; index += 1) {
    await saveUserFile({
      userId: USER_ID,
      name: `note-${index}.txt`,
      declaredMimeType: "text/plain",
      bytes: new TextEncoder().encode(`Safe document number ${index}.`),
      runtime,
    });
  }
  await assert.rejects(
    saveUserFile({ userId: USER_ID, name: "eleventh.txt", declaredMimeType: "text/plain", bytes: new TextEncoder().encode("One more safe document."), runtime }),
    (error) => error instanceof FileStoreError && error.code === "file_count_limit" && error.status === 409,
  );
  await assert.rejects(
    saveUserFile({ userId: OTHER_USER_ID, name: "fake.pdf", declaredMimeType: "application/pdf", bytes: new TextEncoder().encode("not a PDF"), runtime }),
    (error) => error instanceof FileStoreError && error.code === "invalid_file_content",
  );
});

test("calendar validation accepts bounded user actions and rejects ambiguous event data", () => {
  const valid = {
    action: "create_manual",
    requestId: "33333333-3333-4333-8333-333333333333",
    sourceLanguage: "en",
    eventTitle: "University conference",
    localDate: "2026-08-20",
    localTime: "10:00",
    timezone: "Europe/Riga",
    isAllDay: false,
    location: "Riga",
    notes: "Bring identification",
    remindBeforeMinutes: 1_440,
  };
  assert.deepEqual(parseCalendarAction(valid), valid);
  assert.deepEqual(parseCalendarAction({ ...valid, remindBeforeMinutes: 0 }), { ...valid, remindBeforeMinutes: 0 });
  assert.equal(parseCalendarAction({ ...valid, eventTitle: "" }), null);
  assert.equal(parseCalendarAction({ ...valid, timezone: "GMT+3" }), null);
  assert.equal(parseCalendarAction({ ...valid, isAllDay: true, localTime: null }), null);
  assert.equal(parseCalendarAction({ ...valid, remindBeforeMinutes: 30 }), null);
  assert.deepEqual(parseCalendarRange("2026-01-01", "2026-12-31"), { from: "2026-01-01", to: "2026-12-31" });
  assert.equal(parseCalendarRange("2026-12-31", "2026-01-01"), null);
});

test("calendar database design is private, bounded, and keeps reminders linked after history trimming", async () => {
  const [migration, exactReminderMigration, limitMigration, languageMigration, api, panel, suggestions] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260714000000_calendar_events.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260715120100_exact_calendar_reminders.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260715120200_reminder_limits.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260720150000_extended_content_languages.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/calendar/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/calendar-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/event-suggestions.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /alter table public\.calendar_events enable row level security/i);
  assert.match(migration, /auth\.uid\(\) = user_id/i);
  assert.match(migration, /references public\.document_analyses\(id\) on delete set null/i);
  assert.match(migration, /active_event_limit/i);
  assert.match(migration, /active_reminder_limit/i);
  assert.match(migration, /event_at > pg_catalog\.now\(\)/i);
  assert.match(migration, /security definer/i);
  assert.match(api, /verifySupabaseRequest\(request\)/);
  assert.match(api, /isSameOriginRequest\(request\)/);
  assert.match(api, /confirm_analysis_calendar_event/);
  assert.match(api, /create_manual_calendar_event_with_reminder/);
  assert.doesNotMatch(api, /service_role/i);
  assert.match(exactReminderMigration, /remind_before_minutes in \(0, 60, 1440, 10080, 43200\)/i);
  assert.match(exactReminderMigration, /create_manual_calendar_event_with_reminder/i);
  assert.match(exactReminderMigration, /remind_before_minutes = 0[\s\S]*interval '15 minutes'/i);
  assert.match(limitMigration, /alter table public\.reminder_schedule_usage enable row level security/i);
  assert.match(limitMigration, /pg_advisory_xact_lock/i);
  assert.match(limitMigration, />= 3[\s\S]*active_reminder_limit/i);
  assert.match(limitMigration, /interval '7 days'[\s\S]*>= 10[\s\S]*weekly_reminder_limit/i);
  assert.match(limitMigration, /insert into public\.reminder_schedule_usage/i);
  assert.match(api, /weekly_reminder_limit/);
  assert.match(api, /supportedLanguages\.includes/);
  assert.match(languageMigration, /document_analyses_language_check/i);
  assert.match(languageMigration, /calendar_events_source_language_check/i);
  assert.match(languageMigration, /email_reminders_source_language_check/i);
  assert.match(languageMigration, /'es'.*'pt'.*'fr'.*'de'.*'it'.*'pl'.*'uk'.*'nl'.*'ro'.*'sv'.*'cs'/is);
  assert.match(languageMigration, /confirm_analysis_calendar_event/);
  assert.match(languageMigration, /create_manual_calendar_event/);
  assert.match(languageMigration, /schedule_email_reminder/);
  assert.match(languageMigration, /regexp_replace/);
  assert.match(panel, /reminderQuotaBlocked/);
  assert.match(suggestions, /reminderQuotaBlocked/);
  assert.match(panel, /onClick=\{\(\) => openNew\(key\)\}/);
  assert.match(panel, /offset === 0 \? t\.exact/);
  assert.doesNotMatch(panel, /disabled=\{busy \|\| !draft\.title\.trim\(\)[^}]*consentChecked/);
  assert.doesNotMatch(suggestions, /disabled=\{[^}]*consentChecked/);
});
