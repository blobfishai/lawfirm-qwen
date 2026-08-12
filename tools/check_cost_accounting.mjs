#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { accumulateUsage, calculateCost, emptyUsage } from "../sim/lib/cost-accounting.mjs";

const usage = emptyUsage();
accumulateUsage(usage, {
  prompt_tokens: 991108,
  completion_tokens: 7056,
  total_tokens: 998164,
  prompt_cache_hit_tokens: 895232,
  prompt_cache_miss_tokens: 95876,
});
const pricing = {
  inputPerM: 0.14,
  inputCacheHitPerM: 0.0028,
  inputCacheMissPerM: 0.14,
  outputPerM: 0.28,
};
const cost = calculateCost(usage, pricing);
if (usage.promptCacheHit !== 895232 || usage.promptCacheMiss !== 95876
    || usage.promptUnclassified !== 0 || cost.totalUsd !== 0.01790497) {
  throw new Error(`DeepSeek cache accounting changed: ${JSON.stringify({ usage, cost })}`);
}

const fallback = emptyUsage();
accumulateUsage(fallback, { prompt_tokens: 1000000, completion_tokens: 100000 });
const fallbackCost = calculateCost(fallback, { inputPerM: 2, outputPerM: 6 });
if (fallback.promptUnclassified !== 1000000 || fallbackCost.totalUsd !== 2.6) {
  throw new Error(`uncategorized input was not conservatively billed: ${JSON.stringify(fallbackCost)}`);
}

const config = JSON.parse(readFileSync("config/world.config.json", "utf8"));
const deepseek = config.models?.["deepseek-chat"];
if (deepseek?.model !== "deepseek-v4-flash"
    || deepseek?.pricing?.inputCacheHitPerM !== 0.0028
    || deepseek?.pricing?.inputCacheMissPerM !== 0.14
    || !deepseek?.pricing?.source || !deepseek?.pricing?.asOf) {
  throw new Error("DeepSeek served-model and pricing provenance are not pinned");
}
console.log("cost-accounting gate: cache hit/miss/output billing and conservative fallback pinned");
