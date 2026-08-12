#!/usr/bin/env node
/**
 * Compare the 21-task pre/post product-surface boundary runs without mutating
 * either episode corpus. The local baseline and v16 candidate use the same
 * `deepseek-chat` registry alias; the original hosted proof is included as a
 * separate provenance column because it used `deepseek-v4-flash`.
 *
 * Run after the namespaced v16 sweep:
 *   node sim/compare-v16-boundary.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const CONFIG = JSON.parse(readFileSync(join(ROOT, "config/world.config.json"), "utf8"));
const TASKS = CONFIG.flake?.provenFlakyTasks ?? [];
const OLD_DIR = join(ROOT, opt("--old-dir", "data/leaderboard/episodes/deepseek-chat"));
const NEW_DIR = join(ROOT, opt(
  "--new-dir", "data/leaderboard/episodes/deepseek-chat/m1-v16-boundary",
));
const PROVENANCE = join(ROOT, opt("--provenance", "data/flake/flaky-trajectories.json"));
const DATA_OUT = join(ROOT, opt("--data-out", "data/migration/v16-boundary-shift.json"));
const DOC_OUT = join(ROOT, opt("--docs-out", "docs/V16-BOUNDARY-SHIFT.md"));

function episode(path) {
  if (!existsSync(path)) throw new Error(`missing episode: ${path.slice(ROOT.length + 1)}`);
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value.infraError) throw new Error(`infrastructure error in ${path.slice(ROOT.length + 1)}`);
  return value;
}

function summarize(items) {
  const passes = items.filter((item) => item.passed === true).length;
  const failed = {};
  const tools = new Set();
  for (const item of items) {
    for (const condition of item.failedConditions ?? []) failed[condition] = (failed[condition] ?? 0) + 1;
    for (const step of item.steps ?? []) if (step.tool) tools.add(step.tool);
  }
  const meanCalls = items.reduce((sum, item) => sum + Number(item.toolCalls ?? item.steps?.length ?? 0), 0) / items.length;
  return {
    episodes: items.length,
    passes,
    class: passes === 0 ? "fail" : passes === items.length ? "pass" : "FLAKY",
    mean_tool_calls: Number(meanCalls.toFixed(1)),
    failed_conditions: Object.fromEntries(
      Object.entries(failed).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    ),
    tools: [...tools].sort(),
    measured_from: items.map((item) => item.finishedAt ?? item.completed_at).filter(Boolean).sort(),
  };
}

const original = JSON.parse(readFileSync(PROVENANCE, "utf8"));
const originalByTask = {};
for (const trajectory of original.trajectories ?? []) {
  (originalByTask[trajectory.task_id] ??= []).push({
    ...trajectory,
    toolCalls: trajectory.steps?.length ?? 0,
    failedConditions: trajectory.verifier?.failed_conditions ?? [],
  });
}

function evidence(oldRun, newRun) {
  const callDelta = Number((newRun.mean_tool_calls - oldRun.mean_tool_calls).toFixed(1));
  const topFailure = Object.keys(newRun.failed_conditions)[0] ?? null;
  if (oldRun.class === newRun.class) return "class stable";
  const direction = newRun.passes > oldRun.passes ? "more passes" : "fewer passes";
  const condition = topFailure ? `; leading v16 failure: ${topFailure}` : "";
  return `${direction}; mean calls ${callDelta >= 0 ? "+" : ""}${callDelta}${condition}`;
}

const rows = TASKS.map((taskId) => {
  const oldItems = [1, 2, 3].map((n) => episode(join(OLD_DIR, `${taskId}-t${n}.json`)));
  const newItems = [1, 2, 3].map((n) => episode(join(NEW_DIR, `${taskId}-t${n}.json`)));
  const oldRun = summarize(oldItems);
  const newRun = summarize(newItems);
  const hosted = originalByTask[taskId]?.length ? summarize(originalByTask[taskId]) : null;
  return {
    task_id: taskId,
    pre_v16_local: oldRun,
    v16: newRun,
    original_hosted_proof: hosted,
    class_changed: oldRun.class !== newRun.class,
    observed_evidence: evidence(oldRun, newRun),
  };
});

const report = {
  schema: "lawfirm.v16-boundary-shift.v1",
  comparison: {
    task_count: rows.length,
    episodes_per_task_per_local_lane: 3,
    pre_v16_model_alias: "deepseek-chat",
    v16_model_alias: "deepseek-chat",
    original_hosted_model: original.model,
    causal_limit: "The provider alias is not a pinned model digest, and the pre-v16 episode records do not carry a world version. The candidate run is v16, but tool surface and sampling date both changed, so class shifts are observations, not causal estimates.",
  },
  summary: {
    stable: rows.filter((row) => !row.class_changed).length,
    changed: rows.filter((row) => row.class_changed).length,
    pre_v16: Object.fromEntries(["pass", "FLAKY", "fail"].map((kind) => [kind, rows.filter((row) => row.pre_v16_local.class === kind).length])),
    v16: Object.fromEntries(["pass", "FLAKY", "fail"].map((kind) => [kind, rows.filter((row) => row.v16.class === kind).length])),
  },
  rows,
};

const line = (row) => `| ${row.task_id} | ${row.pre_v16_local.passes}/3 ${row.pre_v16_local.class} | ${row.v16.passes}/3 ${row.v16.class} | ${row.original_hosted_proof ? `${row.original_hosted_proof.passes}/${row.original_hosted_proof.episodes} ${row.original_hosted_proof.class}` : "—"} | ${row.observed_evidence} |`;
const changed = rows.filter((row) => row.class_changed);
const markdown = `# v16 boundary migration report

The canonical 21-task boundary set was re-run for three episodes on the v16
product-only surface. Historical and candidate episodes live in separate
directories. The local columns use the same \`deepseek-chat\` registry alias;
the original hosted proof is shown separately because it used
\`${original.model}\`.

> Causal limit: ${report.comparison.causal_limit}

## Summary

- Stable class: **${report.summary.stable}/${rows.length}**
- Changed class: **${report.summary.changed}/${rows.length}**
- Pre-v16 local: ${JSON.stringify(report.summary.pre_v16)}
- v16: ${JSON.stringify(report.summary.v16)}

## Every task

| Task | Pre-v16 local | v16 | Original hosted proof | Observed evidence |
|---|---:|---:|---:|---|
${rows.map(line).join("\n")}

## Changed tasks

${changed.length ? changed.map((row) => `- **${row.task_id}:** ${row.pre_v16_local.class} → ${row.v16.class}; ${row.observed_evidence}.`).join("\n") : "No class changes observed."}

The machine-readable report preserves per-lane failure-condition counts, tool
sets, call averages, and measurement timestamps for every task.
`;

mkdirSync(dirname(DATA_OUT), { recursive: true });
mkdirSync(dirname(DOC_OUT), { recursive: true });
writeFileSync(DATA_OUT, JSON.stringify(report, null, 2) + "\n");
writeFileSync(DOC_OUT, markdown);
console.log(`boundary migration: ${report.summary.stable} stable, ${report.summary.changed} changed -> ${DOC_OUT.slice(ROOT.length + 1)}`);
