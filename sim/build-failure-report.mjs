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
const OUT_MD = join(ROOT, "docs", "failure-reports");
const OUT_JSON = join(ROOT, "data", "leaderboard", "failure-modes");
mkdirSync(OUT_MD, { recursive: true });
mkdirSync(OUT_JSON, { recursive: true });

const engines = argv.includes("--all")
  ? readdirSync(RES_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  : [opt("--engine", null)].filter(Boolean);
if (!engines.length) { console.error("--engine <id> or --all required"); process.exit(1); }

// ---------------------------------------------------------------- taxonomy
const MODE_DESCRIPTIONS = {
  fabrication: "Fabricated determination — wrote an answer row the source materials do not support (hallucination-trap guard tripped)",
  wrong_value: "Wrong graded value — completed the workflow but a pinned field (extraction / computation / determination) was wrong",
  evidence_gap: "Evidence gap — wrote the deliverable without reading the required input documents in full (skipped or wrong documents)",
  workflow_shortcut: "Workflow shortcut — skipped required ordered checkpoints (e.g. drafted from search previews instead of full reads)",
  emission_collapse: "Tool-call emission collapse — repeated an identical (usually empty-argument) tool call in a loop, typically on the large-payload draft step",
  output_cap_truncation: "HARNESS ARTIFACT — the completion cap truncated a large tool call mid-JSON (parse error at ~max_tokens boundary); not a model failure. Episodes with this mode are re-run at a higher cap and should not appear in final results",
  friction_non_recovery: "Injected-friction non-recovery — a rate_limited / stale_reference error derailed the run and the step was never successfully retried",
  deliverable_in_chat: "Deliverable answered in chat — the model researched correctly, then wrote the work product into its final chat message instead of filing it with the required write tool (the record system never changed)",
  no_action: "No effective action — episode ended with no successful state change",
  turn_exhaustion: "Turn exhaustion — spent the entire turn budget without producing the final deliverable",
  off_task_damage: "Off-task damage — modified tables/rows outside the task's declared scope",
  api_error: "Provider/API failure — episode could not run to completion for infrastructure reasons",
  other: "Unclassified failure",
};

function classify(ep) {
  const failed = new Set(ep.failedConditions ?? []);
  const steps = ep.steps ?? [];
  const worldSteps = steps.filter((s) => s.tool !== "_final_answer");
  const okWrites = worldSteps.filter((s) => s.ok && /create|draft|update|save_|add_to_/.test(s.tool));

  const has = (pred) => [...failed].some(pred);

  // doom loop: >=3 consecutive same-tool failing calls with identical args
  let loop = false;
  for (let i = 0; i + 2 < worldSteps.length; i++) {
    const [a, b, c] = [worldSteps[i], worldSteps[i + 1], worldSteps[i + 2]];
    if (!a.ok && !b.ok && !c.ok &&
        a.tool === b.tool && b.tool === c.tool &&
        JSON.stringify(a.args) === JSON.stringify(b.args) &&
        JSON.stringify(b.args) === JSON.stringify(c.args)) { loop = true; break; }
  }
  const emptyDraftFails = worldSteps.filter(
    (s) => !s.ok && /missing \d+ required positional/.test(s.observation ?? "") ).length;

  const frictionHits = worldSteps.filter(
    (s) => !s.ok && /(rate_limited|stale_reference)/.test(s.observation ?? ""));
  const frictionUnrecovered = frictionHits.some((h) =>
    !worldSteps.some((s) => s.ok && s.tool === h.tool &&
      worldSteps.indexOf(s) > worldSteps.indexOf(h)));

  if (ep.infraError) return "api_error";
  const truncated = worldSteps.some((s) => s.argParseError &&
    /create|draft|update_/.test(s.tool) && (s.argBytes ?? 0) > 15000);
  if (truncated && (failed.has("state_changed") || has((c) => c.startsWith("rows_inserted"))))
    return "output_cap_truncation";
  if (has((c) => c.startsWith("no_new_"))) return "fabrication";
  if (has((c) => /_is_/.test(c) && !c.startsWith("no_new_"))) return "wrong_value";
  if (failed.has("required_documents_read")) return "evidence_gap";
  if (loop || emptyDraftFails >= 2) return "emission_collapse";
  if (failed.has("required_workflow_path") || failed.has("no_shortcut_direct_update") ||
      failed.has("reads_before_writes")) {
    return okWrites.length ? "workflow_shortcut" : (loop ? "emission_collapse" : "workflow_shortcut");
  }
  if (has((c) => c === "no_offtask_table_changes" || c === "no_rows_destroyed" ||
      c === "no_undeclared_rows_created")) return "off_task_damage";
  if (failed.has("state_changed")) {
    if (frictionUnrecovered) return "friction_non_recovery";
    const finalStep = steps.find((s) => s.tool === "_final_answer");
    const attemptedWrites = worldSteps.filter((s) => /create|draft|update|save_|add_to_/.test(s.tool));
    const successfulReads = worldSteps.filter((s) => s.ok && /^(query_|read_|search_)|_list$|_get$/.test(s.tool));
    if (finalStep && !attemptedWrites.length && successfulReads.length &&
        (finalStep.observation ?? "").length > 200) return "deliverable_in_chat";
    if ((ep.turnsUsed ?? 0) >= (ep.maxTurns ?? 50)) return "turn_exhaustion";
    return "no_action";
  }
  if (frictionUnrecovered) return "friction_non_recovery";
  if ((ep.turnsUsed ?? 0) >= (ep.maxTurns ?? 50)) return "turn_exhaustion";
  return "other";
}

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
  console.log(`${engine}: ${failures.length}/${episodes.length} failures → ${Object.keys(byMode).length} modes → docs/failure-reports/${engine}.md`);
}

// cross-model gap matrix
if (Object.keys(allSummaries).length > 1) {
  writeFileSync(join(OUT_JSON, "_cross-model.json"), JSON.stringify(allSummaries, null, 1));
}
