import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateOpenAICostMicrousd,
  GPT_5_6_LUNA_CACHED_INPUT_USD_PER_MILLION,
  GPT_5_6_LUNA_INPUT_USD_PER_MILLION,
  GPT_5_6_LUNA_OUTPUT_USD_PER_MILLION,
} from "../app/analysis-cost.ts";
import {
  FREE_PLAN_ENTITLEMENTS,
  SUBSCRIPTION_PRICING_DRAFT,
} from "../app/subscription-plans.ts";

test("GPT-5.6 Luna cost estimate uses the approved model price inputs", () => {
  assert.equal(GPT_5_6_LUNA_INPUT_USD_PER_MILLION, 1);
  assert.equal(GPT_5_6_LUNA_CACHED_INPUT_USD_PER_MILLION, 0.1);
  assert.equal(GPT_5_6_LUNA_OUTPUT_USD_PER_MILLION, 6);
  assert.equal(estimateOpenAICostMicrousd({
    inputTokens: 1_234,
    cachedInputTokens: 128,
    outputTokens: 456,
    totalTokens: 1_690,
  }), 3_855);
});

test("cost estimation clamps malformed usage instead of producing negative spend", () => {
  assert.equal(estimateOpenAICostMicrousd({
    inputTokens: 100,
    cachedInputTokens: 500,
    outputTokens: -1,
    totalTokens: 99,
  }), 10);
});

test("subscription pricing remains a non-purchasable draft", () => {
  assert.equal(SUBSCRIPTION_PRICING_DRAFT.monthlyGrossCents, 1_999);
  assert.equal(SUBSCRIPTION_PRICING_DRAFT.status, "draft_not_for_sale");
  assert.equal(SUBSCRIPTION_PRICING_DRAFT.checkoutEnabled, false);
  assert.deepEqual(FREE_PLAN_ENTITLEMENTS, {
    planCode: "free",
    rolling24HourAnalyses: 3,
    rolling7DayAnalyses: 10,
    savedFiles: 10,
    activeReminders: 3,
    weeklyReminderCreations: 10,
  });
});
