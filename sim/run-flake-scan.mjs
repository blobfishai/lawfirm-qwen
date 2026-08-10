#!/usr/bin/env node
/**
 * Flake scan: run every world task N times with grok-4.5 and classify each task as
 * pass / FLAKY / fail. Flaky tasks (0 < pass rate < 1) mark the capability frontier.
 * Also correlates pass rate with tool-call depth (interaction count).
 *
 * Usage:
 *   node sim/run-flake-scan.mjs [--tasks task_004,task_026 | --all] [--trials 2]
 *        [--concurrency 3] [--label wave1] [--world-file path/to/world.json]
 *
 * Runs against the LOCAL packaged world server (BLOBFISH_LOCAL=1) so VCode
 * verification is session-accurate. Start it first: npm run world:serve
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "config", "world.config.json"), "utf8"));
const argv = process.argv.slice(2);
const opt = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);

const TRIALS = Number(opt("--trials", "2"));
const CONCURRENCY = Number(opt("--concurrency", "3"));
const LABEL = opt("--label", "scan");
const WORLD_FILE = opt("--world-file",
  existsSync(join(ROOT, config.blobfish.worldFile)) ? join(ROOT, config.blobfish.worldFile) : join(ROOT, config.blobfish.previewWorldFile));

const raw = JSON.parse(readFileSync(WORLD_FILE, "utf8"));
const world = raw.world ?? raw;
const allTaskIds = (world.tasks ?? []).map((t) => t.task_id ?? t.id);
const taskIds = argv.includes("--tasks") ? opt("--tasks", "").split(",").filter(Boolean) : allTaskIds;

const TMP = join(ROOT, "data", "flake", ".trials");
mkdirSync(TMP, { recursive: true });

console.log(`Flake scan '${LABEL}': ${taskIds.length} tasks x ${TRIALS} trials, concurrency ${CONCURRENCY}`);
console.log(`World: ${WORLD_FILE} (${allTaskIds.length} tasks total)`);

function runTrial(taskId, trial) {
  return new Promise((resolve) => {
    const out = join(TMP, `${LABEL}-${taskId}-t${trial}.json`);
    rmSync(out, { force: true });
    const child = spawn("node", ["sim/run-simulation.mjs", "--task", taskId, "--json-out", out, "--world-file", WORLD_FILE], {
      cwd: ROOT,
      env: { ...process.env, BLOBFISH_LOCAL: "1" },
      stdio: ["ignore", "ignore", "ignore"],
    });
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, 10 * 60 * 1000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      let rec = null;
      try { rec = JSON.parse(readFileSync(out, "utf8")); } catch { /* no result file -> infra error */ }
      if (!rec) resolve({ taskId, trial, infraError: true, exitCode: code });
      else resolve({ taskId, trial, infraError: false, ...rec });
    });
  });
}

const jobs = [];
for (const t of taskIds) for (let i = 1; i <= TRIALS; i++) jobs.push({ taskId: t, trial: i });

const results = [];
let idx = 0;
let done = 0;
async function worker(wid) {
  await new Promise((r) => setTimeout(r, wid * 1500)); // stagger session creation
  while (idx < jobs.length) {
    const job = jobs[idx++];
    let res = await runTrial(job.taskId, job.trial);
    if (res.infraError) res = await runTrial(job.taskId, job.trial); // one retry for infra failures
    results.push(res);
    done++;
    console.log(`[${done}/${jobs.length}] ${job.taskId} trial ${job.trial}: ${res.infraError ? "INFRA_ERROR" : res.passed ? "PASS" : "fail(" + (res.failedConditions ?? []).join("|") + ")"} calls=${res.toolCalls ?? "-"} cost=$${res.costUsd ?? "-"}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

// ---------------------------------------------------------------- aggregation
const byTask = {};
for (const r of results) {
  const b = (byTask[r.taskId] ??= { taskId: r.taskId, trials: 0, passes: 0, infraErrors: 0, toolCalls: [], costUsd: 0, failedConditions: {} });
  if (r.infraError) { b.infraErrors++; continue; }
  b.trials++;
  if (r.passed) b.passes++;
  b.toolCalls.push(r.toolCalls ?? 0);
  b.costUsd += r.costUsd ?? 0;
  for (const c of r.failedConditions ?? []) b.failedConditions[c] = (b.failedConditions[c] ?? 0) + 1;
}
const taskMeta = Object.fromEntries((world.tasks ?? []).map((t) => [t.task_id ?? t.id, t]));
const rows = Object.values(byTask).map((b) => {
  const passRate = b.trials ? b.passes / b.trials : null;
  return {
    taskId: b.taskId,
    difficulty: taskMeta[b.taskId]?.difficulty_tier ?? null,
    tables: taskMeta[b.taskId]?.tables_affected ?? [],
    trials: b.trials,
    passes: b.passes,
    passRate,
    class: passRate === null ? "error" : passRate === 1 ? "pass" : passRate === 0 ? "fail" : "FLAKY",
    avgToolCalls: b.toolCalls.length ? +(b.toolCalls.reduce((a, c) => a + c, 0) / b.toolCalls.length).toFixed(1) : null,
    failedConditions: b.failedConditions,
    costUsd: +b.costUsd.toFixed(3),
    infraErrors: b.infraErrors,
  };
}).sort((a, b) => (a.passRate ?? -1) - (b.passRate ?? -1) || (b.avgToolCalls ?? 0) - (a.avgToolCalls ?? 0));

// depth buckets: pass rate vs interaction count
const buckets = { "1-5": [0, 0], "6-10": [0, 0], "11-20": [0, 0], "21+": [0, 0] };
for (const r of results.filter((x) => !x.infraError)) {
  const k = r.toolCalls <= 5 ? "1-5" : r.toolCalls <= 10 ? "6-10" : r.toolCalls <= 20 ? "11-20" : "21+";
  buckets[k][1]++;
  if (r.passed) buckets[k][0]++;
}
const depthCurve = Object.entries(buckets).map(([bucket, [p, n]]) => ({ bucket, trials: n, passRate: n ? +(p / n).toFixed(2) : null }));

const summary = {
  label: LABEL,
  worldFile: WORLD_FILE,
  worldId: world.world_id ?? null,
  model: "grok-4.5",
  finishedAt: new Date().toISOString(),
  trialsPerTask: TRIALS,
  totals: {
    tasks: rows.length,
    solidPass: rows.filter((r) => r.class === "pass").length,
    flaky: rows.filter((r) => r.class === "FLAKY").length,
    solidFail: rows.filter((r) => r.class === "fail").length,
    trialsRun: results.filter((r) => !r.infraError).length,
    infraErrors: results.filter((r) => r.infraError).length,
    costUsd: +rows.reduce((a, r) => a + r.costUsd, 0).toFixed(2),
  },
  depthCurve,
  tasks: rows,
  trialsRaw: results,
};
const outPath = join(ROOT, "data", "flake", `${LABEL}.json`);
writeFileSync(outPath, JSON.stringify(summary, null, 2));

console.log(`\n=== ${LABEL}: grok-4.5 pass-rate scoreboard ===`);
for (const r of rows) {
  console.log(`${(r.class === "FLAKY" ? "~FLAKY" : r.class).padEnd(7)} ${String(r.passes)}/${r.trials}  ${r.taskId}  calls~${r.avgToolCalls ?? "?"}  ${Object.keys(r.failedConditions).join(",") || "-"}`);
}
console.log(`\nDepth curve (pass rate vs tool-call count):`);
for (const d of depthCurve) console.log(`  ${d.bucket.padEnd(6)} trials=${d.trials}  passRate=${d.passRate ?? "-"}`);
console.log(`\nTotals: ${JSON.stringify(summary.totals)}`);
console.log(`Report: ${outPath}`);
