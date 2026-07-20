import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("history uses the signed-in user's Supabase token and never a privileged server key", async () => {
  const history = await readFile(new URL("../app/analysis-history.ts", import.meta.url), "utf8");
  const auth = await readFile(new URL("../app/supabase-auth.ts", import.meta.url), "utf8");
  const config = await readFile(new URL("../app/supabase-config.ts", import.meta.url), "utf8");

  assert.match(history, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(history, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(config, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(auth, /export async function getAccessToken/);
  assert.doesNotMatch(`${history}\n${auth}`, /service_role|SUPABASE_SERVICE|CLIENT_SECRET/);
});

test("history stores only the structured result and metadata, not the original input", async () => {
  const history = await readFile(new URL("../app/analysis-history.ts", import.meta.url), "utf8");

  assert.match(history, /result: input\.result/);
  assert.match(history, /source_kind: input\.sourceKind/);
  assert.doesNotMatch(history, /documentText|selectedDocument|fileData|base64|originalText/);
});

test("history is capped at the latest 10 analyses for each account", async () => {
  const history = await readFile(new URL("../app/analysis-history.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/20260714120100_limit_document_analyses.sql", import.meta.url), "utf8");

  assert.match(history, /ANALYSIS_HISTORY_LIMIT = 10/);
  assert.match(history, /limit=\$\{ANALYSIS_HISTORY_LIMIT\}/);
  assert.match(history, /offset=\$\{ANALYSIS_HISTORY_LIMIT\}/);
  assert.match(history, /document_analyses\?id=in\.\(\$\{ids\.join\(\",\"\)\}\)/);
  assert.match(history, /await trimAnalysisHistory\(input\.accessToken\)/);
  assert.match(migration, /partition by user_id/i);
  assert.match(migration, /position > 10/i);
  assert.match(migration, /offset 10/i);
  assert.match(migration, /after insert on public\.document_analyses/i);
  assert.match(migration, /security definer/i);
});

test("database migration enables per-user RLS and blocks anonymous table access", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260713_document_analyses.sql", import.meta.url), "utf8");

  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.document_analyses from anon/i);
  assert.match(migration, /auth\.uid\(\) = user_id/g);
  assert.match(migration, /on delete cascade/i);
  assert.match(migration, /octet_length\(result::text\) <= 524288/i);
});
