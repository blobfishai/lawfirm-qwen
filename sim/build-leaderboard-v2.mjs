#!/usr/bin/env node
/**
 * M7.3 — leaderboard v2. Rebuilds the reporting layer from episode JSONs alone
 * (no re-measurement), emitting the metrics the LAB-Superset plan calls for and
 * that LAB structurally cannot:
 *
 *   pass^k            reliability, not pass@1 (the RL/buyer question)
 *   by capability     the 10 §0B capability types, as a jagged-intelligence grid
 *   lane_split        file-passes-but-state-fails % — the deliverable-left-in-
 *                     chat failure LAB's file-only grading cannot see
 *   retrieval P/R     precision / recall / over-inclusion for type-4 (never
 *                     all-pass, which hides over-inclusion by construction)
 *   contamination     verbatim-LAB tasks reported in a SEPARATE column, never
 *                     mixed into the headline
 *   refusal / infra   classified out of the denominator, never graded as fail
 *
 * Every number traces to the episode files under data/leaderboard/episodes/.
 *
 * Usage:
 *   node sim/build-leaderboard-v2.mjs --engine deepseek-chat [--namespace run1]
 *        [--out data/leaderboard/results/<engine>.v2.json]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);

const ENGINE = opt("--engine", null);
if (!ENGINE) { console.error("--engine required"); process.exit(1); }
const NS = opt("--namespace", "");
const EP_DIR = join(ROOT, "data", "leaderboard", "episodes", ENGINE, NS);
const config = JSON.parse(readFileSync(join(ROOT, "config", "world.config.json"), "utf8"));

// Capability-type labels (plan §0B). Tasks carry capability_type 1..10.
const CAP = {
  1: "extraction", 2: "rule-application", 3: "computation",
  4: "retrieval", 5: "grounded-drafting", 6: "workflow",
  7: "abstention", 8: "robustness", 9: "multi-turn", 10: "long-horizon",
};

function loadEpisodes(dir) {
  if (!existsSync(dir)) { console.error(`no episodes at ${dir}`); process.exit(1); }
  const byTask = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith(".")) continue;
    let rec;
    try { rec = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
    const tid = rec.taskId ?? f.replace(/-t\d+\.json$/, "");
    (byTask[tid] ??= []).push(rec);
  }
  return byTask;
}

// pass^k = P(all k episodes pass); with n measured episodes and p passes, the
// unbiased estimate of pass^k is C(p,k)/C(n,k) — the leave-nothing-in estimator.
function passPowK(passes, n, k) {
  if (n < k) return null;
  let num = 1, den = 1;
  for (let i = 0; i < k; i++) { num *= (passes - i); den *= (n - i); }
  return den > 0 ? Math.max(0, num / den) : null;
}

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

function main() {
  const byTask = loadEpisodes(EP_DIR);
  const rows = [];
  for (const [tid, eps] of Object.entries(byTask)) {
    const measured = eps.filter((e) => !e.infraError && (e.toolCalls ?? 0) > 0 || e.passed);
    const graded = eps.filter((e) => !e.infraError);
    const n = graded.length;
    const passes = graded.filter((e) => e.passed).length;
    // lane split needs both sub-verdicts; only dual-lane tasks carry them.
    const laneSplit = graded.filter((e) => {
      const L = e.verdict?.lanes;
      return L && L.file?.passed === true && L.state?.passed === false;
    }).length;
    const prEps = graded.filter((e) => e.verdict?.precision != null);
    rows.push({
      taskId: tid,
      capabilityType: eps[0].capabilityType ?? null,
      capability: CAP[eps[0].capabilityType] ?? "unclassified",
      contaminated: !!eps[0].contamination,
      method: eps[0].method ?? null,
      n, passes,
      passRate: n ? passes / n : null,
      passSquared: passPowK(passes, n, 2),
      passCubed: passPowK(passes, n, 3),
      class: n === 0 ? "error" : passes === n ? "pass" : passes === 0 ? "fail" : "FLAKY",
      laneSplitEpisodes: laneSplit,
      precision: mean(prEps.map((e) => e.verdict.precision)),
      recall: mean(prEps.map((e) => e.verdict.recall)),
      fBeta: mean(prEps.map((e) => e.verdict.f_beta)),
    });
  }

  const measured = rows.filter((r) => r.passRate !== null);
  const clean = measured.filter((r) => !r.contaminated);
  const contaminated = measured.filter((r) => r.contaminated);

  const grid = (subset) => {
    const g = {};
    for (const r of subset) {
      const k = r.capability;
      (g[k] ??= []).push(r);
    }
    return Object.fromEntries(Object.entries(g).sort().map(([k, rs]) => [k, {
      tasks: rs.length,
      passRate: +(mean(rs.map((r) => r.passRate)) * 100).toFixed(1),
      passCubed: +(mean(rs.map((r) => r.passCubed ?? 0)) * 100).toFixed(1),
      flaky: rs.filter((r) => r.class === "FLAKY").length,
    }]));
  };

  const retrieval = measured.filter((r) => r.precision != null);
  const laneTotal = measured.reduce((a, r) => a + r.laneSplitEpisodes, 0);

  const report = {
    engine: ENGINE,
    label: config.models?.[ENGINE]?.label ?? ENGINE,
    namespace: NS || null,
    builtFrom: EP_DIR.replace(ROOT + "/", ""),
    tasksMeasured: measured.length,
    headline: {
      // CLEAN column only — contaminated tasks never touch the headline.
      passRate: +(mean(clean.map((r) => r.passRate)) * 100).toFixed(1),
      passCubed: +(mean(clean.map((r) => r.passCubed ?? 0)) * 100).toFixed(1),
      passAll: clean.filter((r) => r.passRate === 1).length,
      flaky: clean.filter((r) => r.class === "FLAKY").length,
      failAll: clean.filter((r) => r.passRate === 0).length,
    },
    contaminatedColumn: {
      note: "verbatim Harvey-LAB imports (public since 2026) — reported separately, never in the headline",
      tasks: contaminated.length,
      passRate: contaminated.length ? +(mean(contaminated.map((r) => r.passRate)) * 100).toFixed(1) : null,
      passCubed: contaminated.length ? +(mean(contaminated.map((r) => r.passCubed ?? 0)) * 100).toFixed(1) : null,
    },
    byCapabilityClean: grid(clean),
    retrieval: {
      tasks: retrieval.length,
      meanPrecision: retrieval.length ? +(mean(retrieval.map((r) => r.precision)) * 100).toFixed(1) : null,
      meanRecall: retrieval.length ? +(mean(retrieval.map((r) => r.recall)) * 100).toFixed(1) : null,
      note: "precision reported alongside recall so over-inclusion is visible (all-pass would hide it)",
    },
    laneSplit: {
      episodes: laneTotal,
      note: "file deliverable passed but the work never landed in a system of record — the failure mode LAB's file-only grading cannot see",
    },
    tasks: rows.sort((a, b) => (a.capabilityType ?? 99) - (b.capabilityType ?? 99)),
  };

  const outDir = join(ROOT, "data", "leaderboard", "results");
  mkdirSync(outDir, { recursive: true });
  const out = opt("--out", join(outDir, `${ENGINE}${NS ? "@" + NS : ""}.v2.json`));
  writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(`leaderboard-v2 [${ENGINE}]: headline pass^3 ${report.headline.passCubed} `
    + `over ${clean.length} clean tasks | ${contaminated.length} contaminated (separate) | `
    + `retrieval P/R ${report.retrieval.meanPrecision}/${report.retrieval.meanRecall} | `
    + `lane-split ${laneTotal} episodes`);
  console.log(`→ ${out}`);
}

main();
