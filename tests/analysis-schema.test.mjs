import assert from "node:assert/strict";
import test from "node:test";
import { validateAnalysisResult } from "../app/analysis-schema.ts";
import { validAnalysisResult } from "./analysis-fixture.mjs";

test("accepts a complete structured analysis", () => {
  assert.equal(validateAnalysisResult(validAnalysisResult), true);
});

test("rejects incomplete or mistyped model output", () => {
  assert.equal(validateAnalysisResult({ ...validAnalysisResult, summary: undefined }), false);
  assert.equal(validateAnalysisResult({ ...validAnalysisResult, confidence: "certain" }), false);
  assert.equal(validateAnalysisResult({ ...validAnalysisResult, actionPlan: [{ step: 0 }] }), false);
  assert.equal(validateAnalysisResult({ ...validAnalysisResult, sourceLanguage: "fi" }), false);
  assert.equal(validateAnalysisResult({ ...validAnalysisResult, sourceLanguage: "de" }), true);
  assert.equal(validateAnalysisResult({ ...validAnalysisResult, events: [{ ...validAnalysisResult.events[0], localTime: 1400 }] }), false);
});
