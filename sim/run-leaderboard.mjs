#!/usr/bin/env node
/**
 * Leaderboard runner: measures one or more engines across the world's tasks
 * (N episodes each), writes per-episode records + per-engine aggregates.
 *
 * Usage:
 *   node sim/run-leaderboard.mjs --engines deepseek-chat,claude-haiku-4-5
 *        [--tasks scored|all|flaky|boundary|task_001,task_002]
 *        [--episodes 3] [--concurrency 6] [--label run1]
 *        [--episode-namespace run1]
 *
 * Task sets:
 *   scored    all tasks minus config.scoring.quarantinedTasks (default)
 *   flaky     config.flake.provenFlakyTasks (the 21 boundary tasks)
 *   boundary  flaky + too_hard + in_band acceptance labels
 *   all       every task
 *
 * Outputs:
 *   data/leaderboard/episodes/<engine>/<task>-t<n>.json  (full step traces)
 *   data/leaderboard/results/<engine>.json               (aggregate)
 *
 * The world server must be running: npm run world:serve
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
const AGG_ONLY = argv.includes("--aggregate-only"); // no API calls: aggregate existing episode files
const WORLD_FILE = opt("--world-file", null);      // e.g. world/blobfish/world-expanded.json
const LOCAL_BASE = opt("--local-base", null);      // e.g. http://127.0.0.1:8972
const MCP_MODE = opt("--mcp", "bridge");           // bridge | multi (per-system MCP servers)
const EPISODE_NAMESPACE = opt(
  "--episode-namespace", LABEL_EXPLICIT ? LABEL : "",
);

if (EPISODE_NAMESPACE && !/^[A-Za-z0-9._-]+$/.test(EPISODE_NAMESPACE)) {
  console.error("--episode-namespace must contain only letters, digits, dot, underscore, or hyphen");
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
  if ((RESUME || AGG_ONLY) && existsSync(out)) {
    try { return Promise.resolve({ cached: true, ...JSON.parse(readFileSync(out, "utf8")) }); }
    catch { /* rerun */ }
  }
  if (AGG_ONLY) return Promise.resolve({ taskId, notMeasured: true });
  rmSync(out, { force: true });
  return new Promise((resolve) => {
    const child = spawn("node", [
      "sim/run-simulation.mjs", "--task", taskId, "--engine", engine,
      "--episode-out", out, "--mcp", MCP_MODE,
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
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, 12 * 60 * 1000);
    child.on("exit", () => {
      clearTimeout(timer);
      let rec = null;
      try { rec = JSON.parse(readFileSync(out, "utf8")); } catch { /* infra */ }
      resolve(rec ?? { taskId, engine, infraError: true });
    });
  });
}

async function measureEngine(engine, ids) {
  const jobs = [];
  for (const t of ids) for (let ep = 1; ep <= EPISODES; ep++) jobs.push({ t, ep });
  const results = [];
  let idx = 0, done = 0;
  async function worker(wid) {
    await new Promise((r) => setTimeout(r, wid * 1200));
    while (idx < jobs.length) {
      const { t, ep } = jobs[idx++];
      let r = await runEpisode(engine, t, ep);
      if (r.infraError) r = await runEpisode(engine, t, ep); // one infra retry
      results.push({ ...r, taskId: r.taskId ?? t, episode: ep });
      done++;
      if (done % 10 === 0 || done === jobs.length) {
        const p = results.filter((x) => x.passed).length;
        const cost = results.reduce((a, x) => a + (x.costUsd ?? 0), 0);
        console.log(`[${engine}] ${done}/${jobs.length} episodes | pass ${p}/${results.filter((x) => !x.infraError).length} | $${cost.toFixed(2)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  return results;
}

function aggregate(engine, ids, results) {
  const byTask = {};
  for (const r of results) {
    const b = (byTask[r.taskId] ??= { episodes: 0, passes: 0, rewards: [], toolCalls: [], cost: 0, infra: 0, failedConditions: {} });
    if (r.notMeasured) continue;
    if (r.infraError) { b.infra++; continue; }
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
      score: +(measured.reduce((a, r) => a + r.passRate, 0) / measured.length * 100).toFixed(1),
      meanReward: +(measured.reduce((a, r) => a + (r.meanReward ?? 0), 0) / measured.length * 100).toFixed(1),
      passAll: measured.filter((r) => r.passRate === 1).length,
      flakyCount: measured.filter((r) => r.class === "FLAKY").length,
      failAll: measured.filter((r) => r.passRate === 0).length,
      stability: measured.length ? +(measured.filter((r) => r.passRate === 1 || r.passRate === 0).length / measured.length * 100).toFixed(1) : null,
      flakySetScore: flakyRows.length ? +(flakyRows.reduce((a, r) => a + r.passRate, 0) / flakyRows.length * 100).toFixed(1) : null,
      flakySetPassAllRate: flakyRows.length ? +(flakyRows.filter((r) => r.passRate === 1).length / flakyRows.length * 100).toFixed(1) : null,
      totalCostUsd: +rows.reduce((a, r) => a + r.costUsd, 0).toFixed(2),
      avgToolCalls: +(measured.reduce((a, r) => a + (r.avgToolCalls ?? 0), 0) / measured.length).toFixed(1),
      infraErrors: rows.reduce((a, r) => a + r.infraErrors, 0),
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
console.log(`Leaderboard '${LABEL}': engines=[${ENGINES.join(", ")}] tasks=${ids.length} (${TASKSET}) x ${EPISODES} episodes`);

for (const engine of ENGINES) {
  if (!config.models[engine]) { console.error(`Unknown engine '${engine}' — skipping`); continue; }
  console.log(`\n=== ${engine} ===`);
  const results = await measureEngine(engine, ids);
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
