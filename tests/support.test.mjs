import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { isSupportAdministrator } from "../app/support-admin.ts";
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

test("support validation keeps the request bounded and strips unsafe control marks", () => {
  const create = parseSupportAction({ action: "create", subject: " Cannot upload PDF\u202e ", category: "bug", message: "It\r\nhappens after sign in." });
  assert.deepEqual(create, { action: "create", subject: "Cannot upload PDF", category: "bug", message: "It\nhappens after sign in." });
  assert.equal(parseSupportAction({ action: "create", subject: "x".repeat(SUPPORT_SUBJECT_MAX_LENGTH + 1), category: "bug", message: "Hello" }), null);
  assert.equal(parseSupportAction({ action: "create", subject: "Hello", category: "other", message: "Hello" }), null);
  assert.equal(parseSupportAction({ action: "reply", conversationId: "bad-id", message: "Hello" }), null);
  assert.equal(parseSupportAction({ action: "reply", conversationId: "11111111-1111-4111-8111-111111111111", message: "x".repeat(SUPPORT_MESSAGE_MAX_LENGTH + 1) }), null);
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
      userId: "member-a", subject: "PDF issue", category: "bug", message: "The upload button is disabled.", now: 1_000,
    });
    assert.equal(created.messages.length, 1);
    assert.equal((await store.listConversations("member-a", false)).length, 1);
    assert.equal((await store.listConversations("member-b", false)).length, 0);
    assert.equal(await store.getConversation("member-b", created.id, false), null);
    await assert.rejects(
      store.addReply({ userId: "member-b", conversationId: created.id, message: "I should not see this.", isAdmin: false, now: 2_000 }),
      (error) => error instanceof SupportStoreError && error.code === "support_not_found",
    );

    const queue = await store.listConversations("owner", true);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].ownerReference, "Member member-a");
    const answered = await store.addReply({ userId: "owner", conversationId: created.id, message: "Thanks, we are checking it.", isAdmin: true, now: 3_000 });
    assert.equal(answered.status, "waiting_for_user");
    assert.equal(answered.messages.at(-1)?.sender, "support");

    const reopened = await store.addReply({ userId: "member-a", conversationId: created.id, message: "Thank you.", isAdmin: false, now: 4_000 });
    assert.equal(reopened.status, "open");
    assert.equal(reopened.messages.at(-1)?.sender, "user");
    const resolved = await store.setStatus(created.id, "resolved", 5_000);
    assert.equal(resolved?.status, "resolved");
  } finally {
    database.close();
  }
});

test("support rate and conversation caps resist repeated requests", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const store = createSupportStoreForTests(new Database(database));
    const rate = await store.createConversation({ userId: "rate-member", subject: "Question", category: "question", message: "First message", now: 1_000 });
    for (let index = 0; index < SUPPORT_USER_MESSAGE_LIMIT - 1; index += 1) {
      await store.addReply({ userId: "rate-member", conversationId: rate.id, message: `Reply ${index}`, isAdmin: false, now: 2_000 + index });
    }
    await assert.rejects(
      store.addReply({ userId: "rate-member", conversationId: rate.id, message: "One too many", isAdmin: false, now: 20_000 }),
      (error) => error instanceof SupportStoreError && error.code === "support_rate_limited" && error.status === 429,
    );

    for (let index = 0; index < SUPPORT_CONVERSATION_LIMIT - 1; index += 1) {
      await store.createConversation({ userId: "conversation-member", subject: `Request ${index}`, category: "feature", message: "Please add this.", now: 1_000 + index * 700_000 });
    }
    await store.createConversation({ userId: "conversation-member", subject: "Last allowed", category: "feature", message: "Please add this.", now: 30_000_000 });
    await assert.rejects(
      store.createConversation({ userId: "conversation-member", subject: "Over limit", category: "feature", message: "Please add this.", now: 31_000_000 }),
      (error) => error instanceof SupportStoreError && error.code === "support_conversation_limit" && error.status === 409,
    );
  } finally {
    database.close();
  }
});

test("support API, UI, and D1 migration enforce server-side privacy and provide all supported languages", async () => {
  const [route, store, panel, page, migration] = await Promise.all([
    readFile(new URL("../app/api/support/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/support-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/support-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_wandering_carmella_unuscione.sql", import.meta.url), "utf8"),
  ]);
  assert.match(route, /verifySupabaseRequest\(request\)/);
  assert.match(route, /isSameOriginRequest\(request\)/);
  assert.match(route, /isSupportAdministrator\(auth\.user\.email\)/);
  assert.match(route, /auth\.isAdmin/);
  assert.match(store, /user_id = \?/);
  assert.match(store, /support_message_events/);
  assert.match(store, /SUPPORT_USER_MESSAGE_LIMIT = 10/);
  assert.match(store, /SUPPORT_CONVERSATION_LIMIT = 25/);
  assert.match(panel, /en: \{/);
  assert.match(panel, /ru: \{/);
  assert.match(panel, /lv: \{/);
  assert.match(panel, /support-status-control/);
  assert.match(page, /<SupportPanel/);
  assert.match(migration, /support_conversations/);
  assert.match(migration, /support_messages/);
  assert.match(migration, /support_message_events/);
  assert.match(migration, /ON DELETE cascade/);
});
