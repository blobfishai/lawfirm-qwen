#!/usr/bin/env node
/**
 * Failure-mode report generator: classifies every failing episode of a
 * measured engine into the world's failure-mode taxonomy and writes a
 * per-model report plus a machine-readable gap summary.
 *
 * Usage:
 *   node sim/build-failure-report.mjs --engine deepseek-chat
 *   node sim/build-failure-report.mjs --all
 *
 * Reads:  data/leaderboard/episodes/<engine>/<task>-t<n>.json (step traces)
 *         data/leaderboard/results/<engine>.json              (aggregates)
 * Writes: docs/failure-reports/<engine>.md
 *         data/leaderboard/failure-modes/<engine>.json
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);

const EP_DIR = join(ROOT, "data", "leaderboard", "episodes");
const RES_DIR = join(ROOT, "data", "leaderboard", "results");
const OUT_MD = join(ROOT, "reports");
const OUT_JSON = join(ROOT, "data", "leaderboard", "failure-modes");
mkdirSync(OUT_MD, { recursive: true });
mkdirSync(OUT_JSON, { recursive: true });

const engines = argv.includes("--all")
  ? readdirSync(RES_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  : [opt("--engine", null)].filter(Boolean);
if (!engines.length) { console.error("--engine <id> or --all required"); process.exit(1); }

import { classify, MODE_DESCRIPTIONS } from "./lib/classify-failure.mjs";

function excerpt(ep, n = 6) {
  return (ep.steps ?? []).slice(-n).map((s) =>
    `    ${s.tool}(${JSON.stringify(s.args ?? {}).slice(0, 90)}) -> ${s.ok ? "ok" : "ERR"}` +
    (s.ok ? "" : ` [${(s.observation ?? "").slice(0, 90).replace(/\n/g, " ")}]`)
  ).join("\n");
}

// ---------------------------------------------------------------- per engine
const allSummaries = {};
for (const engine of engines) {
  const resPath = join(RES_DIR, `${engine}.json`);
  if (!existsSync(resPath)) { console.error(`no results for ${engine}`); continue; }
  const agg = JSON.parse(readFileSync(resPath, "utf8"));
  const epDir = join(EP_DIR, engine);
  const files = existsSync(epDir) ? readdirSync(epDir).filter((f) => f.endsWith(".json")) : [];

  const episodes = files.map((f) => {
    try { return JSON.parse(readFileSync(join(epDir, f), "utf8")); }
    catch { return null; }
  }).filter(Boolean);

  const failures = episodes.filter((e) => !e.passed);
  const byMode = {};
  for (const ep of failures) {
    const mode = classify(ep);
    (byMode[mode] ??= []).push(ep);
  }

  const taskMeta = Object.fromEntries((agg.tasks ?? []).map((t) => [t.taskId, t]));
  const modeRows = Object.entries(byMode)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([mode, eps]) => ({
      mode,
      episodes: eps.length,
      shareOfFailures: +(eps.length / failures.length * 100).toFixed(1),
      tasks: [...new Set(eps.map((e) => e.taskId))],
      exemplar: eps[0] ? { taskId: eps[0].taskId, excerpt: excerpt(eps[0]) } : null,
    }));

  // gap table: worst practice areas and shapes
  const worst = (dim) => Object.entries(agg[dim] ?? {})
    .sort((a, b) => a[1].score - b[1].score)
    .slice(0, 5)
    .map(([k, v]) => ({ key: k, score: v.score, tasks: v.tasks }));

  const summary = {
    engine,
    label: agg.label,
    overallScore: agg.overall?.score,
    meanReward: agg.overall?.meanReward,
    flakySetScore: agg.overall?.flakySetScore,
    episodes: episodes.length,
    failures: failures.length,
    modes: modeRows.map(({ exemplar, ...r }) => r),
    worstPracticeAreas: worst("byPracticeArea"),
    worstShapes: worst("byShape"),
  };
  allSummaries[engine] = summary;
  writeFileSync(join(OUT_JSON, `${engine}.json`), JSON.stringify({ ...summary, modeDetails: modeRows }, null, 1));

  // ------------------------------------------------------------- markdown
  const md = [];
  md.push(`# Failure Report — ${agg.label} (\`${agg.model}\`)`);
  md.push("");
  md.push(`Measured on the lawfirm-qwen world (local runtime, seeded + deterministic verifiers), ` +
    `${agg.episodesPerTask} episodes/task over ${agg.tasksMeasured} tasks (task set: ${agg.taskSet}).`);
  md.push("");
  md.push(`| | |`);
  md.push(`|---|---|`);
  md.push(`| Overall score (mean per-task pass rate) | **${agg.overall.score}** |`);
  md.push(`| Mean reward (partial credit) | ${agg.overall.meanReward} |`);
  md.push(`| Tasks passed 3/3 | ${agg.overall.passAll}/${agg.tasksMeasured} |`);
  md.push(`| Tasks flaky (mixed outcomes) | ${agg.overall.flakyCount} |`);
  md.push(`| Tasks failed 3/3 | ${agg.overall.failAll} |`);
  md.push(`| Flaky-21 boundary set score | ${agg.overall.flakySetScore ?? "n/a"} |`);
  md.push(`| Avg tool calls / episode | ${agg.overall.avgToolCalls} |`);
  md.push(`| Measurement cost | $${agg.overall.totalCostUsd} |`);
  md.push("");
  md.push(`## Failure modes (${failures.length} failing episodes of ${episodes.length})`);
  md.push("");
  for (const row of modeRows) {
    md.push(`### ${row.mode} — ${row.episodes} episodes (${row.shareOfFailures}% of failures)`);
    md.push("");
    md.push(MODE_DESCRIPTIONS[row.mode] ?? "");
    md.push("");
    md.push(`Tasks: ${row.tasks.slice(0, 12).join(", ")}${row.tasks.length > 12 ? ` (+${row.tasks.length - 12} more)` : ""}`);
    if (row.exemplar) {
      md.push("");
      md.push(`Exemplar (${row.exemplar.taskId}, final steps):`);
      md.push("```");
      md.push(row.exemplar.excerpt);
      md.push("```");
    }
    md.push("");
  }
  md.push(`## Where this model is weakest`);
  md.push("");
  md.push(`| Practice area | Score | Tasks |`);
  md.push(`|---|---|---|`);
  for (const w of summary.worstPracticeAreas) md.push(`| ${w.key} | ${w.score} | ${w.tasks} |`);
  md.push("");
  md.push(`| Task shape | Score | Tasks |`);
  md.push(`|---|---|---|`);
  for (const w of summary.worstShapes) md.push(`| ${w.key} | ${w.score} | ${w.tasks} |`);
  md.push("");
  md.push(`## Verifier-condition failure totals`);
  md.push("");
  md.push("```json");
  md.push(JSON.stringify(agg.failedConditionTotals, null, 1));
  md.push("```");
  md.push("");
  md.push(`*Generated by \`sim/build-failure-report.mjs\` from ${episodes.length} episode traces under \`data/leaderboard/episodes/${engine}/\`.*`);
  writeFileSync(join(OUT_MD, `${engine}.md`), md.join("\n"));
  console.log(`${engine}: ${failures.length}/${episodes.length} failures → ${Object.keys(byMode).length} modes → reports/${engine}.md`);
}

// cross-model gap matrix
if (Object.keys(allSummaries).length > 1) {
  writeFileSync(join(OUT_JSON, "_cross-model.json"), JSON.stringify(allSummaries, null, 1));
}
