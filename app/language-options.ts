import type { SupportedLanguage } from "./analysis-schema";
import type { ProfileLanguage } from "./profile-types";

export type LanguageOption = {
  code: SupportedLanguage;
  nativeName: string;
  englishName: string;
  region: "Europe" | "South America";
};

export const responseLanguageOptions: readonly LanguageOption[] = [
  { code: "en", nativeName: "English", englishName: "English", region: "Europe" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", region: "Europe" },
  { code: "lv", nativeName: "Latviešu", englishName: "Latvian", region: "Europe" },
  { code: "es", nativeName: "Español", englishName: "Spanish", region: "South America" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese", region: "South America" },
  { code: "fr", nativeName: "Français", englishName: "French", region: "Europe" },
  { code: "de", nativeName: "Deutsch", englishName: "German", region: "Europe" },
  { code: "it", nativeName: "Italiano", englishName: "Italian", region: "Europe" },
  { code: "pl", nativeName: "Polski", englishName: "Polish", region: "Europe" },
  { code: "uk", nativeName: "Українська", englishName: "Ukrainian", region: "Europe" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch", region: "Europe" },
  { code: "ro", nativeName: "Română", englishName: "Romanian", region: "Europe" },
  { code: "sv", nativeName: "Svenska", englishName: "Swedish", region: "Europe" },
  { code: "cs", nativeName: "Čeština", englishName: "Czech", region: "Europe" },
] as const;

export const interfaceLanguageOptions = responseLanguageOptions.filter((option): option is LanguageOption & { code: ProfileLanguage } =>
  ["en", "ru", "lv", "es", "pt", "fr", "de"].includes(option.code),
);

export function interfaceCopyFallback(language: ProfileLanguage): "en" | "ru" | "lv" {
  return language === "ru" || language === "lv" ? language : "en";
}

export function languageOption(language: SupportedLanguage): LanguageOption {
  return responseLanguageOptions.find((option) => option.code === language) ?? responseLanguageOptions[0]!;
}
