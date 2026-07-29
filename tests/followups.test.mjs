import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createFollowupStoreForTests, FollowupStoreError } from "../app/followup-store.ts";
import { FREE_FOLLOWUP_LIMIT, PRO_FOLLOWUP_LIMIT } from "../app/followup-types.ts";
import { parseFollowupQuestion, validateFollowupAnswer } from "../app/followup-validation.ts";

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
  async batch(statements) { const rows = []; for (const statement of statements) rows.push(await statement.run()); return rows; }
}

const analysisA = "11111111-1111-4111-8111-111111111111";
const analysisB = "22222222-2222-4222-8222-222222222222";

test("follow-up questions and structured answers are strictly bounded", () => {
  assert.deepEqual(parseFollowupQuestion({ analysisId: analysisA, question: "  What does this mean?  ", selectedText: " deadline " }), {
    analysisId: analysisA, question: "What does this mean?", selectedText: "deadline",
  });
  assert.equal(parseFollowupQuestion({ analysisId: "bad", question: "Hello" }), null);
  assert.equal(parseFollowupQuestion({ analysisId: analysisA, question: "x" }), null);
  assert.equal(parseFollowupQuestion({ analysisId: analysisA, question: "x".repeat(1_201) }), null);
  assert.equal(validateFollowupAnswer({ answer: "It is a deadline.", evidenceIds: ["e1"], uncertain: false, safetyNotice: null }), true);
  assert.equal(validateFollowupAnswer({ answer: "", evidenceIds: [], uncertain: false, safetyNotice: null }), false);
  assert.equal(validateFollowupAnswer({ answer: "Answer", evidenceIds: "e1", uncertain: false, safetyNotice: null }), false);
});

test("free and Pro limits are enforced atomically per owner and document", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const store = createFollowupStoreForTests(new Database(sqlite));
    for (let index = 0; index < FREE_FOLLOWUP_LIMIT; index += 1) {
      const id = await store.reserve({ userId: "free-user", analysisId: analysisA, question: `Question ${index}`, selectedText: null, planCode: "free", now: 1_000 + index });
      await store.complete("free-user", id, { answer: `Answer ${index}`, evidenceIds: ["e1"], uncertain: false, safetyNotice: null }, 2_000 + index);
    }
    assert.deepEqual(await store.quota("free-user", analysisA, "free"), { planCode: "free", used: 3, limit: 3, remaining: 0 });
    await assert.rejects(
      store.reserve({ userId: "free-user", analysisId: analysisA, question: "Too many", selectedText: null, planCode: "free", now: 3_000 }),
      (error) => error instanceof FollowupStoreError && error.code === "followup_limit_reached" && error.status === 429,
    );
    assert.deepEqual(await store.quota("free-user", analysisB, "free"), { planCode: "free", used: 0, limit: 3, remaining: 3 });
    assert.equal((await store.list("other-user", analysisA)).length, 0);

    for (let index = 0; index < PRO_FOLLOWUP_LIMIT; index += 1) {
      const now = 1_000 + index * 700_000;
      const id = await store.reserve({ userId: "pro-user", analysisId: analysisA, question: `Pro ${index}`, selectedText: index === 0 ? "Selected text" : null, planCode: "pro", now });
      await store.complete("pro-user", id, { answer: `Pro answer ${index}`, evidenceIds: [], uncertain: true, safetyNotice: "Check the original." }, now + 1);
    }
    assert.equal((await store.quota("pro-user", analysisA, "pro")).remaining, 0);
    assert.equal((await store.list("pro-user", analysisA)).length, PRO_FOLLOWUP_LIMIT);
  } finally { sqlite.close(); }
});

test("failed generations release their slot and deletion removes only the owner's conversation", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const store = createFollowupStoreForTests(new Database(sqlite));
    const released = await store.reserve({ userId: "member-a", analysisId: analysisA, question: "Will fail", selectedText: null, planCode: "free", now: 1_000 });
    await store.release("member-a", released);
    assert.equal((await store.quota("member-a", analysisA, "free")).used, 0);
    await store.reserve({ userId: "member-a", analysisId: analysisB, question: "Abandoned", selectedText: null, planCode: "free", now: 1_000 });
    const afterExpiry = await store.reserve({ userId: "member-a", analysisId: analysisB, question: "After expiry", selectedText: null, planCode: "free", now: 700_001 });
    await store.release("member-a", afterExpiry);
    assert.equal((await store.quota("member-a", analysisB, "free")).used, 0);
    const kept = await store.reserve({ userId: "member-a", analysisId: analysisA, question: "Keep", selectedText: null, planCode: "free", now: 2_000 });
    await store.complete("member-a", kept, { answer: "Kept", evidenceIds: [], uncertain: false, safetyNotice: null });
    const other = await store.reserve({ userId: "member-b", analysisId: analysisA, question: "Other", selectedText: null, planCode: "free", now: 3_000 });
    await store.complete("member-b", other, { answer: "Other", evidenceIds: [], uncertain: false, safetyNotice: null });
    await store.deleteForAnalysis("member-a", analysisA);
    assert.equal((await store.list("member-a", analysisA)).length, 0);
    assert.equal((await store.list("member-b", analysisA)).length, 1);
  } finally { sqlite.close(); }
});

test("follow-up API and interface preserve privacy, model choice, expansion, selection, and evidence links", async () => {
  const [route, panel, page, styles, migration] = await Promise.all([
    readFile(new URL("../app/api/followups/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/document-chat.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0009_sharp_odin.sql", import.meta.url), "utf8"),
  ]);
  assert.match(route, /verifySupabaseRequest/);
  assert.match(route, /loadOwnedAnalysis/);
  assert.match(route, /activePlanForUser/);
  assert.match(route, /selectedModelForUser/);
  assert.match(route, /model: selectedModel/);
  assert.match(route, /reasoning: \{ effort: "low" \}/);
  assert.match(route, /REQUEST_TIMEOUT_MS\s*=\s*600_000/);
  assert.match(route, /setTimeout\(\(\) => controller\.abort\(\), REQUEST_TIMEOUT_MS\)/);
  assert.match(route, /store: false/);
  assert.match(route, /Base the answer only on the supplied structured analysis/);
  assert.doesNotMatch(route, /input_file|input_image|file_data/);
  assert.match(panel, /setExpanded/);
  assert.match(panel, /selectedText/);
  assert.match(panel, /href=\{`#evidence-\$\{id\}`\}/);
  assert.match(page, /captureGeneratedSelection/);
  assert.match(styles, /\.document-chat-panel\.expanded/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(migration, /CREATE TABLE `document_followups`/);
});
