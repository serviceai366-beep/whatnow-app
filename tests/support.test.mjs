import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { isSupportAdministrator } from "../app/support-admin.ts";
import { getSupportAttachment, saveSupportAttachments, SupportAttachmentError } from "../app/support-attachment-store.ts";
import { sendSupportNotification, supportEmailConfigured } from "../app/support-email.ts";
import { createSupportStoreForTests, SUPPORT_CONVERSATION_LIMIT, SUPPORT_USER_MESSAGE_LIMIT, SupportStoreError } from "../app/support-store.ts";
import { parseSupportAction, SUPPORT_MESSAGE_MAX_LENGTH, SUPPORT_SUBJECT_MAX_LENGTH } from "../app/support-validation.ts";

class Statement {
  constructor(statement, bindings = []) { this.statement = statement; this.bindings = bindings; }
  bind(...values) { return new Statement(this.statement, values); }
  async first() { return this.statement.get(...this.bindings) ?? null; }
  async all() { return this.statement.all(...this.bindings); }
  async run() { return this.statement.run(...this.bindings); }
}

class Database {
  constructor(database) { this.database = database; }
  prepare(query) { return new Statement(this.database.prepare(query)); }
  async batch(statements) {
    const result = [];
    for (const statement of statements) result.push(await statement.run());
    return result;
  }
}

class Bucket {
  objects = new Map();
  async put(key, value) { this.objects.set(key, new Uint8Array(value)); }
  async get(key) { const body = this.objects.get(key); return body ? { body, size: body.byteLength } : null; }
  async delete(key) { this.objects.delete(key); }
}

test("support validation keeps the request bounded and strips unsafe control marks", () => {
  const create = parseSupportAction({ action: "create", subject: " Cannot upload PDF\u202e ", category: "bug", message: "It\r\nhappens after sign in.", locale: "en" });
  assert.deepEqual(create, { action: "create", subject: "Cannot upload PDF", category: "bug", message: "It\nhappens after sign in.", locale: "en" });
  assert.equal(parseSupportAction({ action: "create", subject: "x".repeat(SUPPORT_SUBJECT_MAX_LENGTH + 1), category: "bug", message: "Hello", locale: "en" }), null);
  assert.equal(parseSupportAction({ action: "create", subject: "Hello", category: "other", message: "Hello", locale: "en" }), null);
  assert.equal(parseSupportAction({ action: "reply", conversationId: "bad-id", message: "Hello", locale: "en" }), null);
  assert.equal(parseSupportAction({ action: "reply", conversationId: "11111111-1111-4111-8111-111111111111", message: "x".repeat(SUPPORT_MESSAGE_MAX_LENGTH + 1), locale: "en" }), null);
  assert.deepEqual(parseSupportAction({ action: "set_priority", conversationId: "11111111-1111-4111-8111-111111111111", priority: "urgent" }), { action: "set_priority", conversationId: "11111111-1111-4111-8111-111111111111", priority: "urgent" });
});

test("support owner allow-list never authorizes a partial or unrelated email", () => {
  const environment = { WHATNOW_SUPPORT_ADMIN_EMAILS: " owner@example.com , teammate@example.org " };
  assert.equal(isSupportAdministrator("OWNER@example.com", environment), true);
  assert.equal(isSupportAdministrator("owner@example.com.attacker", environment), false);
  assert.equal(isSupportAdministrator("member@example.com", environment), false);
  assert.equal(isSupportAdministrator("owner@example.com", {}), false);
});

test("support conversations are private to their owner while the configured owner can answer every request", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const store = createSupportStoreForTests(new Database(database));
    const created = await store.createConversation({
      userId: "member-a", contactEmail: "member@example.com", subject: "PDF issue", category: "bug", message: "The upload button is disabled.", locale: "en", now: 1_000,
    });
    assert.equal(created.messages.length, 1);
    assert.equal((await store.listConversations("member-a", false)).length, 1);
    assert.equal((await store.listConversations("member-b", false)).length, 0);
    assert.equal(await store.getConversation("member-b", created.id, false), null);
    await assert.rejects(
      store.addReply({ userId: "member-b", conversationId: created.id, message: "I should not see this.", locale: "en", isAdmin: false, now: 2_000 }),
      (error) => error instanceof SupportStoreError && error.code === "support_not_found",
    );

    const queue = await store.listConversations("owner", true);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].ownerReference, "Member member-a");
    const answered = await store.addReply({ userId: "owner", conversationId: created.id, message: "Thanks, we are checking it.", locale: "en", isAdmin: true, now: 3_000 });
    assert.equal(answered.status, "waiting_for_user");
    assert.equal(answered.messages.at(-1)?.sender, "support");

    const reopened = await store.addReply({ userId: "member-a", conversationId: created.id, message: "Thank you.", locale: "ru", isAdmin: false, now: 4_000 });
    assert.equal(reopened.status, "open");
    assert.equal(reopened.messages.at(-1)?.sender, "user");
    const resolved = await store.setStatus(created.id, "resolved", 5_000);
    assert.equal(resolved?.status, "resolved");
    const urgent = await store.setPriority(created.id, "urgent", 6_000);
    assert.equal(urgent?.priority, "urgent");
    assert.equal((await store.notificationContext(created.id))?.locale, "ru");
  } finally {
    database.close();
  }
});

test("support rate and conversation caps resist repeated requests", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const store = createSupportStoreForTests(new Database(database));
    const rate = await store.createConversation({ userId: "rate-member", contactEmail: "rate@example.com", subject: "Question", category: "question", message: "First message", locale: "en", now: 1_000 });
    for (let index = 0; index < SUPPORT_USER_MESSAGE_LIMIT - 1; index += 1) {
      await store.addReply({ userId: "rate-member", conversationId: rate.id, message: `Reply ${index}`, locale: "en", isAdmin: false, now: 2_000 + index });
    }
    await assert.rejects(
      store.addReply({ userId: "rate-member", conversationId: rate.id, message: "One too many", locale: "en", isAdmin: false, now: 20_000 }),
      (error) => error instanceof SupportStoreError && error.code === "support_rate_limited" && error.status === 429,
    );

    for (let index = 0; index < SUPPORT_CONVERSATION_LIMIT - 1; index += 1) {
      await store.createConversation({ userId: "conversation-member", contactEmail: "member@example.com", subject: `Request ${index}`, category: "feature", message: "Please add this.", locale: "en", now: 1_000 + index * 700_000 });
    }
    await store.createConversation({ userId: "conversation-member", contactEmail: "member@example.com", subject: "Last allowed", category: "feature", message: "Please add this.", locale: "en", now: 30_000_000 });
    await assert.rejects(
      store.createConversation({ userId: "conversation-member", contactEmail: "member@example.com", subject: "Over limit", category: "feature", message: "Please add this.", locale: "en", now: 31_000_000 }),
      (error) => error instanceof SupportStoreError && error.code === "support_conversation_limit" && error.status === 409,
    );
  } finally {
    database.close();
  }
});

test("support screenshots are signature-checked, private, and loaded from the bound bucket", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const database = new Database(sqlite);
    const store = createSupportStoreForTests(database);
    const conversation = await store.createConversation({ userId: "member-a", contactEmail: "member@example.com", subject: "Visual bug", category: "bug", message: "See screenshot", locale: "en", now: 1_000 });
    const messageId = conversation.messages[0].id;
    const bucket = new Bucket();
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const [saved] = await saveSupportAttachments({ conversationId: conversation.id, messageId, files: [{ name: "screen.png", declaredMimeType: "image/png", bytes: png }], suppliedRuntime: { db: database, bucket }, now: 2_000 });
    assert.equal(saved.mimeType, "image/png");
    const loaded = await getSupportAttachment(saved.id, { db: database, bucket });
    assert.equal(loaded?.conversationId, conversation.id);
    assert.deepEqual(Array.from(loaded?.body ?? []), Array.from(png));
    await assert.rejects(
      saveSupportAttachments({ conversationId: conversation.id, messageId, files: [{ name: "fake.png", declaredMimeType: "image/png", bytes: Uint8Array.from([1, 2, 3]) }], suppliedRuntime: { db: database, bucket } }),
      (error) => error instanceof SupportAttachmentError && error.code === "support_attachment_invalid",
    );
  } finally {
    sqlite.close();
  }
});

test("support email is opt-in by server configuration, localized, and omits private message text", async () => {
  assert.equal(supportEmailConfigured({}), false);
  let sent;
  const result = await sendSupportNotification({
    kind: "support_reply", contactEmail: "member@example.com", locale: "ru", ticketSubject: "Не работает PDF", ticketId: "11111111-1111-4111-8111-111111111111", priority: "normal",
    environment: { RESEND_API_KEY: "re_1234567890123456", SUPPORT_FROM_EMAIL: "WhatNow? Support <support@whatnow-app.com>" },
    fetchImpl: async (_url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ id: "email-id" }), { status: 200 }); },
  });
  assert.deepEqual(result, { configured: true, sent: true });
  assert.equal(sent.to[0], "member@example.com");
  assert.match(sent.subject, /Новый ответ/);
  assert.doesNotMatch(sent.html, /private message body/i);
});

test("support API, UI, and D1 migration enforce server-side privacy and provide all supported languages", async () => {
  const [route, store, panel, page, migration, styles] = await Promise.all([
    readFile(new URL("../app/api/support/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/support-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/support-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0007_blue_mister_fear.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(route, /verifySupabaseRequest\(request\)/);
  assert.match(route, /isSameOriginRequest\(request\)/);
  assert.match(route, /isSupportAdministrator\(auth\.user\.email\)/);
  assert.match(route, /auth\.isAdmin/);
  assert.match(route, /saveSupportAttachments/);
  assert.match(store, /user_id = \?/);
  assert.match(store, /support_message_events/);
  assert.match(store, /SUPPORT_USER_MESSAGE_LIMIT = 10/);
  assert.match(store, /SUPPORT_CONVERSATION_LIMIT = 25/);
  assert.match(panel, /en: \{/);
  assert.match(panel, /ru: \{/);
  assert.match(panel, /lv: \{/);
  assert.match(panel, /support-status-control/);
  assert.match(panel, /support-search/);
  assert.match(panel, /support-file-input/);
  assert.match(panel, /support-file-picker/);
  assert.match(panel, /chooseAttachments: "Choose screenshots"/);
  assert.match(panel, /noAttachments: "No screenshots selected"/);
  assert.match(panel, /className="sr-only" type="file"/);
  assert.match(panel, /set_priority/);
  const englishSupportCopy = panel.match(/en: \{([\s\S]*?)\n  \},\n  ru:/)?.[1] ?? "";
  assert.ok(englishSupportCopy.length > 0);
  assert.doesNotMatch(englishSupportCopy, /[А-Яа-яЁё]/);
  assert.match(styles, /\.support-panel \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*overflow: hidden;/);
  assert.match(styles, /\.support-layout \{[^}]*min-height: 0;[^}]*flex: 1 1 auto;/);
  assert.match(styles, /\.support-main \{[^}]*min-height: 0;[^}]*overflow: auto;/);
  assert.match(styles, /\.support-panel \.primary-mini:disabled \{[^}]*color: var\(--muted\);[^}]*background: var\(--surface-muted\);[^}]*opacity: 1;/);
  assert.match(styles, /\.support-file-picker \{[^}]*display: flex;[^}]*background: var\(--surface\);/);
  assert.match(page, /<SupportPanel/);
  assert.match(migration, /support_conversations/);
  assert.match(migration, /support_messages/);
  assert.match(migration, /support_attachments/);
  assert.match(migration, /ON DELETE cascade/);
});

test("support upgrade migration preserves existing conversations and adds private attachments", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const base = await readFile(new URL("../drizzle/0006_wandering_carmella_unuscione.sql", import.meta.url), "utf8");
    const upgrade = await readFile(new URL("../drizzle/0007_blue_mister_fear.sql", import.meta.url), "utf8");
    for (const statement of base.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) sqlite.exec(statement);
    sqlite.prepare("INSERT INTO support_conversations (id,user_id,subject,category,status,created_at,updated_at,last_message_at) VALUES (?,?,?,?,?,?,?,?)")
      .run("11111111-1111-4111-8111-111111111111", "member-a", "Existing", "question", "open", 1, 1, 1);
    for (const statement of upgrade.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) sqlite.exec(statement);
    const row = sqlite.prepare("SELECT subject,priority,locale,contact_email FROM support_conversations LIMIT 1").get();
    assert.equal(row.subject, "Existing");
    assert.equal(row.priority, "normal");
    assert.equal(row.locale, "en");
    assert.equal(row.contact_email, null);
    assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='support_attachments'").get());
  } finally {
    sqlite.close();
  }
});
