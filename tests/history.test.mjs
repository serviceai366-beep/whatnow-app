import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("history uses the signed-in user's Supabase token and never a privileged server key", async () => {
  const history = await readFile(new URL("../app/analysis-history.ts", import.meta.url), "utf8");
  const auth = await readFile(new URL("../app/supabase-auth.ts", import.meta.url), "utf8");

  assert.match(history, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(history, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(auth, /export async function getAccessToken/);
  assert.doesNotMatch(`${history}\n${auth}`, /service_role|SUPABASE_SERVICE|CLIENT_SECRET/);
});

test("history stores only the structured result and metadata, not the original input", async () => {
  const history = await readFile(new URL("../app/analysis-history.ts", import.meta.url), "utf8");

  assert.match(history, /result: input\.result/);
  assert.match(history, /source_kind: input\.sourceKind/);
  assert.doesNotMatch(history, /documentText|selectedDocument|fileData|base64|originalText/);
});

test("database migration enables per-user RLS and blocks anonymous table access", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260713_document_analyses.sql", import.meta.url), "utf8");

  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.document_analyses from anon/i);
  assert.match(migration, /auth\.uid\(\) = user_id/g);
  assert.match(migration, /on delete cascade/i);
  assert.match(migration, /octet_length\(result::text\) <= 524288/i);
});
