#!/usr/bin/env node
/** Build the M7.3 evidence-first leaderboard from episode JSON records. */
import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { classifyEpisode } from "./lib/sweep-health.mjs";
import { listJsonRecordFiles, readJsonRecordFile } from "./lib/episode-record.mjs";
import { MEASUREMENT_PROTOCOL } from "./lib/measurement-protocol.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const ENGINE = opt("--engine", null);
if (!ENGINE) { console.error("--engine required"); process.exit(1); }
const NAMESPACE = opt("--namespace", "v19-triage");
const EXPECTED_TOOL_SCOPE = opt("--tool-scope", "systems");
const EXPECTED_PROTOCOL = opt("--protocol", MEASUREMENT_PROTOCOL.id);
const WORLD_PATH = resolve(ROOT, opt("--world", "world/blobfish/world-v19.json"));
const EPISODE_DIR = resolve(ROOT, opt(
  "--episodes", `data/leaderboard/episodes/${ENGINE}/${NAMESPACE}`,
));
const HARBOR_LANE_DIR = resolve(ROOT, opt(
  "--harbor-lanes", `data/leaderboard/harbor-lanes/${ENGINE}/${NAMESPACE}`,
));
const TRIAGE_PATH = resolve(ROOT, opt("--triage", "data/triage/world-v19.json"));
const OUT = resolve(ROOT, opt(
  "--out", `data/leaderboard/results/${ENGINE}@${NAMESPACE}.v2.json`,
));

const config = JSON.parse(readFileSync(join(ROOT, "config", "world.config.json"), "utf8"));
const worldRaw = JSON.parse(readFileSync(WORLD_PATH, "utf8"));
const world = worldRaw.world ?? worldRaw;
const taskById = Object.fromEntries(world.tasks.map((task) => [task.task_id, task]));
const triage = existsSync(TRIAGE_PATH) ? JSON.parse(readFileSync(TRIAGE_PATH, "utf8")) : null;

const CAPABILITY_NAMES = Object.fromEntries(
  Object.entries(world.task_taxonomy?.types ?? {
    1: "extraction_and_determination", 2: "rule_application", 3: "computation",
    4: "retrieval_and_review_at_scale", 5: "grounded_drafting_and_redlining",
    6: "workflow_execution", 7: "abstention_and_escalation",
    8: "operational_robustness", 9: "multi_turn_and_interruption",
    10: "long_horizon_composite_matters",
  }).map(([key, value]) => [Number(key), value]),
);

function mean(values) {
  const measured = values.filter((value) => Number.isFinite(value));
  return measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null;
}

function rounded(value, digits = 1) {
  return Number.isFinite(value) ? +value.toFixed(digits) : null;
}

function percent(values) {
  const value = mean(values);
  return value === null ? null : rounded(value * 100, 1);
}

function passPowK(passes, episodes, k) {
  if (episodes < k) return null;
  let numerator = 1;
  let denominator = 1;
  for (let index = 0; index < k; index++) {
    numerator *= passes - index;
    denominator *= episodes - index;
  }
  return denominator ? Math.max(0, numerator / denominator) : null;
}

function relativeSource(path) {
  const value = relative(ROOT, path);
  return value.startsWith("..") ? path : value;
}

function loadRecords(directory) {
  if (!existsSync(directory)) return { byTask: {}, digest: null, files: 0 };
  const byTask = {};
  const hash = createHash("sha256");
  let files = 0;
  for (const path of listJsonRecordFiles(directory)) {
    const filename = path.slice(directory.length + 1);
    const bytes = readFileSync(path);
    let record;
    try { record = readJsonRecordFile(path); } catch { continue; }
    if (!record.taskId) continue;
    hash.update(filename).update("\0").update(bytes).update("\0");
    record._source = relativeSource(path);
    (byTask[record.taskId] ??= []).push(record);
    files++;
  }
  return { byTask, digest: files ? hash.digest("hex") : null, files };
}

function lane(record) {
  const value = record.fileLane ?? record.harborLane ?? record.verdict?.lanes ?? null;
  if (!value) return null;
  const filePassed = value.file_passed ?? value.file?.passed;
  const statePassed = value.state_passed ?? value.state?.passed;
  if (typeof filePassed !== "boolean" || typeof statePassed !== "boolean") return null;
  return {
    filePassed,
    statePassed,
    split: value.lane_split ?? (filePassed !== statePassed),
  };
}

function verdictValue(record, snake, camel = snake) {
  return record.verdict?.[snake] ?? record.verdict?.[camel] ?? record[snake] ?? record[camel] ?? null;
}

const loaded = loadRecords(EPISODE_DIR);
const harborLoaded = loadRecords(HARBOR_LANE_DIR);
const unknownEpisodeTasks = Object.keys(loaded.byTask).filter((taskId) => !taskById[taskId]).sort();
const unknownHarborLaneTasks = Object.keys(harborLoaded.byTask)
  .filter((taskId) => !taskById[taskId]).sort();
const rows = [];
for (const task of [...world.tasks].sort((left, right) => left.task_id.localeCompare(right.task_id))) {
  const all = loaded.byTask[task.task_id] ?? [];
  const kinds = all.map((record) => classifyEpisode(record));
  const versionMismatches = all.filter((record) => record.worldVersion !== world.version).length;
  const scopeMismatches = all.filter((record) => record.toolScope?.mode !== EXPECTED_TOOL_SCOPE).length;
  const protocolMismatches = all.filter((record) => record.measurementProtocol !== EXPECTED_PROTOCOL).length;
  const eligible = all.filter((record, index) =>
    record.worldVersion === world.version
      && record.toolScope?.mode === EXPECTED_TOOL_SCOPE
      && record.measurementProtocol === EXPECTED_PROTOCOL
      && !["infra_error", "refusal", "not_measured"].includes(kinds[index]));
  const passes = eligible.filter((record) => record.passed === true).length;
  const n = eligible.length;
  const harborLaneRecords = (harborLoaded.byTask[task.task_id] ?? [])
    .filter((record) => record.worldVersion === world.version);
  const laneRows = [...eligible, ...harborLaneRecords].map(lane).filter(Boolean);
  const capabilityType = Number(task.capability_type);
  if (!CAPABILITY_NAMES[capabilityType]) {
    throw new Error(`task ${task.task_id} has no valid capability_type`);
  }
  const pagingRows = eligible.map((record) => verdictValue(record, "paging_complete", "pagingComplete"))
    .filter((value) => typeof value === "boolean");
  // Grounded drafting verifiers also expose criterion-level precision/recall.
  // The leaderboard's retrieval instrument must not silently mix that signal
  // with gold-set corpus retrieval, so only type-4 tasks enter this channel.
  const retrievalRows = capabilityType === 4
    ? eligible.filter((record) =>
      Number.isFinite(verdictValue(record, "precision"))
        && Number.isFinite(verdictValue(record, "recall")))
    : [];
  const passRate = n ? passes / n : null;
  rows.push({
    taskId: task.task_id,
    capabilityType,
    capability: CAPABILITY_NAMES[capabilityType],
    contaminated: Boolean(task.contamination),
    method: task.method ?? null,
    triage: triage?.labels?.[task.task_id]?.label ?? "unmeasured",
    episodeFiles: all.map((record) => record._source),
    laneEpisodeFiles: harborLaneRecords.map((record) => record._source),
    episodesFound: all.length,
    gradedEpisodes: n,
    passes,
    passRate,
    passSquared: passPowK(passes, n, 2),
    passCubed: passPowK(passes, n, 3),
    outcomeClass: n === 0 ? "unmeasured" : passes === n ? "pass" : passes === 0 ? "fail" : "FLAKY",
    exclusions: {
      infrastructure: kinds.filter((kind) => kind === "infra_error").length,
      refusal: kinds.filter((kind) => kind === "refusal").length,
      versionMismatch: versionMismatches,
      toolScopeMismatch: scopeMismatches,
      measurementProtocolMismatch: protocolMismatches,
    },
    zeroCallFailures: eligible.filter((record) =>
      (record.toolCalls ?? 0) === 0 && record.passed !== true).length,
    lane: {
      eligibleEpisodes: laneRows.length,
      splitEpisodes: laneRows.filter((value) => value.split).length,
      filePassStateFail: laneRows.filter((value) => value.filePassed && !value.statePassed).length,
    },
    paging: {
      eligibleEpisodes: pagingRows.length,
      completeEpisodes: pagingRows.filter(Boolean).length,
    },
    retrieval: {
      eligibleEpisodes: retrievalRows.length,
      precision: mean(retrievalRows.map((record) => verdictValue(record, "precision"))),
      recall: mean(retrievalRows.map((record) => verdictValue(record, "recall"))),
      fBeta: mean(retrievalRows.map((record) => verdictValue(record, "f_beta", "fBeta"))),
      overIncluded: retrievalRows.reduce((sum, record) => {
        const values = verdictValue(record, "over_included", "overIncluded");
        return sum + (Array.isArray(values) ? values.length : 0);
      }, 0),
    },
  });
}

const measured = rows.filter((row) => row.passRate !== null);
const clean = measured.filter((row) => !row.contaminated);
const contaminated = measured.filter((row) => row.contaminated);
const boundary = clean.filter((row) => row.triage === "boundary" && row.passCubed !== null);
const capability = {};
for (let type = 1; type <= 10; type++) {
  const defined = rows.filter((row) => row.capabilityType === type && !row.contaminated);
  const typeMeasured = defined.filter((row) => row.passRate !== null);
  const stable = typeMeasured.filter((row) => row.passCubed !== null);
  capability[String(type)] = {
    name: CAPABILITY_NAMES[type],
    tasksDefined: defined.length,
    tasksMeasured: typeMeasured.length,
    tasksWithThreeEpisodes: stable.length,
    passRate: percent(typeMeasured.map((row) => row.passRate)),
    passCubed: percent(stable.map((row) => row.passCubed)),
    flakyTasks: typeMeasured.filter((row) => row.outcomeClass === "FLAKY").length,
  };
}

const laneRows = rows.filter((row) => row.lane.eligibleEpisodes);
const retrievalRows = rows.filter((row) => row.retrieval.eligibleEpisodes);
const pagingRows = rows.filter((row) => row.paging.eligibleEpisodes);
const allEpisodeCount = rows.reduce((sum, row) => sum + row.episodesFound, 0);
const refusalCount = rows.reduce((sum, row) => sum + row.exclusions.refusal, 0);
const infrastructureCount = rows.reduce((sum, row) => sum + row.exclusions.infrastructure, 0);
const report = {
  schemaVersion: 2,
  engine: ENGINE,
  label: config.models?.[ENGINE]?.label ?? ENGINE,
  model: config.models?.[ENGINE]?.model ?? ENGINE,
  namespace: NAMESPACE || null,
  worldVersion: world.version,
  toolScope: EXPECTED_TOOL_SCOPE,
  measurementProtocol: EXPECTED_PROTOCOL,
  worldFile: relativeSource(WORLD_PATH),
  triageFile: relativeSource(TRIAGE_PATH),
  builtFrom: relativeSource(EPISODE_DIR),
  inputFiles: loaded.files,
  inputSha256: loaded.digest,
  harborLaneInput: {
    directory: relativeSource(HARBOR_LANE_DIR),
    files: harborLoaded.files,
    sha256: harborLoaded.digest,
    unknownTasks: unknownHarborLaneTasks,
  },
  unknownEpisodeTasks,
  coverage: {
    tasksDefined: rows.length,
    tasksMeasured: measured.length,
    tasksWithThreeEpisodes: rows.filter((row) => row.passCubed !== null).length,
    episodesFound: allEpisodeCount,
    refusalsExcluded: refusalCount,
    infrastructureExcluded: infrastructureCount,
    versionMismatchesExcluded: rows.reduce((sum, row) => sum + row.exclusions.versionMismatch, 0),
    toolScopeMismatchesExcluded: rows.reduce((sum, row) => sum + row.exclusions.toolScopeMismatch, 0),
    measurementProtocolMismatchesExcluded: rows.reduce((sum, row) => sum + row.exclusions.measurementProtocolMismatch, 0),
    zeroCallFailures: rows.reduce((sum, row) => sum + row.zeroCallFailures, 0),
  },
  headline: {
    population: "uncontaminated tasks labeled boundary by tools/triage_world.py",
    tasks: boundary.length,
    passCubed: percent(boundary.map((row) => row.passCubed)),
    passRate: percent(boundary.map((row) => row.passRate)),
    status: boundary.length ? "measured" : "awaiting-complete-triage",
  },
  contaminatedLab: {
    note: "Public verbatim Harvey-LAB imports are never mixed into the headline.",
    tasksMeasured: contaminated.length,
    tasksWithThreeEpisodes: contaminated.filter((row) => row.passCubed !== null).length,
    passRate: percent(contaminated.map((row) => row.passRate)),
    passCubed: percent(contaminated.filter((row) => row.passCubed !== null).map((row) => row.passCubed)),
  },
  byCapabilityClean: capability,
  laneSplit: {
    tasksWithLaneEvidence: laneRows.length,
    eligibleEpisodes: laneRows.reduce((sum, row) => sum + row.lane.eligibleEpisodes, 0),
    splitEpisodes: laneRows.reduce((sum, row) => sum + row.lane.splitEpisodes, 0),
    filePassStateFail: laneRows.reduce((sum, row) => sum + row.lane.filePassStateFail, 0),
    rate: percent(laneRows.flatMap((row) => Array(row.lane.eligibleEpisodes).fill(0)
      .map((_, index) => index < row.lane.splitEpisodes ? 1 : 0))),
  },
  pagingDiscipline: {
    tasksWithPagingEvidence: pagingRows.length,
    eligibleEpisodes: pagingRows.reduce((sum, row) => sum + row.paging.eligibleEpisodes, 0),
    completeEpisodes: pagingRows.reduce((sum, row) => sum + row.paging.completeEpisodes, 0),
    completeRate: percent(pagingRows.flatMap((row) => Array(row.paging.eligibleEpisodes).fill(0)
      .map((_, index) => index < row.paging.completeEpisodes ? 1 : 0))),
  },
  retrieval: {
    tasksWithEvidence: retrievalRows.length,
    meanPrecision: percent(retrievalRows.map((row) => row.retrieval.precision)),
    meanRecall: percent(retrievalRows.map((row) => row.retrieval.recall)),
    meanFBeta: percent(retrievalRows.map((row) => row.retrieval.fBeta)),
    overIncluded: retrievalRows.reduce((sum, row) => sum + row.retrieval.overIncluded, 0),
  },
  refusal: {
    episodes: refusalCount,
    rateOfObservedEpisodes: allEpisodeCount ? rounded(refusalCount / allEpisodeCount * 100, 1) : null,
    note: "Classified mechanically and excluded from graded-failure denominators.",
  },
  tasks: rows,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");
console.log(`leaderboard-v2 [${ENGINE}]: ${measured.length}/${rows.length} tasks measured; `
  + `boundary pass^3 ${report.headline.passCubed ?? "—"}; capabilities classified ${Object.keys(capability).length}/10; `
  + `lane ${report.laneSplit.eligibleEpisodes} eps; paging ${report.pagingDiscipline.eligibleEpisodes} eps; `
  + `retrieval P/R ${report.retrieval.meanPrecision ?? "—"}/${report.retrieval.meanRecall ?? "—"}`);
console.log(`→ ${OUT}`);
