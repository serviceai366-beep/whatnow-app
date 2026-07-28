import type { SupportedLanguage } from "./analysis-schema";

// Interface locales are deliberately a smaller, fully curated set. The
// explanation selector supports the broader set in analysis-schema.ts.
export const profileLanguages = ["en", "ru", "lv", "es", "pt", "fr", "de"] as const;
export const profileThemes = ["system", "light", "dark"] as const;
export const profileFontScales = ["normal", "large"] as const;
export const profileDensities = ["comfortable", "compact"] as const;
export const profileWeekStarts = ["monday", "sunday"] as const;
export const profileTimeFormats = ["12", "24"] as const;
export const profileReminderMinutes = [60, 1_440, 10_080, 43_200] as const;
export const profileDefaultModels = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const;

export type ProfileLanguage = (typeof profileLanguages)[number];
export type ProfileTheme = (typeof profileThemes)[number];
export type ProfileFontScale = (typeof profileFontScales)[number];
export type ProfileDensity = (typeof profileDensities)[number];
export type ProfileWeekStartsOn = (typeof profileWeekStarts)[number];
export type ProfileTimeFormat = (typeof profileTimeFormats)[number];
export type ProfileReminderMinutes = (typeof profileReminderMinutes)[number];
export type ProfileDefaultModel = (typeof profileDefaultModels)[number];

export type UserProfilePreferences = {
  uiLanguage: ProfileLanguage;
  analysisLanguage: SupportedLanguage;
  theme: ProfileTheme;
  fontScale: ProfileFontScale;
  reducedMotion: boolean;
  density: ProfileDensity;
  weekStartsOn: ProfileWeekStartsOn;
  timeFormat: ProfileTimeFormat;
  defaultReminderMinutes: ProfileReminderMinutes;
  autoSaveFiles: boolean;
  defaultModel: ProfileDefaultModel;
};

export type UserProfilePatch = Partial<UserProfilePreferences>;

export const DEFAULT_PROFILE_PREFERENCES: Readonly<UserProfilePreferences> = Object.freeze({
  uiLanguage: "en",
  analysisLanguage: "en",
  theme: "system",
  fontScale: "normal",
  reducedMotion: false,
  density: "comfortable",
  weekStartsOn: "monday",
  timeFormat: "24",
  defaultReminderMinutes: 1_440,
  autoSaveFiles: true,
  defaultModel: "gpt-5.6-luna",
});
