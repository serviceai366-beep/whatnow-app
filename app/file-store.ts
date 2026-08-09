import {
  canonicalDocumentMimeType,
  hasValidDocumentSignature,
  validateDocumentFile,
  type SupportedDocumentExtension,
} from "./file-validation.ts";

export const USER_FILE_COUNT_LIMIT = 10;
export const USER_FILE_BYTES_LIMIT = 25 * 1024 * 1024;
export const USER_UPLOAD_BYTES_24H_LIMIT = 50 * 1024 * 1024;
export const GLOBAL_FILE_BYTES_LIMIT = 2 * 1024 * 1024 * 1024;

const UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;

export type StoredUserFile = {
  id: string;
  originalName: string;
  extension: SupportedDocumentExtension;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: number;
};

export type FileStorageUsage = {
  count: number;
  countLimit: number;
  remainingCount: number;
  bytes: number;
  bytesLimit: number;
  remainingBytes: number;
};

export type FileStorageSnapshot = {
  files: StoredUserFile[];
  usage: FileStorageUsage;
};

type FileStatus = "pending" | "ready";

type StoredFileRow = StoredUserFile & {
  userId: string;
  objectKey: string;
  status: FileStatus;
  updatedAt: number;
};

type ReserveInput = Omit<StoredFileRow, "status">;

type ReserveResult =
  | { kind: "reserved"; row: StoredFileRow }
  | { kind: "duplicate"; row: StoredFileRow }
  | { kind: "rejected"; code: "file_count_limit" | "file_bytes_limit" | "global_file_bytes_limit" | "file_upload_in_progress" | "file_storage_conflict" };

type ReserveRejectionCode = Extract<ReserveResult, { kind: "rejected" }>["code"];

type UsageRow = { count: number; bytes: number };

export type FileMetadataStore = {
  initialize(): Promise<void>;
  consumeUploadBudget(userId: string, sizeBytes: number, now: number): Promise<boolean>;
  reserve(input: ReserveInput): Promise<ReserveResult>;
  markReady(userId: string, id: string, now: number): Promise<boolean>;
  findOwned(userId: string, id: string, readyOnly?: boolean): Promise<StoredFileRow | null>;
  list(userId: string): Promise<StoredFileRow[]>;
  usage(userId: string): Promise<UsageRow>;
  stalePending(cutoff: number, limit: number): Promise<StoredFileRow[]>;
  remove(userId: string, id: string): Promise<boolean>;
};

export type R2StoredObjectLike = {
  body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array;
  size?: number;
};

export type PrivateFileBucket = {
  put(
    key: string,
    value: Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string; contentDisposition?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2StoredObjectLike | null>;
  delete(key: string): Promise<void>;
};

export type FileStoreRuntime = {
  metadata: FileMetadataStore;
  bucket: PrivateFileBucket;
};

export type FileStoreErrorCode =
  | "empty_file"
  | "unsupported_file"
  | "file_too_large"
  | "invalid_file_content"
  | "file_count_limit"
  | "file_bytes_limit"
  | "upload_bytes_limit"
  | "global_file_bytes_limit"
  | "file_upload_in_progress"
  | "file_storage_unavailable";

export class FileStoreError extends Error {
  readonly code: FileStoreErrorCode;
  readonly status: 400 | 409 | 413 | 429 | 503;

  constructor(code: FileStoreErrorCode, status: 400 | 409 | 413 | 429 | 503) {
    super(code);
    this.name = "FileStoreError";
    this.code = code;
    this.status = status;
  }
}

export type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] } | T[]>;
  run(): Promise<unknown>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown>;
};

type DatabaseFileRow = {
  id: string;
  user_id: string;
  object_key: string;
  original_name: string;
  extension: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  status: string;
  created_at: number;
  updated_at: number;
};

function isExtension(value: string): value is SupportedDocumentExtension {
  return ["pdf", "jpg", "jpeg", "png", "webp", "txt", "rtf", "docx", "odt"].includes(value);
}

function rowFromDatabase(row: DatabaseFileRow | null): StoredFileRow | null {
  if (
    !row || typeof row.id !== "string" || typeof row.user_id !== "string"
    || typeof row.object_key !== "string" || typeof row.original_name !== "string"
    || typeof row.extension !== "string" || !isExtension(row.extension)
    || typeof row.mime_type !== "string" || !Number.isSafeInteger(row.size_bytes) || row.size_bytes <= 0
    || typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.sha256)
    || (row.status !== "pending" && row.status !== "ready")
    || !Number.isSafeInteger(row.created_at) || !Number.isSafeInteger(row.updated_at)
  ) return null;
  return {
    id: row.id,
    userId: row.user_id,
    objectKey: row.object_key,
    originalName: row.original_name,
    extension: row.extension,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function allRows<T>(statement: D1StatementLike): Promise<T[]> {
  const value = await statement.all<T>();
  return Array.isArray(value) ? value : Array.isArray(value.results) ? value.results : [];
}

const FILE_COLUMNS = "id,user_id,object_key,original_name,extension,mime_type,size_bytes,sha256,status,created_at,updated_at";

export function createD1FileMetadataStore(db: D1DatabaseLike): FileMetadataStore {
  let initialization: Promise<void> | null = null;

  const initialize = () => {
    initialization ??= (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS user_files (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        extension TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
        sha256 TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (user_id, sha256)
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS user_file_upload_events (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        uploaded_at INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0)
      )`).run();
      await db.batch([
        db.prepare("CREATE INDEX IF NOT EXISTS user_files_user_created_idx ON user_files (user_id, created_at)"),
        db.prepare("CREATE INDEX IF NOT EXISTS user_files_status_updated_idx ON user_files (status, updated_at)"),
        db.prepare("CREATE INDEX IF NOT EXISTS user_file_upload_events_user_time_idx ON user_file_upload_events (user_id, uploaded_at)"),
        db.prepare("CREATE INDEX IF NOT EXISTS user_file_upload_events_time_idx ON user_file_upload_events (uploaded_at)"),
      ]);
    })();
    return initialization;
  };

  const findByHash = async (userId: string, sha256: string) => rowFromDatabase(await db.prepare(
    `SELECT ${FILE_COLUMNS} FROM user_files WHERE user_id = ? AND sha256 = ? LIMIT 1`,
  ).bind(userId, sha256).first<DatabaseFileRow>());

  const readUsage = async (userId: string): Promise<UsageRow> => {
    const row = await db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
      FROM user_files WHERE user_id = ? AND status IN ('pending', 'ready')`).bind(userId).first<{ count: number | null; bytes: number | null }>();
    return { count: Number(row?.count ?? 0), bytes: Number(row?.bytes ?? 0) };
  };

  return {
    initialize,
    async consumeUploadBudget(userId, sizeBytes, now) {
      await initialize();
      const cutoff = now - UPLOAD_WINDOW_MS;
      await db.prepare("DELETE FROM user_file_upload_events WHERE uploaded_at <= ?").bind(cutoff).run();
      const inserted = await db.prepare(`INSERT INTO user_file_upload_events (id, user_id, uploaded_at, size_bytes)
        SELECT ?, ?, ?, ?
        WHERE COALESCE((SELECT SUM(size_bytes) FROM user_file_upload_events WHERE user_id = ? AND uploaded_at > ?), 0) + ? <= ?
        RETURNING id`).bind(
        crypto.randomUUID(), userId, now, sizeBytes,
        userId, cutoff, sizeBytes, USER_UPLOAD_BYTES_24H_LIMIT,
      ).first<{ id: string }>();
      return Boolean(inserted?.id);
    },
    async reserve(input) {
      await initialize();
      const inserted = await db.prepare(`INSERT OR IGNORE INTO user_files
        (${FILE_COLUMNS})
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?
        WHERE (SELECT COUNT(*) FROM user_files WHERE user_id = ? AND status IN ('pending', 'ready')) < ?
          AND COALESCE((SELECT SUM(size_bytes) FROM user_files WHERE user_id = ? AND status IN ('pending', 'ready')), 0) + ? <= ?
          AND COALESCE((SELECT SUM(size_bytes) FROM user_files WHERE status IN ('pending', 'ready')), 0) + ? <= ?
        RETURNING ${FILE_COLUMNS}`).bind(
        input.id, input.userId, input.objectKey, input.originalName, input.extension,
        input.mimeType, input.sizeBytes, input.sha256, input.createdAt, input.updatedAt,
        input.userId, USER_FILE_COUNT_LIMIT,
        input.userId, input.sizeBytes, USER_FILE_BYTES_LIMIT,
        input.sizeBytes, GLOBAL_FILE_BYTES_LIMIT,
      ).first<DatabaseFileRow>();
      const reserved = rowFromDatabase(inserted);
      if (reserved) return { kind: "reserved", row: reserved };

      const duplicate = await findByHash(input.userId, input.sha256);
      if (duplicate?.status === "ready") return { kind: "duplicate", row: duplicate };
      if (duplicate?.status === "pending") return { kind: "rejected", code: "file_upload_in_progress" };

      const usage = await readUsage(input.userId);
      if (usage.count >= USER_FILE_COUNT_LIMIT) return { kind: "rejected", code: "file_count_limit" };
      if (usage.bytes + input.sizeBytes > USER_FILE_BYTES_LIMIT) return { kind: "rejected", code: "file_bytes_limit" };
      const global = await db.prepare("SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM user_files WHERE status IN ('pending', 'ready')")
        .first<{ bytes: number | null }>();
      if (Number(global?.bytes ?? 0) + input.sizeBytes > GLOBAL_FILE_BYTES_LIMIT) {
        return { kind: "rejected", code: "global_file_bytes_limit" };
      }
      return { kind: "rejected", code: "file_storage_conflict" };
    },
    async markReady(userId, id, now) {
      await initialize();
      const row = await db.prepare("UPDATE user_files SET status = 'ready', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending' RETURNING id")
        .bind(now, id, userId).first<{ id: string }>();
      return row?.id === id;
    },
    async findOwned(userId, id, readyOnly = false) {
      await initialize();
      const row = await db.prepare(`SELECT ${FILE_COLUMNS} FROM user_files WHERE id = ? AND user_id = ?${readyOnly ? " AND status = 'ready'" : ""} LIMIT 1`)
        .bind(id, userId).first<DatabaseFileRow>();
      return rowFromDatabase(row);
    },
    async list(userId) {
      await initialize();
      const rows = await allRows<DatabaseFileRow>(db.prepare(
        `SELECT ${FILE_COLUMNS} FROM user_files WHERE user_id = ? AND status = 'ready' ORDER BY created_at DESC, id DESC LIMIT ?`,
      ).bind(userId, USER_FILE_COUNT_LIMIT));
      return rows.map(rowFromDatabase).filter((row): row is StoredFileRow => Boolean(row));
    },
    async usage(userId) {
      await initialize();
      return readUsage(userId);
    },
    async stalePending(cutoff, limit) {
      await initialize();
      const rows = await allRows<DatabaseFileRow>(db.prepare(
        `SELECT ${FILE_COLUMNS} FROM user_files WHERE status = 'pending' AND updated_at <= ? ORDER BY updated_at ASC LIMIT ?`,
      ).bind(cutoff, Math.max(1, Math.min(limit, 100))));
      return rows.map(rowFromDatabase).filter((row): row is StoredFileRow => Boolean(row));
    },
    async remove(userId, id) {
      await initialize();
      const row = await db.prepare("DELETE FROM user_files WHERE id = ? AND user_id = ? RETURNING id")
        .bind(id, userId).first<{ id: string }>();
      return row?.id === id;
    },
  };
}

let runtimePromise: Promise<FileStoreRuntime> | null = null;

async function resolveRuntime(): Promise<FileStoreRuntime> {
  runtimePromise ??= (async () => {
    try {
      const cloudflare = await import("cloudflare:workers");
      const bindings = cloudflare.env as unknown as { DB?: D1DatabaseLike; FILES?: PrivateFileBucket };
      if (!bindings.DB || !bindings.FILES) throw new Error("missing_binding");
      return { metadata: createD1FileMetadataStore(bindings.DB), bucket: bindings.FILES };
    } catch {
      throw new FileStoreError("file_storage_unavailable", 503);
    }
  })();
  return runtimePromise;
}

function publicFile(row: StoredFileRow): StoredUserFile {
  return {
    id: row.id,
    originalName: row.originalName,
    extension: row.extension,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    createdAt: row.createdAt,
  };
}

function normalizeUserId(value: string): string {
  const userId = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new FileStoreError("file_storage_unavailable", 503);
  }
  return userId;
}

export function sanitizeStoredFilename(name: string, extension: SupportedDocumentExtension): string {
  const leaf = name.replaceAll("\\", "/").split("/").pop() ?? "";
  const cleaned = leaf.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[ .]+|[ .]+$/g, "");
  const suffix = `.${extension}`;
  const withoutSuffix = cleaned.toLowerCase().endsWith(suffix) ? cleaned.slice(0, -suffix.length) : cleaned;
  const base = withoutSuffix.replace(/[ .]+$/g, "").slice(0, Math.max(1, 160 - suffix.length)) || "document";
  return `${base}${suffix}`;
}

export function attachmentContentDisposition(name: string, extension: SupportedDocumentExtension): string {
  const safeName = sanitizeStoredFilename(name, extension);
  const asciiFallback = `document.${extension}`;
  const encoded = encodeURIComponent(safeName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

async function sha256(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cleanupStalePending(runtime: FileStoreRuntime, now: number): Promise<void> {
  const stale = await runtime.metadata.stalePending(now - PENDING_TTL_MS, 50);
  for (const row of stale) {
    try {
      await runtime.bucket.delete(row.objectKey);
      await runtime.metadata.remove(row.userId, row.id);
    } catch {
      // Keep the reservation so a later cleanup can safely retry both resources.
    }
  }
}

function quotaError(code: ReserveRejectionCode): FileStoreError {
  if (code === "file_count_limit") return new FileStoreError(code, 409);
  if (code === "file_bytes_limit") return new FileStoreError(code, 409);
  if (code === "global_file_bytes_limit") return new FileStoreError(code, 503);
  if (code === "file_upload_in_progress") return new FileStoreError(code, 409);
  return new FileStoreError("file_storage_unavailable", 503);
}

export async function saveUserFile({
  userId: rawUserId,
  name,
  declaredMimeType,
  bytes,
  now = Date.now(),
  runtime: suppliedRuntime,
}: {
  userId: string;
  name: string;
  declaredMimeType: string;
  bytes: Uint8Array;
  now?: number;
  runtime?: FileStoreRuntime;
}): Promise<{ file: StoredUserFile; deduplicated: boolean }> {
  const userId = normalizeUserId(rawUserId);
  const validation = validateDocumentFile({ name, type: declaredMimeType, size: bytes.byteLength });
  if (!validation.ok) {
    if (validation.code === "empty") throw new FileStoreError("empty_file", 400);
    if (validation.code === "too_large") throw new FileStoreError("file_too_large", 413);
    throw new FileStoreError("unsupported_file", 400);
  }

  const runtime = suppliedRuntime ?? await resolveRuntime();
  await runtime.metadata.initialize();
  await cleanupStalePending(runtime, now);

  // The browser already transferred these bytes, so malformed uploads also
  // consume the rolling allowance and cannot be used for free traffic abuse.
  if (!await runtime.metadata.consumeUploadBudget(userId, bytes.byteLength, now)) {
    throw new FileStoreError("upload_bytes_limit", 429);
  }
  if (!hasValidDocumentSignature(name, bytes)) {
    throw new FileStoreError("invalid_file_content", 400);
  }

  const mimeType = canonicalDocumentMimeType(name);
  if (!mimeType) throw new FileStoreError("unsupported_file", 400);
  const digest = await sha256(bytes);
  const id = crypto.randomUUID();
  const ownerNamespace = (await sha256(userId)).slice(0, 32);
  const objectKey = `private/${ownerNamespace}/${id}`;
  const originalName = sanitizeStoredFilename(name, validation.extension);
  const reservation = await runtime.metadata.reserve({
    id,
    userId,
    objectKey,
    originalName,
    extension: validation.extension,
    mimeType,
    sizeBytes: bytes.byteLength,
    sha256: digest,
    createdAt: now,
    updatedAt: now,
  });

  if (reservation.kind === "duplicate") return { file: publicFile(reservation.row), deduplicated: true };
  if (reservation.kind === "rejected") throw quotaError(reservation.code);

  try {
    await runtime.bucket.put(objectKey, bytes, {
      httpMetadata: { contentType: mimeType, contentDisposition: `attachment; filename="document.${validation.extension}"` },
      customMetadata: { fileId: id },
    });
  } catch {
    await runtime.metadata.remove(userId, id).catch(() => false);
    throw new FileStoreError("file_storage_unavailable", 503);
  }

  try {
    if (!await runtime.metadata.markReady(userId, id, now)) throw new Error("metadata_update_failed");
  } catch {
    await runtime.bucket.delete(objectKey).catch(() => undefined);
    await runtime.metadata.remove(userId, id).catch(() => false);
    throw new FileStoreError("file_storage_unavailable", 503);
  }

  return { file: publicFile({ ...reservation.row, status: "ready", updatedAt: now }), deduplicated: false };
}

export async function listUserFiles(
  rawUserId: string,
  suppliedRuntime?: FileStoreRuntime,
  now = Date.now(),
): Promise<FileStorageSnapshot> {
  const userId = normalizeUserId(rawUserId);
  const runtime = suppliedRuntime ?? await resolveRuntime();
  await runtime.metadata.initialize();
  await cleanupStalePending(runtime, now);
  const [rows, rawUsage] = await Promise.all([runtime.metadata.list(userId), runtime.metadata.usage(userId)]);
  const count = Math.max(0, Math.min(rawUsage.count, USER_FILE_COUNT_LIMIT));
  const bytes = Math.max(0, rawUsage.bytes);
  return {
    files: rows.map(publicFile),
    usage: {
      count,
      countLimit: USER_FILE_COUNT_LIMIT,
      remainingCount: Math.max(0, USER_FILE_COUNT_LIMIT - count),
      bytes,
      bytesLimit: USER_FILE_BYTES_LIMIT,
      remainingBytes: Math.max(0, USER_FILE_BYTES_LIMIT - bytes),
    },
  };
}

export async function getUserFileDownload(
  rawUserId: string,
  id: string,
  suppliedRuntime?: FileStoreRuntime,
): Promise<{ file: StoredUserFile; body: R2StoredObjectLike["body"] } | null> {
  const userId = normalizeUserId(rawUserId);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const runtime = suppliedRuntime ?? await resolveRuntime();
  await runtime.metadata.initialize();
  const row = await runtime.metadata.findOwned(userId, id, true);
  if (!row) return null;
  const object = await runtime.bucket.get(row.objectKey).catch(() => null);
  if (!object) throw new FileStoreError("file_storage_unavailable", 503);
  return { file: publicFile(row), body: object.body };
}

export async function deleteUserFile(
  rawUserId: string,
  id: string,
  suppliedRuntime?: FileStoreRuntime,
): Promise<boolean> {
  const userId = normalizeUserId(rawUserId);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const runtime = suppliedRuntime ?? await resolveRuntime();
  await runtime.metadata.initialize();
  const row = await runtime.metadata.findOwned(userId, id);
  if (!row) return false;
  try {
    await runtime.bucket.delete(row.objectKey);
    return await runtime.metadata.remove(userId, id);
  } catch {
    throw new FileStoreError("file_storage_unavailable", 503);
  }
}
