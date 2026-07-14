export const profileLanguages = ["en", "ru", "lv"] as const;
export const profileThemes = ["system", "light", "dark"] as const;
export const profileFontScales = ["normal", "large"] as const;
export const profileDensities = ["comfortable", "compact"] as const;
export const profileWeekStarts = ["monday", "sunday"] as const;
export const profileTimeFormats = ["12", "24"] as const;
export const profileReminderMinutes = [60, 1_440, 10_080, 43_200] as const;

export type ProfileLanguage = (typeof profileLanguages)[number];
export type ProfileTheme = (typeof profileThemes)[number];
export type ProfileFontScale = (typeof profileFontScales)[number];
export type ProfileDensity = (typeof profileDensities)[number];
export type ProfileWeekStartsOn = (typeof profileWeekStarts)[number];
export type ProfileTimeFormat = (typeof profileTimeFormats)[number];
export type ProfileReminderMinutes = (typeof profileReminderMinutes)[number];

export type UserProfilePreferences = {
  uiLanguage: ProfileLanguage;
  analysisLanguage: ProfileLanguage;
  theme: ProfileTheme;
  fontScale: ProfileFontScale;
  reducedMotion: boolean;
  density: ProfileDensity;
  weekStartsOn: ProfileWeekStartsOn;
  timeFormat: ProfileTimeFormat;
  defaultReminderMinutes: ProfileReminderMinutes;
  autoSaveFiles: boolean;
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
});
