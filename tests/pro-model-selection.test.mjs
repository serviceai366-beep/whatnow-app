import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_MODEL, isSelectableModel } from "../app/model-selection.ts";
import { profileDefaultModels } from "../app/profile-types.ts";

test("only the three supported GPT-5.6 choices can be selected", () => {
  assert.deepEqual(profileDefaultModels, ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]);
  assert.equal(DEFAULT_MODEL, "gpt-5.6-luna");
  for (const model of profileDefaultModels) assert.equal(isSelectableModel(model), true);
  assert.equal(isSelectableModel("gpt-5.6-unknown"), false);
});

test("all AI task routes resolve the account model and keep reasoning fixed to low", async () => {
  const routes = await Promise.all([
    readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/followups/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/document-studio/route.ts", import.meta.url), "utf8"),
  ]);
  for (const [index, route] of routes.entries()) {
    assert.match(route, /selectedModelForUser/);
    assert.match(route, index === 0
      ? /REASONING_EFFORT\s*=\s*["']low["']/
      : /reasoning:\s*\{\s*effort:\s*["']low["']\s*\}/);
  }
});
