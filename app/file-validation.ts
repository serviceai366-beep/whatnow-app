import type { SupportedLanguage } from "./analysis-schema.ts";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_TEXT_FILE_SIZE = 256 * 1024;
export const MAX_RTF_FILE_SIZE = 1024 * 1024;
export const MAX_RICH_DOCUMENT_SIZE = 5 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 50_000;

const documentTypes = {
  pdf: { kind: "pdf", mimeTypes: ["application/pdf"], maxSize: MAX_FILE_SIZE },
  jpg: { kind: "image", mimeTypes: ["image/jpeg"], maxSize: MAX_FILE_SIZE },
  jpeg: { kind: "image", mimeTypes: ["image/jpeg"], maxSize: MAX_FILE_SIZE },
  png: { kind: "image", mimeTypes: ["image/png"], maxSize: MAX_FILE_SIZE },
  webp: { kind: "image", mimeTypes: ["image/webp"], maxSize: MAX_FILE_SIZE },
  txt: { kind: "text", mimeTypes: ["text/plain"], maxSize: MAX_TEXT_FILE_SIZE },
  rtf: { kind: "document", mimeTypes: ["application/rtf", "text/rtf"], maxSize: MAX_RTF_FILE_SIZE },
  docx: {
    kind: "document",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    maxSize: MAX_RICH_DOCUMENT_SIZE,
  },
  odt: {
    kind: "document",
    mimeTypes: ["application/vnd.oasis.opendocument.text"],
    maxSize: MAX_RICH_DOCUMENT_SIZE,
  },
} as const;

export type DocumentKind = "image" | "pdf" | "text" | "document";
export type SupportedDocumentExtension = keyof typeof documentTypes;

type FileDescriptor = {
  name: string;
  size: number;
  type: string;
};

export type FileValidationResult =
  | { ok: true; kind: DocumentKind; extension: SupportedDocumentExtension }
  | { ok: false; code: "empty" | "too_large" | "unsupported"; message: string };

export function documentExtension(name: string): SupportedDocumentExtension | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return extension in documentTypes ? extension as SupportedDocumentExtension : null;
}

export function validateDocumentFile(file: FileDescriptor): FileValidationResult {
  if (file.size <= 0) {
    return { ok: false, code: "empty", message: "Файл пуст. Выберите другой документ." };
  }

  const extension = documentExtension(file.name);
  const mimeType = file.type.toLowerCase().trim();
  if (!extension) {
    return {
      ok: false,
      code: "unsupported",
      message: "Этот формат не поддерживается. Используйте PDF, изображение, TXT, RTF, DOCX или ODT.",
    };
  }

  const descriptor = documentTypes[extension];
  if (file.size > descriptor.maxSize) {
    return { ok: false, code: "too_large", message: "Файл превышает безопасный лимит размера для этого формата." };
  }

  if (!mimeType || descriptor.mimeTypes.includes(mimeType as never)) {
    return { ok: true, kind: descriptor.kind, extension };
  }

  return {
    ok: false,
    code: "unsupported",
    message: "Тип файла не соответствует его расширению.",
  };
}

export function canonicalDocumentMimeType(name: string): string | null {
  const extension = documentExtension(name);
  return extension ? documentTypes[extension].mimeTypes[0] : null;
}

export function safeDocumentFilename(name: string): string | null {
  const extension = documentExtension(name);
  return extension ? `document.${extension}` : null;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

type ZipEntry = {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

function inspectZip(bytes: Uint8Array): ZipEntry[] | null {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return null;
  const minimum = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (startsWith(bytes, [0x50, 0x4b, 0x05, 0x06], offset)) { eocd = offset; break; }
  }
  if (eocd < 0 || eocd + 22 > bytes.length) return null;

  const disk = readUint16(bytes, eocd + 4);
  const centralDisk = readUint16(bytes, eocd + 6);
  const diskEntries = readUint16(bytes, eocd + 8);
  const totalEntries = readUint16(bytes, eocd + 10);
  const centralSize = readUint32(bytes, eocd + 12);
  const centralOffset = readUint32(bytes, eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries || totalEntries === 0 || totalEntries > 1000) return null;
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) return null;
  if (centralOffset + centralSize > eocd || centralOffset >= bytes.length) return null;

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let expandedTotal = 0;
  try {
    for (let index = 0; index < totalEntries; index += 1) {
      if (offset + 46 > bytes.length || !startsWith(bytes, [0x50, 0x4b, 0x01, 0x02], offset)) return null;
      const flags = readUint16(bytes, offset + 8);
      const method = readUint16(bytes, offset + 10);
      const compressedSize = readUint32(bytes, offset + 20);
      const uncompressedSize = readUint32(bytes, offset + 24);
      const nameLength = readUint16(bytes, offset + 28);
      const extraLength = readUint16(bytes, offset + 30);
      const commentLength = readUint16(bytes, offset + 32);
      const localOffset = readUint32(bytes, offset + 42);
      const end = offset + 46 + nameLength + extraLength + commentLength;
      if (end > bytes.length || nameLength === 0 || (flags & 0x1) !== 0 || localOffset === 0xffffffff) return null;
      const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      if (name.includes("\\") || name.startsWith("/") || name.split("/").includes("..")) return null;
      expandedTotal += uncompressedSize;
      if (expandedTotal > 20 * 1024 * 1024) return null;
      if (!name.endsWith("/") && uncompressedSize > 0 && (compressedSize === 0 || uncompressedSize / compressedSize > 100)) return null;
      entries.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
      offset = end;
    }
  } catch {
    return null;
  }
  return offset === centralOffset + centralSize ? entries : null;
}

function storedEntryBytes(bytes: Uint8Array, entry: ZipEntry): Uint8Array | null {
  const offset = entry.localOffset;
  if (entry.method !== 0 || offset + 30 > bytes.length || !startsWith(bytes, [0x50, 0x4b, 0x03, 0x04], offset)) return null;
  const nameLength = readUint16(bytes, offset + 26);
  const extraLength = readUint16(bytes, offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  return end <= bytes.length ? bytes.subarray(start, end) : null;
}

function hasValidDocx(bytes: Uint8Array): boolean {
  const entries = inspectZip(bytes);
  if (!entries) return false;
  const names = new Set(entries.map((entry) => entry.name));
  return names.has("[Content_Types].xml") && names.has("_rels/.rels") && names.has("word/document.xml")
    && !names.has("word/vbaProject.bin");
}

function hasValidOdt(bytes: Uint8Array): boolean {
  const entries = inspectZip(bytes);
  if (!entries) return false;
  const mimeEntry = entries.find((entry) => entry.name === "mimetype");
  if (!mimeEntry || !entries.some((entry) => entry.name === "content.xml")) return false;
  const content = storedEntryBytes(bytes, mimeEntry);
  return Boolean(content && new TextDecoder().decode(content) === "application/vnd.oasis.opendocument.text");
}

export type TextDecodeResult =
  | { ok: true; text: string }
  | { ok: false; reason: "encoding" | "binary" | "empty" | "too_long" };

export function decodeTextDocument(bytes: Uint8Array): TextDecodeResult {
  let encoding = "utf-8";
  let offset = 0;
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) offset = 3;
  else if (startsWith(bytes, [0xff, 0xfe])) { encoding = "utf-16le"; offset = 2; }
  else if (startsWith(bytes, [0xfe, 0xff])) { encoding = "utf-16be"; offset = 2; }

  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset));
  } catch {
    return { ok: false, reason: "encoding" };
  }
  if (!text.trim()) return { ok: false, reason: "empty" };
  if (text.length > MAX_TEXT_LENGTH) return { ok: false, reason: "too_long" };
  let suspicious = 0;
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) suspicious += 1;
  }
  if (suspicious > 0 && suspicious / text.length > 0.01) return { ok: false, reason: "binary" };
  return { ok: true, text };
}

export function hasValidDocumentSignature(name: string, bytes: Uint8Array): boolean {
  const extension = documentExtension(name);
  if (!extension) return false;
  if (extension === "pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (extension === "jpg" || extension === "jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (extension === "png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === "webp") return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  if (extension === "txt") return decodeTextDocument(bytes).ok;
  if (extension === "rtf") {
    const offset = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
    return startsWith(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66], offset);
  }
  if (extension === "docx") return hasValidDocx(bytes);
  return hasValidOdt(bytes);
}

export function formatFileSize(bytes: number, locale: SupportedLanguage = "ru"): string {
  const localeName = locale === "ru" ? "ru-RU" : locale === "lv" ? "lv-LV" : "en-US";
  const units = locale === "ru" ? { kb: "КБ", mb: "МБ" } : { kb: "KB", mb: "MB" };
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(localeName)} ${units.kb}`;
  const value = new Intl.NumberFormat(localeName, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
  return `${value} ${units.mb}`;
}
