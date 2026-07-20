import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_PROFILE_PREFERENCES,
  profileReminderMinutes,
} from "../app/profile-types.ts";
import {
  parseUserProfilePatch,
  parseUserProfilePreferences,
  profilePatchToRpcPayload,
  profilePreferencesFromDatabaseRow,
} from "../app/profile-validation.ts";

const completeProfile = {
  uiLanguage: "ru",
  analysisLanguage: "lv",
  theme: "dark",
  fontScale: "large",
  reducedMotion: true,
  density: "compact",
  weekStartsOn: "sunday",
  timeFormat: "12",
  defaultReminderMinutes: 10_080,
  autoSaveFiles: true,
};

test("new profiles have safe English-first defaults", () => {
  assert.equal(DEFAULT_PROFILE_PREFERENCES.uiLanguage, "en");
  assert.equal(DEFAULT_PROFILE_PREFERENCES.analysisLanguage, "en");
  assert.equal(DEFAULT_PROFILE_PREFERENCES.theme, "system");
  assert.equal(DEFAULT_PROFILE_PREFERENCES.autoSaveFiles, true);
  assert.deepEqual(profileReminderMinutes, [60, 1_440, 10_080, 43_200]);
});

test("accepts complete preferences and strict partial patches", () => {
  assert.deepEqual(parseUserProfilePreferences(completeProfile), completeProfile);
  assert.deepEqual(parseUserProfilePatch({ uiLanguage: "en", reducedMotion: false }), {
    uiLanguage: "en",
    reducedMotion: false,
  });
  assert.deepEqual(profilePatchToRpcPayload({ uiLanguage: "lv", autoSaveFiles: true }), {
    p_ui_language: "lv",
    p_auto_save_files: true,
  });
});

test("rejects empty, unknown, incomplete, and out-of-range preference data", () => {
  const invalid = [
    null,
    [],
    {},
    { unknown: true },
    { uiLanguage: "it" },
    { analysisLanguage: "fi" },
    { analysisLanguage: null },
    { theme: "automatic" },
    { fontScale: "huge" },
    { reducedMotion: 1 },
    { density: "dense" },
    { weekStartsOn: "tuesday" },
    { timeFormat: "13" },
    { defaultReminderMinutes: 30 },
    { autoSaveFiles: "yes" },
  ];
  for (const value of invalid) assert.equal(parseUserProfilePatch(value), null);
  assert.equal(parseUserProfilePreferences({ ...completeProfile, uiLanguage: undefined }), null);
  assert.equal(parseUserProfilePreferences({ ...completeProfile, extra: true }), null);
});

test("maps only validated database fields into the public profile shape", () => {
  const row = {
    user_id: "11111111-1111-4111-8111-111111111111",
    ui_language: "ru",
    analysis_language: "lv",
    theme: "dark",
    font_scale: "large",
    reduced_motion: true,
    density: "compact",
    week_starts_on: "sunday",
    time_format: "12",
    default_reminder_minutes: 10_080,
    auto_save_files: true,
    created_at: "2026-07-14T10:00:00.000Z",
  };
  assert.deepEqual(profilePreferencesFromDatabaseRow(row), completeProfile);
  assert.equal(profilePreferencesFromDatabaseRow({ ...row, default_reminder_minutes: 15 }), null);
});

test("profile storage is account-owned and writable only through SECURITY DEFINER RPCs", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260714120200_user_profiles.sql", import.meta.url), "utf8");
  assert.match(migration, /ui_language text not null default 'en'/i);
  assert.match(migration, /analysis_language text not null default 'en'/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /auth\.uid\(\) = user_id/i);
  assert.match(migration, /revoke all on table public\.user_profiles from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.user_profiles to authenticated/i);
  assert.match(migration, /function public\.get_user_profile\(\)[\s\S]*security definer/i);
  assert.match(migration, /function public\.update_user_profile\([\s\S]*security definer/i);
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.doesNotMatch(migration, /p_user_id|service_role/);
});

test("settings component is internally localized and exposes accessible controls", async () => {
  const [component, client] = await Promise.all([
    readFile(new URL("../app/profile-settings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/profile-client.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /en:\s*\{/);
  assert.match(component, /ru:\s*\{/);
  assert.match(component, /lv:\s*\{/);
  assert.match(component, /es:\s*\{/);
  assert.match(component, /responseLanguageOptions/);
  assert.match(component, /<fieldset/);
  assert.match(component, /<legend>/);
  assert.match(component, /htmlFor=/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /role="alert"/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /cache: "no-store"/);
});
