/** Provider-reported token accounting and deterministic USD cost calculation. */

function tokenCount(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function emptyUsage() {
  return {
    prompt: 0,
    completion: 0,
    total: 0,
    promptCacheHit: 0,
    promptCacheMiss: 0,
    promptUnclassified: 0,
    cacheBreakdownTurns: 0,
  };
}

/**
 * Add one OpenAI-compatible response usage object to an episode accumulator.
 *
 * DeepSeek reports both cache fields. Other providers may report only
 * prompt_tokens_details.cached_tokens, or no cache split at all. Tokens whose
 * cache status is unknown remain unclassified and are conservatively billed at
 * inputPerM; they are never silently treated as cache hits.
 */
export function accumulateUsage(total, raw = {}) {
  const prompt = tokenCount(raw.prompt_tokens);
  const completion = tokenCount(raw.completion_tokens);
  const all = tokenCount(raw.total_tokens) || prompt + completion;
  const hitValue = raw.prompt_cache_hit_tokens
    ?? raw.prompt_tokens_details?.cached_tokens;
  const missValue = raw.prompt_cache_miss_tokens;
  const hasHit = hitValue !== undefined && hitValue !== null;
  const hasMiss = missValue !== undefined && missValue !== null;
  let hit = hasHit ? tokenCount(hitValue) : 0;
  let miss = hasMiss ? tokenCount(missValue) : 0;

  if (hasHit && !hasMiss) miss = Math.max(0, prompt - hit);
  if (!hasHit && hasMiss) hit = Math.max(0, prompt - miss);
  const classified = Math.min(prompt, hit + miss);
  // A malformed provider split must not increase or understate billed input.
  if (hit + miss > prompt && hit + miss > 0) {
    const scale = prompt / (hit + miss);
    hit = Math.floor(hit * scale);
    miss = prompt - hit;
  }

  total.prompt += prompt;
  total.completion += completion;
  total.total += all;
  total.promptCacheHit += hit;
  total.promptCacheMiss += miss;
  total.promptUnclassified += Math.max(0, prompt - classified);
  if (hasHit || hasMiss) total.cacheBreakdownTurns += 1;
  return total;
}

export function calculateCost(usage, pricing = {}) {
  const fallbackInput = Number(pricing.inputPerM ?? 0);
  const hitRate = Number(pricing.inputCacheHitPerM ?? fallbackInput);
  const missRate = Number(pricing.inputCacheMissPerM ?? fallbackInput);
  const outputRate = Number(pricing.outputPerM ?? 0);
  const hit = tokenCount(usage.promptCacheHit);
  const miss = tokenCount(usage.promptCacheMiss);
  const unclassified = tokenCount(usage.promptUnclassified)
    || Math.max(0, tokenCount(usage.prompt) - hit - miss);
  const inputCacheHitUsd = hit / 1e6 * hitRate;
  const inputCacheMissUsd = miss / 1e6 * missRate;
  const inputUnclassifiedUsd = unclassified / 1e6 * fallbackInput;
  const outputUsd = tokenCount(usage.completion) / 1e6 * outputRate;
  const totalUsd = inputCacheHitUsd + inputCacheMissUsd + inputUnclassifiedUsd + outputUsd;
  const round = (value) => +value.toFixed(8);
  return {
    totalUsd: round(totalUsd),
    inputCacheHitUsd: round(inputCacheHitUsd),
    inputCacheMissUsd: round(inputCacheMissUsd),
    inputUnclassifiedUsd: round(inputUnclassifiedUsd),
    outputUsd: round(outputUsd),
    currency: pricing.currency ?? "USD",
    pricingAsOf: pricing.asOf ?? null,
    pricingSource: pricing.source ?? null,
  };
}
