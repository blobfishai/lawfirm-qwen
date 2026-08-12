#!/usr/bin/env node
/** Normalize Harbor file/state verdicts into a separate leaderboard lane feed.
 *
 * Harbor trials are not simulation episodes: importing them into the main
 * episode directory would corrupt pass^k and triage denominators.  This tool
 * therefore writes a distinct evidence feed consumed only by lane metrics.
 */
import {
  readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, fallback = null) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const JOB = opt("--job");
const ENGINE = opt("--engine");
const NAMESPACE = opt("--namespace", "v19-triage");
const WORLD_PATH = resolve(ROOT, opt("--world", "world/blobfish/world-v19.json"));
const EPISODE = Number(opt("--episode", "1"));
const ALLOW_FIXTURE = argv.includes("--allow-fixture");
const OUT_DIR = resolve(ROOT, opt(
  "--out", `data/leaderboard/harbor-lanes/${ENGINE ?? "unknown"}/${NAMESPACE}`,
));

if (!JOB || !ENGINE) {
  console.error("--job and --engine are required");
  process.exit(1);
}
if (!Number.isInteger(EPISODE) || EPISODE < 1) {
  console.error("--episode must be a positive integer");
  process.exit(1);
}

const job = resolve(ROOT, JOB);
const rawWorld = JSON.parse(readFileSync(WORLD_PATH, "utf8"));
const world = rawWorld.world ?? rawWorld;
const taskById = Object.fromEntries(world.tasks.map((task) => [task.task_id, task]));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function maybeJson(path) {
  return existsSync(path) ? readJson(path) : null;
}

function taskId(result) {
  const taskPath = result.task_id?.path;
  return taskPath ? taskPath.split("/").filter(Boolean).at(-1)
    : String(result.trial_name ?? "").split("__", 1)[0];
}

function numericBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return null;
}

function durationMs(result) {
  const start = Date.parse(result.started_at ?? "");
  const finish = Date.parse(result.finished_at ?? "");
  return Number.isFinite(start) && Number.isFinite(finish) ? finish - start : null;
}

const trials = readdirSync(job, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(job, entry.name, "result.json")))
  .map((entry) => join(job, entry.name))
  .sort();
if (!trials.length) {
  console.error(`no Harbor trial result directories under ${job}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const written = [];
for (const trial of trials) {
  const result = readJson(join(trial, "result.json"));
  if (result.exception_info != null) throw new Error(`${result.trial_name}: ${result.exception_info}`);
  const agent = result.agent_info?.name ?? result.config?.agent?.name ?? "unknown";
  if (!ALLOW_FIXTURE && ["oracle", "nop"].includes(agent)) {
    throw new Error(`${result.trial_name}: refusing to publish ${agent} as model lane evidence`);
  }
  const id = taskId(result);
  const task = taskById[id];
  if (!task) throw new Error(`${result.trial_name}: task ${id} absent from ${WORLD_PATH}`);
  const rewards = result.verifier_result?.rewards ?? {};
  const lane = maybeJson(join(trial, "verifier", "file-lane.json"));
  const verdict = maybeJson(join(trial, "verifier", "verdict.json"));
  if (!lane || typeof lane.file_passed !== "boolean" || typeof lane.state_passed !== "boolean") {
    throw new Error(`${result.trial_name}: missing boolean file/state lane verdict`);
  }
  const record = {
    schemaVersion: 1,
    evidenceKind: "harbor_file_state_lane",
    taskId: id,
    engine: ENGINE,
    model: result.agent_info?.model_info?.name ?? result.config?.agent?.model_name ?? ENGINE,
    worldVersion: world.version,
    worldFile: opt("--world", "world/blobfish/world-v19.json"),
    passed: numericBoolean(rewards.passed) ?? verdict?.passed ?? false,
    reward: rewards.reward ?? verdict?.reward ?? 0,
    fileLane: lane,
    verdict: verdict ? {
      precision: verdict.precision ?? null,
      recall: verdict.recall ?? null,
      f_beta: verdict.f_beta ?? null,
      over_included: verdict.over_included ?? null,
      grounding_fraction: verdict.raw_grounding_fraction ?? null,
    } : null,
    contamination: task.contamination ?? null,
    capabilityType: task.capability_type ?? null,
    harbor: {
      agent,
      trialName: result.trial_name,
      taskChecksum: result.task_checksum ?? null,
      sourceJob: JOB,
    },
    costUsd: result.agent_result?.cost_usd ?? null,
    durationMs: durationMs(result),
    finishedAt: result.finished_at ?? null,
  };
  const out = join(OUT_DIR, `${id}-h${EPISODE}.json`);
  if (existsSync(out) && readFileSync(out, "utf8") !== JSON.stringify(record, null, 2) + "\n") {
    throw new Error(`${out} already exists with different evidence; choose another --episode`);
  }
  writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
  written.push(out);
}

console.log(`imported ${written.length} Harbor lane verdict(s) into ${OUT_DIR}`);
