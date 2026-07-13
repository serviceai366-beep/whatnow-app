export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 50_000;

const documentTypes = {
  pdf: { kind: "pdf", mimeTypes: ["application/pdf"] },
  jpg: { kind: "image", mimeTypes: ["image/jpeg"] },
  jpeg: { kind: "image", mimeTypes: ["image/jpeg"] },
  png: { kind: "image", mimeTypes: ["image/png"] },
  webp: { kind: "image", mimeTypes: ["image/webp"] },
} as const;

export type DocumentKind = "image" | "pdf";

type FileDescriptor = {
  name: string;
  size: number;
  type: string;
};

export type FileValidationResult =
  | { ok: true; kind: DocumentKind }
  | { ok: false; code: "empty" | "too_large" | "unsupported"; message: string };

function documentExtension(name: string): keyof typeof documentTypes | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return extension in documentTypes ? extension as keyof typeof documentTypes : null;
}

export function validateDocumentFile(file: FileDescriptor): FileValidationResult {
  if (file.size <= 0) {
    return { ok: false, code: "empty", message: "Файл пуст. Выберите другой документ." };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, code: "too_large", message: "Файл больше 10 МБ. Уменьшите его размер и попробуйте снова." };
  }

  const extension = documentExtension(file.name);
  const mimeType = file.type.toLowerCase().trim();
  if (extension) {
    const descriptor = documentTypes[extension];
    if (!mimeType || descriptor.mimeTypes.includes(mimeType as never)) {
      return { ok: true, kind: descriptor.kind };
    }
  }

  return {
    ok: false,
    code: "unsupported",
    message: "Этот формат не поддерживается. Используйте PDF, JPG, PNG или WEBP.",
  };
}

export function canonicalDocumentMimeType(name: string): string | null {
  const extension = documentExtension(name);
  return extension ? documentTypes[extension].mimeTypes[0] : null;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function hasValidDocumentSignature(name: string, bytes: Uint8Array): boolean {
  const extension = documentExtension(name);
  if (!extension) return false;
  if (extension === "pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (extension === "jpg" || extension === "jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (extension === "png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
}

export function formatFileSize(bytes: number, locale: SupportedLanguage = "ru"): string {
  const localeName = locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-US";
  const units = locale === "ru" ? { kb: "КБ", mb: "МБ" } : { kb: "KB", mb: "MB" };
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(localeName)} ${units.kb}`;
  const value = new Intl.NumberFormat(localeName, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
  return `${value} ${units.mb}`;
}
import type { SupportedLanguage } from "./analysis-schema.ts";
