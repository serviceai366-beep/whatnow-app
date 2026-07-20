import type { D1DatabaseLike, PrivateFileBucket, R2StoredObjectLike } from "./file-store.ts";
import type { SupportAttachment } from "./support-types.ts";

export const SUPPORT_ATTACHMENT_MAX_FILES_PER_MESSAGE = 2;
export const SUPPORT_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_CONVERSATION_LIMIT = 20;
export const SUPPORT_ATTACHMENT_CONVERSATION_BYTES = 20 * 1024 * 1024;

type AttachmentRow = {
  id: string;
  conversation_id: string;
  message_id: string;
  object_key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: number;
};

type Runtime = { db: D1DatabaseLike; bucket: PrivateFileBucket };

export class SupportAttachmentError extends Error {
  readonly code: "support_attachment_invalid" | "support_attachment_too_large" | "support_attachment_limit" | "support_attachment_unavailable";
  readonly status: 400 | 409 | 413 | 503;

  constructor(code: SupportAttachmentError["code"], status: SupportAttachmentError["status"]) {
    super(code);
    this.name = "SupportAttachmentError";
    this.code = code;
    this.status = status;
  }
}

function mimeFromBytes(bytes: Uint8Array): SupportAttachment["mimeType"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 12 && new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

function prepareFiles(files: Array<{ name: string; declaredMimeType: string; bytes: Uint8Array }>) {
  if (files.length > SUPPORT_ATTACHMENT_MAX_FILES_PER_MESSAGE) throw new SupportAttachmentError("support_attachment_limit", 409);
  return files.map((file) => {
    if (file.bytes.byteLength <= 0) throw new SupportAttachmentError("support_attachment_invalid", 400);
    if (file.bytes.byteLength > SUPPORT_ATTACHMENT_MAX_BYTES) throw new SupportAttachmentError("support_attachment_too_large", 413);
    const mimeType = mimeFromBytes(file.bytes);
    if (!mimeType || file.declaredMimeType.toLowerCase() !== mimeType) throw new SupportAttachmentError("support_attachment_invalid", 400);
    return { ...file, mimeType, name: safeName(file.name, mimeType) };
  });
}

export function validateSupportAttachmentUploads(files: Array<{ name: string; declaredMimeType: string; bytes: Uint8Array }>): void {
  prepareFiles(files);
}

function safeName(value: string, mimeType: SupportAttachment["mimeType"]): string {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
  const leaf = value.replaceAll("\\", "/").split("/").pop() ?? "";
  const base = leaf.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N} _.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim().slice(0, 100) || "screenshot";
  return `${base}.${extension}`;
}

function publicAttachment(row: AttachmentRow | null): SupportAttachment | null {
  if (!row || typeof row.id !== "string" || typeof row.original_name !== "string"
    || (row.mime_type !== "image/jpeg" && row.mime_type !== "image/png" && row.mime_type !== "image/webp")
    || !Number.isSafeInteger(row.size_bytes) || row.size_bytes <= 0 || !Number.isSafeInteger(row.created_at)) return null;
  return { id: row.id, name: row.original_name, mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: row.created_at };
}

async function namespace(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

let runtimePromise: Promise<Runtime | null> | null = null;

async function runtime(): Promise<Runtime | null> {
  runtimePromise ??= (async () => {
    try {
      const cloudflare = await import("cloudflare:workers");
      const bindings = cloudflare.env as unknown as { DB?: D1DatabaseLike; FILES?: PrivateFileBucket };
      return bindings.DB && bindings.FILES ? { db: bindings.DB, bucket: bindings.FILES } : null;
    } catch {
      return null;
    }
  })();
  return runtimePromise;
}

async function initialize(db: D1DatabaseLike): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS support_attachments (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    created_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS support_attachment_deletions (
    object_key TEXT PRIMARY KEY NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS support_attachments_conversation_created_idx ON support_attachments (conversation_id, created_at ASC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS support_attachments_message_idx ON support_attachments (message_id)"),
  ]);
}

export async function saveSupportAttachments({ conversationId, messageId, files, now = Date.now(), suppliedRuntime }: {
  conversationId: string;
  messageId: string;
  files: Array<{ name: string; declaredMimeType: string; bytes: Uint8Array }>;
  now?: number;
  suppliedRuntime?: Runtime;
}): Promise<SupportAttachment[]> {
  if (files.length === 0) return [];
  const prepared = prepareFiles(files);
  const resolved = suppliedRuntime ?? await runtime();
  if (!resolved) throw new SupportAttachmentError("support_attachment_unavailable", 503);
  await initialize(resolved.db);
  const prefix = await namespace(conversationId);
  const saved: Array<{ attachment: SupportAttachment; objectKey: string }> = [];
  try {
    for (const file of prepared) {
      const id = crypto.randomUUID();
      const objectKey = `private/support/${prefix}/${id}`;
      await resolved.bucket.put(objectKey, file.bytes, {
        httpMetadata: { contentType: file.mimeType, contentDisposition: `inline; filename="support-image"` },
        customMetadata: { attachmentId: id },
      });
      const row = await resolved.db.prepare(`INSERT INTO support_attachments
        (id,conversation_id,message_id,object_key,original_name,mime_type,size_bytes,created_at)
        SELECT ?,?,?,?,?,?,?,?
        WHERE EXISTS (SELECT 1 FROM support_messages WHERE id = ? AND conversation_id = ?)
          AND (SELECT COUNT(*) FROM support_attachments WHERE conversation_id = ?) < ?
          AND COALESCE((SELECT SUM(size_bytes) FROM support_attachments WHERE conversation_id = ?), 0) + ? <= ?
        RETURNING id,conversation_id,message_id,object_key,original_name,mime_type,size_bytes,created_at`)
        .bind(id, conversationId, messageId, objectKey, file.name, file.mimeType, file.bytes.byteLength, now,
          messageId, conversationId, conversationId, SUPPORT_ATTACHMENT_CONVERSATION_LIMIT,
          conversationId, file.bytes.byteLength, SUPPORT_ATTACHMENT_CONVERSATION_BYTES)
        .first<AttachmentRow>();
      const attachment = publicAttachment(row);
      if (!attachment) {
        await resolved.bucket.delete(objectKey).catch(() => undefined);
        throw new SupportAttachmentError("support_attachment_limit", 409);
      }
      saved.push({ attachment, objectKey });
    }
    return saved.map((item) => item.attachment);
  } catch (error) {
    for (const item of saved) {
      await resolved.bucket.delete(item.objectKey).catch(() => undefined);
      await resolved.db.prepare("DELETE FROM support_attachments WHERE id = ?").bind(item.attachment.id).run().catch(() => undefined);
    }
    throw error instanceof SupportAttachmentError ? error : new SupportAttachmentError("support_attachment_unavailable", 503);
  }
}

export async function getSupportAttachment(id: string, suppliedRuntime?: Runtime): Promise<{
  attachment: SupportAttachment;
  conversationId: string;
  body: R2StoredObjectLike["body"];
} | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const resolved = suppliedRuntime ?? await runtime();
  if (!resolved) throw new SupportAttachmentError("support_attachment_unavailable", 503);
  await initialize(resolved.db);
  const row = await resolved.db.prepare("SELECT id,conversation_id,message_id,object_key,original_name,mime_type,size_bytes,created_at FROM support_attachments WHERE id = ? LIMIT 1")
    .bind(id).first<AttachmentRow>();
  const attachment = publicAttachment(row);
  if (!attachment || !row) return null;
  const object = await resolved.bucket.get(row.object_key).catch(() => null);
  if (!object) throw new SupportAttachmentError("support_attachment_unavailable", 503);
  return { attachment, conversationId: row.conversation_id, body: object.body };
}

export async function drainSupportAttachmentDeletions(suppliedRuntime?: Runtime, limit = 20): Promise<{ deleted: number; failed: number }> {
  const resolved = suppliedRuntime ?? await runtime();
  if (!resolved) throw new SupportAttachmentError("support_attachment_unavailable", 503);
  await initialize(resolved.db);
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await resolved.db.prepare("SELECT object_key FROM support_attachment_deletions ORDER BY created_at ASC LIMIT ?")
    .bind(boundedLimit).all<{ object_key: string }>();
  const rows = (Array.isArray(result) ? result : Array.isArray(result.results) ? result.results : [])
    .filter((row): row is { object_key: string } => Boolean(row) && typeof row.object_key === "string");
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await resolved.bucket.delete(row.object_key);
      await resolved.db.prepare("DELETE FROM support_attachment_deletions WHERE object_key = ?").bind(row.object_key).run();
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { deleted, failed };
}
