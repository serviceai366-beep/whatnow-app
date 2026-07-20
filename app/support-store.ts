import type { D1DatabaseLike, D1StatementLike } from "./file-store.ts";
import type { SupportAttachment, SupportCategory, SupportConversation, SupportConversationDetail, SupportLocale, SupportMessage, SupportPriority, SupportStatus } from "./support-types.ts";

export const SUPPORT_CONVERSATION_LIMIT = 25;
export const SUPPORT_MESSAGE_LIMIT = 100;
export const SUPPORT_USER_MESSAGE_LIMIT = 10;
export const SUPPORT_USER_MESSAGE_WINDOW_MS = 10 * 60 * 1_000;

type ConversationRow = {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  contact_email: string | null;
  locale: string;
  created_at: number;
  updated_at: number;
  last_message_at: number;
  last_message_preview?: string | null;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: number;
};

type MessageRow = {
  id: string;
  sender_type: string;
  body: string;
  created_at: number;
};

export class SupportStoreError extends Error {
  readonly code: "support_not_found" | "support_conversation_limit" | "support_message_limit" | "support_rate_limited" | "support_storage_unavailable";
  readonly status: 404 | 409 | 429 | 503;

  constructor(
    code: "support_not_found" | "support_conversation_limit" | "support_message_limit" | "support_rate_limited" | "support_storage_unavailable",
    status: 404 | 409 | 429 | 503,
  ) {
    super(code);
    this.name = "SupportStoreError";
    this.code = code;
    this.status = status;
  }
}

function isCategory(value: string): value is SupportCategory {
  return value === "question" || value === "bug" || value === "feature";
}

function isStatus(value: string): value is SupportStatus {
  return value === "open" || value === "waiting_for_user" || value === "resolved";
}

function isPriority(value: string): value is SupportPriority {
  return value === "low" || value === "normal" || value === "high" || value === "urgent";
}

function isLocale(value: string): value is SupportLocale {
  return value === "en" || value === "ru" || value === "lv";
}

function conversationFromRow(row: ConversationRow | null, admin = false): SupportConversation | null {
  if (!row || typeof row.id !== "string" || typeof row.user_id !== "string" || typeof row.subject !== "string"
    || !isCategory(row.category) || !isStatus(row.status) || !isPriority(row.priority) || !isLocale(row.locale)
    || !Number.isSafeInteger(row.created_at) || !Number.isSafeInteger(row.updated_at) || !Number.isSafeInteger(row.last_message_at)) return null;
  return {
    id: row.id,
    subject: row.subject,
    category: row.category,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: typeof row.last_message_preview === "string" ? row.last_message_preview : null,
    ownerReference: admin ? `Member ${row.user_id.slice(0, 8)}` : null,
  };
}

function attachmentFromRow(row: AttachmentRow | null): SupportAttachment | null {
  if (!row || typeof row.id !== "string" || typeof row.original_name !== "string"
    || (row.mime_type !== "image/jpeg" && row.mime_type !== "image/png" && row.mime_type !== "image/webp")
    || !Number.isSafeInteger(row.size_bytes) || row.size_bytes <= 0 || !Number.isSafeInteger(row.created_at)) return null;
  return { id: row.id, name: row.original_name, mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: row.created_at };
}

function messageFromRow(row: MessageRow | null, attachments: Map<string, SupportAttachment[]>): SupportMessage | null {
  if (!row || typeof row.id !== "string" || (row.sender_type !== "user" && row.sender_type !== "support")
    || typeof row.body !== "string" || !Number.isSafeInteger(row.created_at)) return null;
  return { id: row.id, sender: row.sender_type, body: row.body, createdAt: row.created_at, attachments: attachments.get(row.id) ?? [] };
}

async function allRows<T>(statement: D1StatementLike): Promise<T[]> {
  const result = await statement.all<T>();
  return Array.isArray(result) ? result : Array.isArray(result.results) ? result.results : [];
}

export type SupportStore = {
  listConversations(userId: string, isAdmin: boolean): Promise<SupportConversation[]>;
  getConversation(userId: string, conversationId: string, isAdmin: boolean): Promise<SupportConversationDetail | null>;
  createConversation(input: { userId: string; contactEmail: string; subject: string; category: SupportCategory; message: string; locale: SupportLocale; now?: number }): Promise<SupportConversationDetail>;
  addReply(input: { userId: string; conversationId: string; message: string; locale: SupportLocale; isAdmin: boolean; now?: number }): Promise<SupportConversationDetail>;
  setStatus(conversationId: string, status: SupportStatus, now?: number): Promise<SupportConversationDetail | null>;
  setPriority(conversationId: string, priority: SupportPriority, now?: number): Promise<SupportConversationDetail | null>;
  notificationContext(conversationId: string): Promise<{ contactEmail: string | null; locale: SupportLocale; subject: string; priority: SupportPriority } | null>;
};

const CONVERSATION_COLUMNS = "id,user_id,subject,category,status,priority,contact_email,locale,created_at,updated_at,last_message_at";

function createStore(db: D1DatabaseLike): SupportStore {
  let initialization: Promise<void> | null = null;
  const initialize = () => {
    initialization ??= (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS support_conversations (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('question', 'bug', 'feature')),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_for_user', 'resolved')),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        contact_email TEXT,
        locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'ru', 'lv')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_message_at INTEGER NOT NULL
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS support_messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
        sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'support')),
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS support_message_events (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`).run();
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
      await db.batch([
        db.prepare("CREATE INDEX IF NOT EXISTS support_conversations_user_updated_idx ON support_conversations (user_id, updated_at DESC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS support_conversations_updated_idx ON support_conversations (updated_at DESC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS support_messages_conversation_created_idx ON support_messages (conversation_id, created_at ASC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS support_message_events_user_created_idx ON support_message_events (user_id, created_at DESC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS support_attachments_conversation_created_idx ON support_attachments (conversation_id, created_at ASC)"),
        db.prepare("CREATE INDEX IF NOT EXISTS support_attachments_message_idx ON support_attachments (message_id)"),
      ]);
    })();
    return initialization;
  };

  const conversationQuery = (scope: "owner" | "admin") => `SELECT ${CONVERSATION_COLUMNS},
    (SELECT body FROM support_messages WHERE conversation_id = support_conversations.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
    FROM support_conversations${scope === "owner" ? " WHERE user_id = ?" : ""} ORDER BY updated_at DESC, id DESC LIMIT ?`;

  const readDetail = async (userId: string, conversationId: string, isAdmin: boolean): Promise<SupportConversationDetail | null> => {
    const row = await db.prepare(`SELECT ${CONVERSATION_COLUMNS},
      (SELECT body FROM support_messages WHERE conversation_id = support_conversations.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_preview
      FROM support_conversations WHERE id = ?${isAdmin ? "" : " AND user_id = ?"} LIMIT 1`)
      .bind(...(isAdmin ? [conversationId] : [conversationId, userId]))
      .first<ConversationRow>();
    const conversation = conversationFromRow(row, isAdmin);
    if (!conversation) return null;
    const attachmentRows = await allRows<AttachmentRow>(db.prepare(
      "SELECT id,message_id,original_name,mime_type,size_bytes,created_at FROM support_attachments WHERE conversation_id = ? ORDER BY created_at ASC, id ASC LIMIT 20",
    ).bind(conversationId));
    const attachmentMap = new Map<string, SupportAttachment[]>();
    for (const row of attachmentRows) {
      const attachment = attachmentFromRow(row);
      if (!attachment) continue;
      attachmentMap.set(row.message_id, [...(attachmentMap.get(row.message_id) ?? []), attachment]);
    }
    const messages = (await allRows<MessageRow>(db.prepare(
      "SELECT id,sender_type,body,created_at FROM support_messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC LIMIT ?",
    ).bind(conversationId, SUPPORT_MESSAGE_LIMIT))).map((row) => messageFromRow(row, attachmentMap)).filter((message): message is SupportMessage => Boolean(message));
    return { ...conversation, messages };
  };

  const consumeUserMessageBudget = async (userId: string, now: number) => {
    const cutoff = now - SUPPORT_USER_MESSAGE_WINDOW_MS;
    await db.prepare("DELETE FROM support_message_events WHERE created_at <= ?").bind(cutoff).run();
    const inserted = await db.prepare(`INSERT INTO support_message_events (id, user_id, created_at)
      SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM support_message_events WHERE user_id = ? AND created_at > ?) < ?
      RETURNING id`).bind(crypto.randomUUID(), userId, now, userId, cutoff, SUPPORT_USER_MESSAGE_LIMIT).first<{ id: string }>();
    if (!inserted?.id) throw new SupportStoreError("support_rate_limited", 429);
  };

  const appendMessage = async ({ userId, conversationId, message, isAdmin, now }: {
    userId: string; conversationId: string; message: string; isAdmin: boolean; now: number;
  }) => {
    const accessible = await readDetail(userId, conversationId, isAdmin);
    if (!accessible) throw new SupportStoreError("support_not_found", 404);
    if (!isAdmin) await consumeUserMessageBudget(userId, now);
    const inserted = await db.prepare(`INSERT INTO support_messages (id, conversation_id, sender_type, body, created_at)
      SELECT ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM support_messages WHERE conversation_id = ?) < ?
      RETURNING id`).bind(crypto.randomUUID(), conversationId, isAdmin ? "support" : "user", message, now, conversationId, SUPPORT_MESSAGE_LIMIT)
      .first<{ id: string }>();
    if (!inserted?.id) throw new SupportStoreError("support_message_limit", 409);
    await db.prepare("UPDATE support_conversations SET status = ?, updated_at = ?, last_message_at = ? WHERE id = ?")
      .bind(isAdmin ? "waiting_for_user" : "open", now, now, conversationId).run();
    const detail = await readDetail(userId, conversationId, isAdmin);
    if (!detail) throw new SupportStoreError("support_storage_unavailable", 503);
    return detail;
  };

  return {
    async listConversations(userId, isAdmin) {
      await initialize();
      const rows = await allRows<ConversationRow>(db.prepare(conversationQuery(isAdmin ? "admin" : "owner"))
        .bind(...(isAdmin ? [100] : [userId, SUPPORT_CONVERSATION_LIMIT])));
      return rows.map((row) => conversationFromRow(row, isAdmin)).filter((conversation): conversation is SupportConversation => Boolean(conversation));
    },
    async getConversation(userId, conversationId, isAdmin) {
      await initialize();
      return readDetail(userId, conversationId, isAdmin);
    },
    async createConversation({ userId, contactEmail, subject, category, message, locale, now = Date.now() }) {
      await initialize();
      const existing = await db.prepare("SELECT COUNT(*) AS count FROM support_conversations WHERE user_id = ?")
        .bind(userId).first<{ count: number | null }>();
      if (Number(existing?.count ?? 0) >= SUPPORT_CONVERSATION_LIMIT) {
        throw new SupportStoreError("support_conversation_limit", 409);
      }
      await consumeUserMessageBudget(userId, now);
      const id = crypto.randomUUID();
      const created = await db.prepare(`INSERT INTO support_conversations
        (id,user_id,subject,category,status,priority,contact_email,locale,created_at,updated_at,last_message_at)
        SELECT ?, ?, ?, ?, 'open', 'normal', ?, ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM support_conversations WHERE user_id = ?) < ?
        RETURNING id`).bind(id, userId, subject, category, contactEmail, locale, now, now, now, userId, SUPPORT_CONVERSATION_LIMIT).first<{ id: string }>();
      if (!created?.id) throw new SupportStoreError("support_conversation_limit", 409);
      const inserted = await db.prepare("INSERT INTO support_messages (id,conversation_id,sender_type,body,created_at) VALUES (?,?,'user',?,?) RETURNING id")
        .bind(crypto.randomUUID(), id, message, now).first<{ id: string }>();
      if (!inserted?.id) {
        await db.prepare("DELETE FROM support_conversations WHERE id = ? AND user_id = ?").bind(id, userId).run();
        throw new SupportStoreError("support_storage_unavailable", 503);
      }
      const detail = await readDetail(userId, id, false);
      if (!detail) throw new SupportStoreError("support_storage_unavailable", 503);
      return detail;
    },
    async addReply({ userId, conversationId, message, locale, isAdmin, now = Date.now() }) {
      await initialize();
      const detail = await appendMessage({ userId, conversationId, message, isAdmin, now });
      if (!isAdmin) await db.prepare("UPDATE support_conversations SET locale = ? WHERE id = ? AND user_id = ?").bind(locale, conversationId, userId).run();
      return isAdmin ? detail : (await readDetail(userId, conversationId, false) ?? detail);
    },
    async setStatus(conversationId, status, now = Date.now()) {
      await initialize();
      const result = await db.prepare("UPDATE support_conversations SET status = ?, updated_at = ? WHERE id = ? RETURNING user_id")
        .bind(status, now, conversationId).first<{ user_id: string }>();
      return result?.user_id ? readDetail(result.user_id, conversationId, true) : null;
    },
    async setPriority(conversationId, priority, now = Date.now()) {
      await initialize();
      const result = await db.prepare("UPDATE support_conversations SET priority = ?, updated_at = ? WHERE id = ? RETURNING user_id")
        .bind(priority, now, conversationId).first<{ user_id: string }>();
      return result?.user_id ? readDetail(result.user_id, conversationId, true) : null;
    },
    async notificationContext(conversationId) {
      await initialize();
      const row = await db.prepare("SELECT contact_email,locale,subject,priority FROM support_conversations WHERE id = ? LIMIT 1")
        .bind(conversationId).first<{ contact_email: string | null; locale: string; subject: string; priority: string }>();
      if (!row || !isLocale(row.locale) || !isPriority(row.priority) || typeof row.subject !== "string") return null;
      return { contactEmail: typeof row.contact_email === "string" ? row.contact_email : null, locale: row.locale, subject: row.subject, priority: row.priority };
    },
  };
}

let storePromise: Promise<SupportStore | null> | null = null;

export async function getSupportStore(): Promise<SupportStore | null> {
  storePromise ??= (async () => {
    try {
      const runtime = await import("cloudflare:workers");
      const db = (runtime.env as unknown as { DB?: D1DatabaseLike }).DB;
      return db ? createStore(db) : null;
    } catch {
      return null;
    }
  })();
  return storePromise;
}

export function createSupportStoreForTests(db: D1DatabaseLike): SupportStore {
  return createStore(db);
}
