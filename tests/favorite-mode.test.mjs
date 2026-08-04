import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createFavoriteModeStoreForTests } from "../app/favorite-mode-store.ts";

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
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

test("favorite mode is account-scoped, persistent, and clearable", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    const store = createFavoriteModeStoreForTests(new Database(sqlite));
    assert.equal(await store.read("account-a"), null);
    assert.equal(await store.write("account-a", "translate"), "translate");
    assert.equal(await store.read("account-a"), "translate");
    assert.equal(await store.read("account-b"), null);
    await store.write("account-a", "create");
    assert.equal(await store.read("account-a"), "create");
    await store.write("account-a", null);
    assert.equal(await store.read("account-a"), null);
  } finally {
    sqlite.close();
  }
});

test("favorite mode UI and API keep the choice explicit and same-origin", async () => {
  const [page, client, route, schema, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/favorite-mode-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/favorite-mode/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Pin this mode/);
  assert.match(page, /toggleFavoriteMode/);
  assert.match(page, /loadFavoriteMode\(\)/);
  assert.match(page, /setProductMode\(localFavorite\)/);
  assert.match(client, /whatnow\.favoriteMode/);
  assert.match(client, /updateFavoriteMode/);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /verifySupabaseRequest/);
  assert.match(route, /Object\.keys\(body\)\.length !== 1/);
  assert.match(route, /favorite_mode_unavailable/);
  assert.match(schema, /userFavoriteModes/);
  assert.match(schema, /user_favorite_modes_value_valid/);
  assert.match(styles, /\.mode-pin-button/);
  assert.doesNotMatch(page, /mode-pin-note/);
  assert.doesNotMatch(styles, /\.mode-pin-note/);
});
