/** Deterministic sweep-health classification and summaries (M7.1). */

export const REFUSAL_RE = /\b(cannot assist|can't assist|cannot help with|unable to (help|assist)|i (must|have to) (decline|refuse)|against my (guidelines|principles))\b/i;

function episodeText(record) {
  const finalStep = [...(record.steps ?? [])].reverse()
    .find((step) => step.tool === "_final_answer");
  return [record.finalText, finalStep?.observation].filter(Boolean).join("\n");
}

export function classifyEpisode(record) {
  if (record.notMeasured) return "not_measured";
  if (record.infraError) return "infra_error";
  if ((record.toolCalls ?? 0) === 0) {
    return REFUSAL_RE.test(episodeText(record)) ? "refusal" : "zero_call";
  }
  return "graded";
}

export function frictionStats(results) {
  let hits = 0;
  let calls = 0;
  for (const record of results) {
    for (const step of record.steps ?? []) {
      if (!step.tool || step.tool === "_final_answer") continue;
      calls++;
      const observation = String(step.observation ?? step.text ?? "");
      if (/rate_limited|stale_reference|RESOURCE_EXHAUSTED|HOURLY_APIINVOCATION_LIMIT_EXCEEDED|ENVELOPE_LOCKED/i.test(observation)) {
        hits++;
      }
    }
  }
  return { hits, calls, rate: calls ? +(hits / calls).toFixed(4) : null };
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarizeSweepHealth({
  engine,
  label,
  taskSet,
  results,
  canaries,
  expectedFrictionRate = null,
  extra = {},
}) {
  const classes = {};
  for (const record of results) {
    const kind = classifyEpisode(record);
    classes[kind] = (classes[kind] ?? 0) + 1;
  }
  const friction = frictionStats(results);
  const durations = results.map((record) => record.durationMs)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const verifierCrashes = results.filter((record) => /verifier crash/i.test(JSON.stringify([
    record.failedConditions,
    record.advisoryConditions,
    record.steps,
  ]))).length;
  return {
    engine,
    label,
    taskSet,
    episodes: results.length,
    classes,
    canaries: {
      run: canaries.length,
      failed: canaries.filter((canary) => !canary.ok).length,
      tasks: canaries.map((canary) => canary.tid),
    },
    verifierCrashes,
    wallClockMs: {
      measured: durations.length,
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: durations.length ? Math.max(...durations) : null,
    },
    friction: {
      ...friction,
      expectedRate: expectedFrictionRate,
      driftAlert: expectedFrictionRate !== null && friction.rate !== null
        && Math.abs(friction.rate - expectedFrictionRate) > 0.005,
    },
    ...extra,
  };
}
