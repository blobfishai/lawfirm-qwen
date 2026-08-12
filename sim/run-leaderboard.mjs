#!/usr/bin/env node
/**
 * Leaderboard runner: measures one or more engines across the world's tasks
 * (N episodes each), writes per-episode records + per-engine aggregates.
 *
 * Usage:
 *   node sim/run-leaderboard.mjs --engines deepseek-chat,claude-haiku-4-5
 *        [--tasks scored|all|flaky|boundary|task_001,task_002]
 *        [--episodes 3] [--concurrency 6] [--label run1]
 *        [--episode-namespace run1] [--tool-scope all|systems]
 *        [--compress-episodes] [--max-cost-usd 1800]
 *
 * Task sets:
 *   scored    all tasks minus config.scoring.quarantinedTasks (default)
 *   flaky     config.flake.provenFlakyTasks (the 21 boundary tasks)
 *   boundary  flaky + too_hard + in_band acceptance labels
 *   all       every task
 *
 * Outputs:
 *   data/leaderboard/episodes/<engine>/<task>-t<n>.json[.gz] (full step traces)
 *   data/leaderboard/results/<engine>.json               (aggregate)
 *
 * The world server must be running: npm run world:serve
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyEpisode, summarizeSweepHealth } from "./lib/sweep-health.mjs";
import {
  compressJsonRecord, findJsonRecord, readJsonRecordFile, removeJsonRecord,
} from "./lib/episode-record.mjs";
import { MEASUREMENT_PROTOCOL } from "./lib/measurement-protocol.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "config", "world.config.json"), "utf8"));
const argv = process.argv.slice(2);
const opt = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);

const ENGINES = opt("--engines", "").split(",").filter(Boolean);
const EPISODES = Number(opt("--episodes", "3"));
const CONCURRENCY = Number(opt("--concurrency", "6"));
const LABEL = opt("--label", "leaderboard");
const LABEL_EXPLICIT = argv.includes("--label");
const TASKSET = opt("--tasks", "scored");
const RESUME = argv.includes("--resume"); // skip episodes whose record already exists
const RETRY_UNGRADED = argv.includes("--retry-ungraded"); // replace cached infra/refusal episodes
const COMPRESS_EPISODES = argv.includes("--compress-episodes"); // deterministic .json.gz evidence
const MAX_COST_USD = Number(opt("--max-cost-usd", "0")); // conservative reported-cost circuit breaker
const MAX_EPISODE_COST_USD = Number(opt("--max-episode-cost-usd", "0"));
const AGG_ONLY = argv.includes("--aggregate-only"); // no API calls: aggregate existing episode files
const CANARY_PROBE = argv.includes("--canary-probe"); // one oracle check, no model calls
const HEALTH_OUT = opt("--health-out", null);
const WORLD_FILE = opt("--world-file", null);      // e.g. world/blobfish/world-expanded.json
const LOCAL_BASE = opt("--local-base", null);      // e.g. http://127.0.0.1:8972
const MCP_MODE = opt("--mcp", "bridge");           // bridge | multi (per-system MCP servers)
const TOOL_SCOPE = opt("--tool-scope", "all");    // all | systems
const EPISODE_NAMESPACE = opt(
  "--episode-namespace", LABEL_EXPLICIT ? LABEL : "",
);

if (EPISODE_NAMESPACE && !/^[A-Za-z0-9._-]+$/.test(EPISODE_NAMESPACE)) {
  console.error("--episode-namespace must contain only letters, digits, dot, underscore, or hyphen");
  process.exit(1);
}
if (!["all", "systems"].includes(TOOL_SCOPE)) {
  console.error("--tool-scope must be all or systems");
  process.exit(1);
}
if (![MAX_COST_USD, MAX_EPISODE_COST_USD].every((value) => Number.isFinite(value) && value >= 0)) {
  console.error("cost limits must be non-negative numbers (0 disables)");
  process.exit(1);
}

if (!ENGINES.length) {
  console.error(`--engines required. Registry: ${Object.keys(config.models ?? {}).join(", ")}`);
  process.exit(1);
}

const world = (() => {
  const raw = JSON.parse(readFileSync(join(ROOT, WORLD_FILE ?? config.blobfish.world), "utf8"));
  return raw.world ?? raw;
})();
const quarantined = new Set(Object.keys(config.scoring?.quarantinedTasks ?? {}));
const flaky = new Set(config.flake?.provenFlakyTasks ?? []);

function taskIds() {
  const all = world.tasks.map((t) => t.task_id);
  if (TASKSET === "all") return all;
  if (TASKSET === "expansion") return world.tasks.filter((t) => t.expansion).map((t) => t.task_id);
  if (TASKSET === "scored") return all.filter((t) => !quarantined.has(t));
  if (TASKSET === "law-native") {
    const leaked = new Set(config.scoring?.domainFidelity?.affectedTasks ?? []);
    return all.filter((t) => !quarantined.has(t) && !leaked.has(t));
  }
  if (TASKSET === "flaky") return all.filter((t) => flaky.has(t));
  if (TASKSET === "boundary") {
    const keep = new Set(["in_band", "too_hard"]);
    return all.filter((t) => {
      if (quarantined.has(t)) return false;
      const task = world.tasks.find((x) => x.task_id === t);
      return flaky.has(t) || keep.has(task.acceptance_label);
    });
  }
  return TASKSET.split(",").filter(Boolean);
}

// ---------------------------------------------------------------- families
function practiceArea(task) {
  const src = task.provenance?.source_workflow ?? "";
  const m = /^[a-z0-9_]+:\s*([a-z0-9\-]+)/i.exec(src);
  if (m) return m[1];
  return task.method === "graph_walk" ? "graph-walk" : "general";
}
function shape(task) {
  const walk = task.walk ?? [];
  if (walk.includes("documents_create")) return "document-drafting";
  if (walk.some((t) => t.endsWith("_records_agent"))) return "records-research";
  if (walk.some((t) => t.startsWith("update_"))) return "record-update";
  if (walk.some((t) => t.endsWith("_create"))) return "workflow-chain";
  return "read-analyze";
}
function anchor(task) {
  const src = task.provenance?.source_workflow ?? "";
  const m = /^([a-z0-9_]+):/i.exec(src);
  return m ? m[1] : "graph-walk";
}

// ---------------------------------------------------------------- episodes
const EP_DIR = join(ROOT, "data", "leaderboard", "episodes");
const RES_DIR = join(ROOT, "data", "leaderboard", "results");
mkdirSync(RES_DIR, { recursive: true });

function runEpisode(engine, taskId, ep) {
  // A measured migration comparison must never overwrite the historical
  // episodes it is meant to compare against. An explicit label therefore
  // becomes an episode namespace unless the caller overrides it.
  const dir = EPISODE_NAMESPACE
    ? join(EP_DIR, engine, EPISODE_NAMESPACE)
    : join(EP_DIR, engine);
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${taskId}-t${ep}.json`);
  const cachedPath = findJsonRecord(out);
  if ((RESUME || AGG_ONLY) && cachedPath) {
    try {
      const cached = readJsonRecordFile(cachedPath);
      if (!(RESUME && RETRY_UNGRADED && ["infra_error", "refusal"].includes(classifyEpisode(cached)))) {
        return Promise.resolve({ cached: true, ...cached });
      }
    }
    catch { /* rerun */ }
  }
  if (AGG_ONLY) return Promise.resolve({ taskId, notMeasured: true });
  removeJsonRecord(out);
  return new Promise((resolve) => {
    const child = spawn("node", [
      "sim/run-simulation.mjs", "--task", taskId, "--engine", engine,
      "--episode-out", out, "--mcp", MCP_MODE, "--tool-scope", TOOL_SCOPE,
      ...(WORLD_FILE ? ["--world-file", join(ROOT, WORLD_FILE)] : []),
    ], {
      cwd: ROOT,
      env: {
        ...process.env,
        BLOBFISH_LOCAL: "1",
        ...(LOCAL_BASE ? { BLOBFISH_LOCAL_BASE: LOCAL_BASE } : {}),
      },
      stdio: ["ignore", "ignore", "ignore"],
    });
    // Wall-clock opportunity is part of the measurement protocol and must not
    // leak the oracle walk length. It is distinct from the uniform 50-turn
    // action budget and only classifies a genuinely stuck process as infra.
    const timeoutMinutes = MEASUREMENT_PROTOCOL.wallClockTimeoutMinutes;
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, timeoutMinutes * 60 * 1000);
    child.on("exit", () => {
      clearTimeout(timer);
      let rec = null;
      try { rec = JSON.parse(readFileSync(out, "utf8")); } catch { /* infra */ }
      if (rec && COMPRESS_EPISODES) compressJsonRecord(out);
      resolve(rec ?? { taskId, engine, infraError: true });
    });
  });
}

// ---------------------------------------------------------------- canary
// M7.1: the harness measures itself during every sweep. One oracle trial per
// CANARY_EVERY model episodes replays a reference walk against the live world
// and must pass — an oracle failure means the HARNESS (world server, session
// plumbing, verifier surface) broke mid-sweep, so the sweep halts rather than
// recording numbers a dead harness would fabricate (docs/AUDIT.md defect 11).
const CANARY_EVERY = Number(opt("--canary-every", "25")); // 0 disables
const CANARY_BASE = LOCAL_BASE ?? config.blobfish.localBase;
let canarySeq = 0;

if (!Number.isInteger(CANARY_EVERY) || CANARY_EVERY < 0) {
  console.error("--canary-every must be a non-negative integer");
  process.exit(1);
}

function runCanary(ids) {
  // Deterministic rotation through the task set — same canaries every run.
  const tid = ids[(canarySeq++ * 7) % ids.length];
  const out = join(ROOT, "data", "leaderboard", `.canary-${process.pid}-${canarySeq}.json`);
  return new Promise((resolve) => {
    const child = spawn("python3", [
      "world/local/oracle.py", "--base", CANARY_BASE,
      "--world", join(ROOT, WORLD_FILE ?? config.blobfish.world),
      "--tasks", tid, "--out", out,
    ], { cwd: ROOT, stdio: ["ignore", "ignore", "ignore"] });
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, 120_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      rmSync(out, { force: true });
      resolve({ tid, ok: code === 0 });
    });
  });
}

class CanaryFailure extends Error {
  constructor(tid) { super(`oracle canary failed on ${tid} — harness broken, sweep halted`); this.tid = tid; }
}

class SpendLimit extends Error {
  constructor(message) { super(message); }
}

async function measureEngine(engine, ids) {
  const jobs = [];
  // Episode-major scheduling gives every task one observation before any task
  // receives its second. If a spend circuit breaker trips, coverage is broad
  // and the resumable evidence is still useful; session state is private, so
  // this ordering cannot change an episode's semantics.
  for (let ep = 1; ep <= EPISODES; ep++) for (const t of ids) jobs.push({ t, ep });
  const results = [];
  const canaries = [];
  let idx = 0, done = 0, halted = null;
  // Probe before the first paid episode, then interleave every N episodes.
  if (!AGG_ONLY && CANARY_EVERY) {
    const initial = await runCanary(ids);
    canaries.push(initial);
    if (!initial.ok) {
      const failure = new CanaryFailure(initial.tid);
      writeSweepHealth(engine, ids, results, canaries, { haltedBy: failure.message });
      throw failure;
    }
  }
  async function worker(wid) {
    await new Promise((r) => setTimeout(r, wid * 1200));
    while (idx < jobs.length && !halted) {
      const { t, ep } = jobs[idx++];
      let r = await runEpisode(engine, t, ep);
      if (r.infraError) r = await runEpisode(engine, t, ep); // one infra retry
      results.push({ ...r, taskId: r.taskId ?? t, episode: ep });
      done++;
      const episodeCost = Number(r.costUsd ?? 0);
      const cumulativeCost = results.reduce((sum, item) => sum + Number(item.costUsd ?? 0), 0);
      if (!halted && MAX_EPISODE_COST_USD && episodeCost > MAX_EPISODE_COST_USD) {
        halted = new SpendLimit(
          `episode cost $${episodeCost.toFixed(2)} exceeded $${MAX_EPISODE_COST_USD.toFixed(2)} on ${t}-t${ep}`,
        );
      }
      if (!halted && MAX_COST_USD && cumulativeCost >= MAX_COST_USD) {
        halted = new SpendLimit(
          `sweep cost $${cumulativeCost.toFixed(2)} reached $${MAX_COST_USD.toFixed(2)} circuit breaker`,
        );
      }
      if (halted) break;
      if (!AGG_ONLY && CANARY_EVERY && done % CANARY_EVERY === 0) {
        const c = await runCanary(ids);
        canaries.push(c);
        if (!c.ok) { halted = new CanaryFailure(c.tid); break; }
      }
      if (done % 10 === 0 || done === jobs.length) {
        const p = results.filter((x) => x.passed).length;
        const cost = results.reduce((a, x) => a + (x.costUsd ?? 0), 0);
        console.log(`[${engine}] ${done}/${jobs.length} episodes | pass ${p}/${results.filter((x) => !x.infraError).length} | $${cost.toFixed(2)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  if (halted) {
    writeSweepHealth(engine, ids, results, canaries, {
      haltedBy: halted.message,
      spend: {
        reportedCostUsd: +results.reduce((sum, item) => sum + Number(item.costUsd ?? 0), 0).toFixed(5),
        sweepLimitUsd: MAX_COST_USD || null,
        episodeLimitUsd: MAX_EPISODE_COST_USD || null,
      },
    });
    throw halted;
  }
  return { results, canaries };
}

// ---------------------------------------------------------------- health
// Refusals are reported separately from graded failures. A zero-call episode
// that is not a refusal remains a model failure under the benchmark's
// zero-call rule. The pure summary functions live in sim/lib so CI can test
// every classification without model calls.
function writeSweepHealth(engine, ids, results, canaries, extra = {}) {
  const expected = world.friction?.tool_failure_signature_rate ?? null;
  const health = summarizeSweepHealth({
    engine, label: LABEL, taskSet: TASKSET, results, canaries,
    expectedFrictionRate: expected, extra,
  });
  const p = HEALTH_OUT ? join(ROOT, HEALTH_OUT)
    : join(RES_DIR, `${engine}@${LABEL}.sweep-health.json`);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(health, null, 1));
  const alerts = [
    health.friction.driftAlert ? "FRICTION DRIFT" : null,
    health.verifierCrashes ? `${health.verifierCrashes} VERIFIER CRASHES` : null,
    health.canaries.failed ? "CANARY FAILED" : null,
    extra.haltedBy ? "HALTED" : null,
  ].filter(Boolean);
  console.log(`[${engine}] sweep-health: ${JSON.stringify(health.classes)} | friction ${health.friction.rate ?? "n/a"} (expect ${expected ?? "n/a"})${alerts.length ? " | ⚠ " + alerts.join(", ") : ""}`);
  console.log(`→ ${p}`);
  return health;
}

function aggregate(engine, ids, results) {
  const byTask = {};
  for (const r of results) {
    const b = (byTask[r.taskId] ??= { episodes: 0, passes: 0, rewards: [], toolCalls: [], cost: 0, infra: 0, failedConditions: {} });
    if (r.notMeasured) continue;
    if (r.infraError) { b.infra++; continue; }
    if (classifyEpisode(r) === "refusal") { b.refusals = (b.refusals ?? 0) + 1; continue; }
    b.episodes++;
    if (r.passed) b.passes++;
    b.rewards.push(r.reward ?? 0);
    b.toolCalls.push(r.toolCalls ?? 0);
    b.cost += r.costUsd ?? 0;
    for (const c of r.failedConditions ?? []) b.failedConditions[c] = (b.failedConditions[c] ?? 0) + 1;
  }
  const taskMeta = Object.fromEntries(world.tasks.map((t) => [t.task_id, t]));
  const rows = ids.map((t) => {
    const b = byTask[t] ?? { episodes: 0, passes: 0, rewards: [], toolCalls: [], cost: 0, infra: 0, failedConditions: {} };
    const passRate = b.episodes ? b.passes / b.episodes : null;
    return {
      taskId: t,
      practiceArea: practiceArea(taskMeta[t]),
      shape: shape(taskMeta[t]),
      anchor: anchor(taskMeta[t]),
      acceptanceLabel: taskMeta[t].acceptance_label ?? null,
      flaky: flaky.has(t),
      episodes: b.episodes,
      passes: b.passes,
      passRate,
      class: passRate === null ? "error" : passRate === 1 ? "pass" : passRate === 0 ? "fail" : "FLAKY",
      meanReward: b.rewards.length ? +(b.rewards.reduce((a, c) => a + c, 0) / b.rewards.length).toFixed(3) : null,
      avgToolCalls: b.toolCalls.length ? +(b.toolCalls.reduce((a, c) => a + c, 0) / b.toolCalls.length).toFixed(1) : null,
      failedConditions: b.failedConditions,
      costUsd: +b.cost.toFixed(4),
      infraErrors: b.infra,
      refusals: b.refusals ?? 0,
    };
  });

  const groupScore = (keyFn) => {
    const g = {};
    for (const r of rows) {
      if (r.passRate === null) continue;
      const k = keyFn(r);
      (g[k] ??= []).push(r);
    }
    return Object.fromEntries(Object.entries(g).map(([k, rs]) => [k, {
      tasks: rs.length,
      score: +(rs.reduce((a, r) => a + r.passRate, 0) / rs.length * 100).toFixed(1),
      meanReward: +(rs.reduce((a, r) => a + (r.meanReward ?? 0), 0) / rs.length * 100).toFixed(1),
    }]));
  };

  const measured = rows.filter((r) => r.passRate !== null);
  const flakyRows = measured.filter((r) => r.flaky);
  const spec = config.models[engine] ?? {};
  return {
    engine,
    label: spec.label ?? engine,
    model: spec.model ?? engine,
    measuredAt: new Date().toISOString(),
    runLabel: LABEL,
    episodeNamespace: EPISODE_NAMESPACE || null,
    worldVersion: world.version ?? null,
    worldFile: WORLD_FILE ?? config.blobfish.world,
    episodesPerTask: EPISODES,
    taskSet: TASKSET,
    tasksMeasured: measured.length,
    overall: {
      score: measured.length ? +(measured.reduce((a, r) => a + r.passRate, 0) / measured.length * 100).toFixed(1) : null,
      meanReward: measured.length ? +(measured.reduce((a, r) => a + (r.meanReward ?? 0), 0) / measured.length * 100).toFixed(1) : null,
      passAll: measured.filter((r) => r.passRate === 1).length,
      flakyCount: measured.filter((r) => r.class === "FLAKY").length,
      failAll: measured.filter((r) => r.passRate === 0).length,
      stability: measured.length ? +(measured.filter((r) => r.passRate === 1 || r.passRate === 0).length / measured.length * 100).toFixed(1) : null,
      flakySetScore: flakyRows.length ? +(flakyRows.reduce((a, r) => a + r.passRate, 0) / flakyRows.length * 100).toFixed(1) : null,
      flakySetPassAllRate: flakyRows.length ? +(flakyRows.filter((r) => r.passRate === 1).length / flakyRows.length * 100).toFixed(1) : null,
      totalCostUsd: +rows.reduce((a, r) => a + r.costUsd, 0).toFixed(2),
      avgToolCalls: measured.length ? +(measured.reduce((a, r) => a + (r.avgToolCalls ?? 0), 0) / measured.length).toFixed(1) : null,
      infraErrors: rows.reduce((a, r) => a + r.infraErrors, 0),
      refusals: rows.reduce((a, r) => a + r.refusals, 0),
    },
    byPracticeArea: groupScore((r) => r.practiceArea),
    byShape: groupScore((r) => r.shape),
    byAnchor: groupScore((r) => r.anchor),
    byAcceptanceLabel: groupScore((r) => r.acceptanceLabel ?? "unlabeled"),
    failedConditionTotals: rows.reduce((acc, r) => {
      for (const [c, n] of Object.entries(r.failedConditions)) acc[c] = (acc[c] ?? 0) + n;
      return acc;
    }, {}),
    tasks: rows,
  };
}

const ids = taskIds();
if (!ids.length) {
  console.error("task selection is empty");
  process.exit(1);
}
console.log(`Leaderboard '${LABEL}': engines=[${ENGINES.join(", ")}] tasks=${ids.length} (${TASKSET}) x ${EPISODES} episodes`);

if (CANARY_PROBE) {
  const canary = await runCanary(ids);
  const health = writeSweepHealth(
    ENGINES[0], ids, [], [canary],
    canary.ok ? { probe: true } : {
      probe: true,
      haltedBy: `oracle canary failed on ${canary.tid} — harness broken, sweep halted`,
    },
  );
  process.exit(health.canaries.failed ? 3 : 0);
}

for (const engine of ENGINES) {
  if (!config.models[engine]) { console.error(`Unknown engine '${engine}' — skipping`); continue; }
  console.log(`\n=== ${engine} ===`);
  let results, canaries;
  try {
    ({ results, canaries } = await measureEngine(engine, ids));
  } catch (e) {
    if (e instanceof CanaryFailure) { console.error(`✖ ${e.message}`); process.exit(3); }
    if (e instanceof SpendLimit) { console.error(`✖ ${e.message}`); process.exit(4); }
    throw e;
  }
  writeSweepHealth(engine, ids, results, canaries);
  const agg = aggregate(engine, ids, results);
  // An explicit --tasks list becomes the filename, and 54 ids blow past the
  // 255-byte limit (ENAMETOOLONG) AFTER every episode has been paid for — the
  // run is lost at the last step. Use the run label when the set is a long
  // explicit list, and keep the full list inside the file.
  const taskSetTag = (TASKSET === "scored") ? null
    : (TASKSET.length <= 40 ? TASKSET : (LABEL || `set-${TASKSET.split(",").length}tasks`));
  const setTag = LABEL_EXPLICIT
    ? [taskSetTag, LABEL].filter(Boolean).join("@")
    : taskSetTag;
  const outPath = join(RES_DIR, setTag ? `${engine}@${setTag}.json` : `${engine}.json`);
  writeFileSync(outPath, JSON.stringify(agg, null, 1));
  console.log(`${engine}: score ${agg.overall.score} | reward ${agg.overall.meanReward} | flaky-set ${agg.overall.flakySetScore} | $${agg.overall.totalCostUsd}`);
  console.log(`→ ${outPath}`);
}
