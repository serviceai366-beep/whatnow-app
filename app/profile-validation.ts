import {
  profileDensities,
  profileDefaultModels,
  profileFontScales,
  profileLanguages,
  profileReminderMinutes,
  profileThemes,
  profileTimeFormats,
  profileWeekStarts,
  type UserProfilePatch,
  type UserProfilePreferences,
} from "./profile-types.ts";

const profileKeys = [
  "uiLanguage",
  "analysisLanguage",
  "theme",
  "fontScale",
  "reducedMotion",
  "density",
  "weekStartsOn",
  "timeFormat",
  "defaultReminderMinutes",
  "autoSaveFiles",
  "defaultModel",
] as const satisfies readonly (keyof UserProfilePreferences)[];

type ProfileKey = (typeof profileKeys)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowed<T>(allowed: readonly T[], value: unknown): value is T {
  return allowed.includes(value as T);
}

function isValidValue(key: ProfileKey, value: unknown): boolean {
  switch (key) {
    case "uiLanguage":
    case "analysisLanguage":
      return isAllowed(profileLanguages, value);
    case "theme":
      return isAllowed(profileThemes, value);
    case "fontScale":
      return isAllowed(profileFontScales, value);
    case "reducedMotion":
    case "autoSaveFiles":
      return typeof value === "boolean";
    case "density":
      return isAllowed(profileDensities, value);
    case "weekStartsOn":
      return isAllowed(profileWeekStarts, value);
    case "timeFormat":
      return isAllowed(profileTimeFormats, value);
    case "defaultReminderMinutes":
      return isAllowed(profileReminderMinutes, value);
    case "defaultModel":
      return isAllowed(profileDefaultModels, value);
  }
}

export function parseUserProfilePatch(value: unknown): UserProfilePatch | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !profileKeys.includes(key as ProfileKey))) return null;
  for (const key of keys as ProfileKey[]) {
    if (!isValidValue(key, value[key])) return null;
  }
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as UserProfilePatch;
}

export function parseUserProfilePreferences(value: unknown): UserProfilePreferences | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).length !== profileKeys.length) return null;
  const patch = parseUserProfilePatch(value);
  if (!patch || profileKeys.some((key) => !(key in patch))) return null;
  return patch as UserProfilePreferences;
}

export function profilePreferencesFromDatabaseRow(value: unknown): UserProfilePreferences | null {
  if (!isRecord(value)) return null;
  return parseUserProfilePreferences({
    uiLanguage: value.ui_language,
    analysisLanguage: value.analysis_language,
    theme: value.theme,
    fontScale: value.font_scale,
    reducedMotion: value.reduced_motion,
    density: value.density,
    weekStartsOn: value.week_starts_on,
    timeFormat: value.time_format,
    defaultReminderMinutes: value.default_reminder_minutes,
    autoSaveFiles: value.auto_save_files,
    // Existing accounts created before model choice was introduced keep the
    // safe default until they explicitly choose another Pro model.
    defaultModel: value.default_model ?? "gpt-5.6-luna",
  });
}

export function profilePatchToRpcPayload(patch: UserProfilePatch): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (patch.uiLanguage !== undefined) payload.p_ui_language = patch.uiLanguage;
  if (patch.analysisLanguage !== undefined) payload.p_analysis_language = patch.analysisLanguage;
  if (patch.theme !== undefined) payload.p_theme = patch.theme;
  if (patch.fontScale !== undefined) payload.p_font_scale = patch.fontScale;
  if (patch.reducedMotion !== undefined) payload.p_reduced_motion = patch.reducedMotion;
  if (patch.density !== undefined) payload.p_density = patch.density;
  if (patch.weekStartsOn !== undefined) payload.p_week_starts_on = patch.weekStartsOn;
  if (patch.timeFormat !== undefined) payload.p_time_format = patch.timeFormat;
  if (patch.defaultReminderMinutes !== undefined) payload.p_default_reminder_minutes = patch.defaultReminderMinutes;
  if (patch.autoSaveFiles !== undefined) payload.p_auto_save_files = patch.autoSaveFiles;
  if (patch.defaultModel !== undefined) payload.p_default_model = patch.defaultModel;
  return payload;
}
