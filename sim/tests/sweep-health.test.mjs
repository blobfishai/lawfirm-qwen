import assert from "node:assert/strict";
import { classifyEpisode, frictionStats, summarizeSweepHealth } from "../lib/sweep-health.mjs";

assert.equal(classifyEpisode({ toolCalls: 0, finalText: "I cannot assist with that request." }), "refusal");
assert.equal(classifyEpisode({
  toolCalls: 0,
  steps: [{ tool: "_final_answer", observation: "I have to decline." }],
}), "refusal");
assert.equal(classifyEpisode({ toolCalls: 0, finalText: "Done." }), "zero_call");
assert.equal(classifyEpisode({ infraError: true }), "infra_error");
assert.equal(classifyEpisode({ toolCalls: 1 }), "graded");
assert.equal(classifyEpisode({ notMeasured: true }), "not_measured");

assert.deepEqual(frictionStats([{
  steps: [
    { tool: "matters_list", observation: "ERROR rate_limited" },
    { tool: "matters_list", observation: "ok" },
    { tool: "_final_answer", observation: "stale_reference is only prose here" },
  ],
}]), { hits: 1, calls: 2, rate: 0.5 });

const health = summarizeSweepHealth({
  engine: "fixture",
  label: "selftest",
  taskSet: "fixture",
  results: [
    { toolCalls: 0, finalText: "I cannot help with that.", durationMs: 10 },
    { toolCalls: 0, finalText: "No tools used.", durationMs: 20 },
    { toolCalls: 1, durationMs: 30, steps: [{ tool: "x", observation: "rate_limited" }] },
    { infraError: true, durationMs: 40, failedConditions: ["verifier crashed"] },
  ],
  canaries: [{ tid: "task_ok", ok: true }],
  expectedFrictionRate: 0.01,
});
assert.deepEqual(health.classes, {
  refusal: 1,
  zero_call: 1,
  graded: 1,
  infra_error: 1,
});
assert.deepEqual(health.wallClockMs, { measured: 4, p50: 20, p95: 40, max: 40 });
assert.equal(health.verifierCrashes, 1);
assert.equal(health.friction.hits, 1);
assert.equal(health.friction.driftAlert, true);
assert.deepEqual(health.canaries.tasks, ["task_ok"]);

console.log("sweep-health unit gate: classifications, timing, friction, crashes clean");
