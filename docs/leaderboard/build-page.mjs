#!/usr/bin/env node
/**
 * Leaderboard page builder — renders docs/leaderboard/index.html from
 * data/leaderboard/results/*.json + data/leaderboard/failure-modes/*.json.
 *
 * Modeled on artificialanalysis.ai/evaluations/harvey-lab-aa (see
 * data/research/aa-leaderboard-reference.md) but for the lawfirm-qwen world:
 * deterministic verifier scores, N-episode stability, failure-mode shares,
 * boundary-set performance, and honest methodology.
 *
 * Usage: node docs/leaderboard/build-page.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RES_DIR = join(ROOT, "data", "leaderboard", "results");
const FM_DIR = join(ROOT, "data", "leaderboard", "failure-modes");
const OUT = join(ROOT, "docs", "leaderboard", "index.html");

const config = JSON.parse(readFileSync(join(ROOT, "config", "world.config.json"), "utf8"));
const worldRaw = JSON.parse(readFileSync(join(ROOT, config.blobfish.world), "utf8"));
const world = worldRaw.world ?? worldRaw;
const expandedPath = join(ROOT, "world", "blobfish", "world-expanded.json");
const expansion = existsSync(expandedPath)
  ? (JSON.parse(readFileSync(expandedPath, "utf8")).world ?? JSON.parse(readFileSync(expandedPath, "utf8"))).expansion_report
  : null;

const allResults = readdirSync(RES_DIR).filter((f) => f.endsWith(".json")).map((f) =>
  JSON.parse(readFileSync(join(RES_DIR, f), "utf8"))
);
const results = allResults.filter((r) => r.taskSet === "scored")
  .sort((a, b) => b.overall.score - a.overall.score);
const boundaryOnly = allResults.filter((r) => r.taskSet === "boundary")
  .sort((a, b) => b.overall.score - a.overall.score);
const expansionResults = allResults.filter((r) => r.taskSet === "expansion")
  .sort((a, b) => b.overall.score - a.overall.score);

const modes = {};
for (const r of results) {
  const p = join(FM_DIR, `${r.engine}.json`);
  if (existsSync(p)) modes[r.engine] = JSON.parse(readFileSync(p, "utf8"));
}

// series colors follow the entity (engine), fixed order by first-seen rank
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
const MODE_ORDER = [
  "deliverable_in_chat", "emission_collapse", "workflow_shortcut", "wrong_value",
  "evidence_gap", "fabrication", "friction_non_recovery", "no_action",
  "turn_exhaustion", "off_task_damage", "api_error", "other",
];
const MODE_LABELS = {
  deliverable_in_chat: "Deliverable left in chat",
  emission_collapse: "Emission collapse (doom loop)",
  workflow_shortcut: "Workflow shortcut",
  wrong_value: "Wrong graded value",
  evidence_gap: "Evidence gap",
  fabrication: "Fabricated determination",
  friction_non_recovery: "Friction non-recovery",
  no_action: "No effective action",
  turn_exhaustion: "Turn exhaustion",
  off_task_damage: "Off-task damage",
  api_error: "Provider/API failure",
  other: "Other",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);

// engine → assigned series index (stable by sorted rank at build time; extra
// task-set rows inherit their engine's color)
const seriesIdx = {};
let nextSeries = 0;
for (const r of [...results, ...boundaryOnly, ...expansionResults]) {
  if (!(r.engine in seriesIdx)) seriesIdx[r.engine] = Math.min(nextSeries++, SERIES_LIGHT.length - 1);
}

// ------------------------------------------------------------------ sections
function leaderboardRows(metric, max) {
  return results.map((r) => {
    const v = metric(r);
    const w = max > 0 ? Math.max(1.2, (v / max) * 100) : 0;
    const i = seriesIdx[r.engine];
    return `
      <div class="lb-row">
        <div class="lb-name"><span class="dot s${i}"></span>${esc(r.label)}<span class="lb-model">${esc(r.model)} · ${r.tasksMeasured} tasks · ${r.episodesPerTask} eps</span></div>
        <div class="lb-track"><div class="lb-bar s${i}" style="width:${w}%"></div><span class="lb-val">${v}</span></div>
      </div>`;
  }).join("");
}

function modeStacks() {
  return results.map((r) => {
    const m = modes[r.engine];
    if (!m || !m.modes?.length) return "";
    const total = m.modes.reduce((a, x) => a + x.episodes, 0);
    const segs = MODE_ORDER.filter((k) => m.modes.some((x) => x.mode === k)).map((k, ci) => {
      const row = m.modes.find((x) => x.mode === k);
      const share = (row.episodes / total) * 100;
      return `<div class="seg" style="width:${share}%" data-mode="${k}" title="${esc(MODE_LABELS[k] ?? k)}: ${row.episodes} episodes (${row.shareOfFailures}% of failures)"></div>`;
    }).join("");
    const legend = m.modes.slice(0, 4).map((x) =>
      `<span class="mode-chip" data-mode="${x.mode}">${esc(MODE_LABELS[x.mode] ?? x.mode)} ${x.shareOfFailures}%</span>`).join("");
    return `
      <div class="fm-row">
        <div class="fm-head"><span class="dot s${seriesIdx[r.engine]}"></span><strong>${esc(r.label)}</strong>
          <span class="fm-n">${m.failures} failing episodes of ${m.episodes}</span></div>
        <div class="fm-stack">${segs}</div>
        <div class="fm-legend">${legend}</div>
      </div>`;
  }).join("");
}

function familyHeat() {
  const areas = [...new Set(results.flatMap((r) => Object.keys(r.byPracticeArea ?? {})))]
    .sort((a, b) => (results[0]?.byPracticeArea?.[a]?.tasks ?? 0) < (results[0]?.byPracticeArea?.[b]?.tasks ?? 0) ? 1 : -1);
  const shapes = [...new Set(results.flatMap((r) => Object.keys(r.byShape ?? {})))];
  const heatCell = (v) => {
    if (v === undefined || v === null) return `<td class="heat none">—</td>`;
    // sequential: one hue, light→dark via opacity steps on series-1 blue
    const a = 0.08 + (v / 100) * 0.55;
    return `<td class="heat" style="--ha:${a.toFixed(2)}">${v}</td>`;
  };
  const table = (dims, key) => `
    <div class="table-scroll"><table class="heat-table">
      <thead><tr><th>${key === "byShape" ? "Task shape" : "Practice area / family"}</th>
        ${results.map((r) => `<th><span class="dot s${seriesIdx[r.engine]}"></span>${esc(r.label.split(" (")[0])}</th>`).join("")}
        <th class="mut">tasks</th></tr></thead>
      <tbody>${dims.map((d) => `<tr><th>${esc(d)}</th>
        ${results.map((r) => heatCell(r[key]?.[d]?.score)).join("")}
        <td class="mut">${results[0]?.[key]?.[d]?.tasks ?? results.find((r) => r[key]?.[d])?.[key]?.[d]?.tasks ?? ""}</td></tr>`).join("")}
      </tbody></table></div>`;
  return table(shapes, "byShape") + table(areas, "byPracticeArea");
}

function boundaryTable() {
  const row = (r, note) => `
    <tr><th><span class="dot s${seriesIdx[r.engine]}"></span>${esc(r.label)}${note ? ` <span class="mut">(${note})</span>` : ""}</th>
      <td>${pct(r.overall.flakySetScore)}</td>
      <td>${pct(r.overall.flakySetPassAllRate)}</td>
      <td>${r.overall.flakyCount}</td>
      <td>${pct(r.overall.stability)}</td></tr>`;
  const rows = results.map((r) => row(r)) .join("") +
    boundaryOnly.map((r) => row(r, `boundary subset only, ${r.tasksMeasured} tasks`)).join("");
  return `<div class="table-scroll"><table class="data-table">
    <thead><tr><th>Model</th><th>Flaky-21 score</th><th>Flaky-21 pass 3/3</th><th># tasks flaky for this model</th><th>Outcome stability</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function expansionSection() {
  if (!expansionResults.length) return "";
  const fams = [...new Set(expansionResults.flatMap((r) => Object.keys(r.byPracticeArea ?? {})))];
  const heatCell = (v) => {
    if (v === undefined || v === null) return `<td class="heat none">—</td>`;
    const a = 0.08 + (v / 100) * 0.55;
    return `<td class="heat" style="--ha:${a.toFixed(2)}">${v}</td>`;
  };
  const table = `<div class="table-scroll"><table class="heat-table">
    <thead><tr><th>Eval-anchored family</th>
      ${expansionResults.map((r) => `<th><span class="dot s${seriesIdx[r.engine]}"></span>${esc(r.label.split(" (")[0])}</th>`).join("")}
      <th class="mut">tasks</th></tr></thead>
    <tbody>${fams.map((d) => `<tr><th>${esc(d)}</th>
      ${expansionResults.map((r) => heatCell(r.byPracticeArea?.[d]?.score)).join("")}
      <td class="mut">${expansionResults.find((r) => r.byPracticeArea?.[d])?.byPracticeArea?.[d]?.tasks ?? ""}</td></tr>`).join("")}
    </tbody></table></div>`;
  return `
  <h2>Eval-anchored expansion families</h2>
  <p class="note">The 59 expansion tasks port the answer keys of the deterministic legal benchmarks
  into the executable world: CUAD-style clause identification, MAUD/SPA deal-point extraction
  (exact numbers pinned), LegalBench rule application, discovery retrieval with required reads,
  hallucination traps (abstention is the only passing behavior), and multi-step damages
  computation. Scores are per-family mean task pass rates.</p>
  ${table}`;
}

function fullTable() {
  const rows = results.map((r) => `
    <tr><th><span class="dot s${seriesIdx[r.engine]}"></span>${esc(r.label)}</th>
      <td><strong>${r.overall.score}</strong></td>
      <td>${((r.overall.passAll / r.tasksMeasured) * 100).toFixed(1)}</td>
      <td>${r.overall.meanReward}</td>
      <td>${pct(r.overall.flakySetScore)}</td>
      <td>${r.overall.avgToolCalls}</td>
      <td>$${(r.overall.totalCostUsd / Math.max(1, r.tasksMeasured * r.episodesPerTask)).toFixed(3)}</td>
      <td>$${r.overall.totalCostUsd}</td>
      <td>${r.overall.infraErrors}</td></tr>`).join("");
  return `<div class="table-scroll"><table class="data-table">
    <thead><tr><th>Model</th><th>Score</th><th>Pass^3 rate</th><th>Mean reward</th><th>Flaky-21</th><th>Avg tool calls</th><th>$/episode</th><th>$ total</th><th>Infra errors</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

const AA_CONTEXT = [
  ["Kimi K3 (max)", "94.6", "26.7"],
  ["Claude Fable 5 (max)", "93.6", "14.2"],
  ["Muse Spark 1.1 (xhigh)", "93.1", "8.3"],
  ["Grok 4.5 (high)", "92.4", "13.3"],
  ["Claude Opus 4.8 (max)", "91.1", "7.5"],
  ["…", "", ""],
  ["DeepSeek V4 Flash (Reasoning)", "81.3", "1.7"],
  ["Claude 4.5 Haiku (Reasoning)", "61.1", "0.0"],
  ["gpt-oss-120b (high)", "13.9", "0.0"],
];

const totalDocs = world.tables.find((t) => t.name === "matter_documents").sample_rows.length +
  (expansion?.documents_added ?? 0);
const totalTasks = world.tasks.length + (expansion?.tasks_added ?? 0);
const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

const html = `<title>lawfirm-qwen — Legal Agent Leaderboard</title>
<style>
  :root {
    --paper: #f9f9f7; --card: #ffffff; --ink: #1c2128; --ink-2: #57606d;
    --mut: #8a919c; --line: #e4e5e1; --accent: #33415e;
    --s0: #2a78d6; --s1: #eb6834; --s2: #1baf7a; --s3: #eda100; --s4: #e87ba4;
    --heat-h: 42, 120, 214;
    --good: #008300; --warn: #eda100; --crit: #e34948;
    --m-deliverable_in_chat: #2a78d6; --m-emission_collapse: #e34948;
    --m-workflow_shortcut: #eda100; --m-wrong_value: #eb6834;
    --m-evidence_gap: #1baf7a; --m-fabrication: #8f2f8b;
    --m-friction_non_recovery: #4a3aa7; --m-no_action: #8a919c;
    --m-turn_exhaustion: #5d4037; --m-off_task_damage: #d55181;
    --m-api_error: #9e9e9e; --m-other: #c3c2b7;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #16161a; --card: #1e1e23; --ink: #eceae2; --ink-2: #b9bcc4;
      --mut: #868c96; --line: #2e2e34; --accent: #9fb2d8;
      --s0: #3987e5; --s1: #d95926; --s2: #199e70; --s3: #c98500; --s4: #d55181;
      --heat-h: 57, 135, 229;
    }
  }
  :root[data-theme="dark"] {
    --paper: #16161a; --card: #1e1e23; --ink: #eceae2; --ink-2: #b9bcc4;
    --mut: #868c96; --line: #2e2e34; --accent: #9fb2d8;
    --s0: #3987e5; --s1: #d95926; --s2: #199e70; --s3: #c98500; --s4: #d55181;
    --heat-h: 57, 135, 229;
  }
  * { box-sizing: border-box; }
  body { background: var(--paper); color: var(--ink); margin: 0;
    font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 1060px; margin: 0 auto; padding: 40px 24px 80px; }
  h1, h2 { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
    text-wrap: balance; letter-spacing: 0.1px; }
  h1 { font-size: 2rem; margin: 0 0 6px; }
  h2 { font-size: 1.35rem; margin: 48px 0 6px; }
  .sub { color: var(--ink-2); max-width: 68ch; margin: 0 0 4px; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.72rem;
    color: var(--mut); font-weight: 600; margin-bottom: 10px; }
  .disclaimer { border: 1px solid var(--line); background: var(--card); color: var(--ink-2);
    border-left: 3px solid var(--accent); padding: 10px 14px; font-size: 0.85rem;
    margin: 18px 0 0; max-width: 76ch; }
  .stats { display: flex; flex-wrap: wrap; gap: 12px; margin: 26px 0 8px; }
  .stat { background: var(--card); border: 1px solid var(--line); padding: 12px 18px;
    min-width: 128px; }
  .stat b { display: block; font-size: 1.5rem; font-variant-numeric: tabular-nums;
    font-family: Georgia, serif; }
  .stat span { color: var(--mut); font-size: 0.75rem; text-transform: uppercase;
    letter-spacing: 0.1em; }
  .lb { background: var(--card); border: 1px solid var(--line); padding: 20px 22px 14px;
    margin-top: 14px; }
  .lb-row { display: grid; grid-template-columns: 300px 1fr; gap: 14px;
    align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .lb-row:last-child { border-bottom: none; }
  .lb-name { font-weight: 600; font-size: 0.95rem; display: flex; align-items: baseline;
    gap: 8px; flex-wrap: wrap; }
  .lb-model { color: var(--mut); font-weight: 400; font-size: 0.75rem; }
  .lb-track { position: relative; height: 26px; background: transparent; display: flex;
    align-items: center; gap: 10px; }
  .lb-bar { height: 18px; border-radius: 0 4px 4px 0; min-width: 3px; }
  .lb-val { font-variant-numeric: tabular-nums; font-weight: 650; font-size: 0.95rem; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%;
    flex: none; align-self: center; }
  .s0 { background: var(--s0); } .s1 { background: var(--s1); } .s2 { background: var(--s2); }
  .s3 { background: var(--s3); } .s4 { background: var(--s4); }
  .fm-row { background: var(--card); border: 1px solid var(--line); padding: 14px 18px;
    margin-top: 10px; }
  .fm-head { display: flex; gap: 8px; align-items: baseline; margin-bottom: 8px; }
  .fm-n { color: var(--mut); font-size: 0.8rem; }
  .fm-stack { display: flex; height: 22px; border-radius: 3px; overflow: hidden; gap: 2px;
    background: var(--paper); }
  .seg { min-width: 3px; }
  ${MODE_ORDER.map((m) => `.seg[data-mode="${m}"], .mode-chip[data-mode="${m}"]::before { background: var(--m-${m}); }`).join("\n  ")}
  .fm-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; }
  .mode-chip { font-size: 0.76rem; color: var(--ink-2); display: inline-flex;
    align-items: center; gap: 6px; }
  .mode-chip::before { content: ""; width: 9px; height: 9px; border-radius: 2px;
    display: inline-block; }
  .table-scroll { overflow-x: auto; margin-top: 14px; }
  table { border-collapse: collapse; width: 100%; background: var(--card);
    border: 1px solid var(--line); font-size: 0.85rem; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--line);
    white-space: nowrap; }
  thead th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--mut); font-weight: 600; }
  tbody th { font-weight: 600; }
  td { font-variant-numeric: tabular-nums; }
  td.heat { background: rgba(var(--heat-h), var(--ha, 0)); }
  td.heat.none, .mut { color: var(--mut); }
  .note { color: var(--ink-2); font-size: 0.85rem; max-width: 76ch; }
  .meth { background: var(--card); border: 1px solid var(--line); padding: 20px 24px;
    margin-top: 14px; }
  .meth h3 { margin: 14px 0 4px; font-size: 1rem; }
  .meth p, .meth li { color: var(--ink-2); font-size: 0.9rem; max-width: 80ch; }
  code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.85em;
    background: var(--paper); border: 1px solid var(--line); padding: 1px 5px;
    border-radius: 3px; }
  footer { margin-top: 56px; color: var(--mut); font-size: 0.78rem; }
  a { color: var(--accent); }
</style>
<div class="wrap">
  <div class="eyebrow">lawfirm-qwen · Eve Litigation world (simulated)</div>
  <h1>Legal Agent Leaderboard</h1>
  <p class="sub">Models measured as agents inside an executable law-firm simulation:
  ${world.tables.length} live tables, ${world.tools.length} executable tools, ${totalTasks} tasks
  (${world.tasks.length} original + ${expansion ? expansion.tasks_added : 0} eval-anchored expansion),
  ${totalDocs} seeded matter documents. Every score comes from deterministic VCode verifiers —
  per-assertion verdicts, anti-hack vetoes, no LLM judge — over ${results[0]?.episodesPerTask ?? 3}
  episodes per task.</p>
  <p class="disclaimer"><strong>Simulation only.</strong> Every matter, client, document, attorney,
  and figure is synthetic test data. Task shapes are anchored to public benchmarks
  (Harvey LAB, BigLaw Bench, LegalBench, CUAD, MAUD, TaxCalcBench …) — no affiliation with any
  benchmark publisher or law firm. Scores below are <em>not</em> comparable to any other harness's absolute numbers.</p>

  <div class="stats">
    <div class="stat"><b>${results.length}</b><span>models measured</span></div>
    <div class="stat"><b>${results.reduce((a, r) => a + r.tasksMeasured * r.episodesPerTask, 0).toLocaleString()}</b><span>episodes run</span></div>
    <div class="stat"><b>${totalTasks}</b><span>tasks in world</span></div>
    <div class="stat"><b>${totalDocs}</b><span>seeded documents</span></div>
    <div class="stat"><b>21</b><span>boundary-proven flaky tasks</span></div>
    <div class="stat"><b>$${results.reduce((a, r) => a + r.overall.totalCostUsd, 0).toFixed(0)}</b><span>total measurement cost</span></div>
  </div>

  <h2>Task Pass Rate</h2>
  <p class="note">Mean per-task pass rate across ${results[0]?.episodesPerTask ?? 3} episodes
  (a task passed 2 of 3 episodes contributes 66.7). Deterministic verifier, structural conditions only.</p>
  <div class="lb">${leaderboardRows((r) => r.overall.score, 100)}</div>

  <h2>Pass^${results[0]?.episodesPerTask ?? 3} — the hard metric</h2>
  <p class="note">Share of tasks passed in <em>every</em> episode. This is the reliability number:
  a model that "can" do a task but only sometimes does not clear this bar
  (the analogue of Harvey LAB's all-pass rate, but over repeated executions instead of rubric criteria).</p>
  <div class="lb">${leaderboardRows((r) => +((r.overall.passAll / r.tasksMeasured) * 100).toFixed(1), 100)}</div>

  <h2>Failure modes — why each model fails when it fails</h2>
  <p class="note">Every failing episode classified from its full step trace
  (tool calls, arguments, observations). Hover segments for counts. Full per-model reports in
  <code>docs/failure-reports/</code>.</p>
  ${modeStacks()}

  <h2>The capability boundary</h2>
  <p class="note">The 21 tasks with prior mixed-outcome proof at a model boundary
  (<code>docs/FAILURE-REPORT.md</code>), re-measured per model. "Outcome stability" =
  share of tasks with a consistent verdict across all episodes (either all pass or all fail);
  low stability means the model sits at this world's difficulty boundary.</p>
  ${boundaryTable()}

  <h2>Jagged intelligence — score by family</h2>
  <p class="note">Per-task-shape and per-practice-area scores (sequential shading, darker = higher).
  No model dominates every family — the same "jagged intelligence" pattern the
  Harvey LAB &times; Artificial Analysis leaderboard reports across practice areas.</p>
  ${familyHeat()}

  ${expansionSection()}

  <h2>Full results</h2>
  ${fullTable()}

  <h2>Context — the same task-shape lineage on Harvey LAB (Artificial Analysis)</h2>
  <p class="note">For orientation only: the Artificial Analysis &times; Harvey LAB leaderboard
  (<a href="https://artificialanalysis.ai/evaluations/harvey-lab-aa">harvey-lab-aa</a>, 120 private
  LAB tasks, single LLM-judge, criterion pass rate / all-pass) — a <em>different benchmark and
  grading system</em> whose task shapes this world hosts in executable form. Do not compare
  absolute numbers across the two.</p>
  <div class="table-scroll"><table class="data-table">
    <thead><tr><th>Model (AA harness)</th><th>Criterion pass %</th><th>All-pass %</th></tr></thead>
    <tbody>${AA_CONTEXT.map(([m, c, a]) => `<tr><th>${esc(m)}</th><td>${c}</td><td>${a}</td></tr>`).join("")}</tbody>
  </table></div>

  <h2>Methodology</h2>
  <div class="meth">
    <h3>Environment</h3>
    <p>The world (id <code>${esc(world.world_id)}</code>) runs fully locally:
    <code>world/local/server.py</code> hydrates the shipped world document into SQLite and serves
    the same session/MCP/verify surface the original hosted runtime exposed. Fidelity is proven by
    a reference-walk oracle: 156/156 original tasks execute and pass their shipped verifiers.
    Seeded friction is active: 3% injected <code>rate_limited</code>/<code>stale_reference</code>
    tool failures, 15% ambiguous write-acks, per-session write cap — all deterministic.</p>
    <h3>Protocol</h3>
    <p>Each episode: fresh session (pristine DB copy), the task prompt verbatim, all
    ${world.tools.length} world tools exposed via MCP, reference-relative turn budget
    (3&times; walk length + 6, min 50). Scoring calls the task's VCode verifier with the full
    rollout trace: structural conditions decide pass/fail; anti-hack conditions (workflow
    shortcuts, fabricated rows, collateral damage) veto reward to 0; tool-success is advisory.
    ${Object.keys(config.scoring?.quarantinedTasks ?? {}).length} task(s) quarantined from scoring
    for prompt/verifier drift (${esc(Object.keys(config.scoring?.quarantinedTasks ?? {}).join(", "))}).</p>
    <h3>Honesty notes</h3>
    <ul>
      <li>Scores are world-specific. Cross-harness comparison of absolute numbers is invalid — the same
      LAB family yields 26.7% (AA), ~7–12% (Harvey held-out), ~13.3% (Vals) top all-pass under three
      different graders.</li>
      <li>${results.some((r) => r.taskSet !== "scored") ? "Models measured on different task sets are flagged in their row (boundary = flaky + in-band + too-hard subset)." : "All models measured on the identical scored task set."}</li>
      <li>Verifiers are generated and execution-grounded, not attorney-reviewed; they grade operational
      correctness (right records, right values, right evidence chain), not prose quality.</li>
      <li>qwen3-8b is the repo's target training policy; it appears here only when an endpoint is
      configured (<code>QWEN_BASE_URL</code>).</li>
    </ul>
    <h3>Reproduce / extend</h3>
    <p><code>npm run world:serve</code> · <code>npm run leaderboard -- --engines &lt;id,…&gt; --episodes 3</code> ·
    <code>npm run failure-report -- --all</code> · <code>node docs/leaderboard/build-page.mjs</code>.
    Adding a model = one entry in <code>config/world.config.json</code> models registry.</p>
  </div>

  <footer>Generated ${generatedAt} · lawfirm-qwen · world ${esc(world.world_id)} v${world.version}
  · all data in <code>data/leaderboard/</code></footer>
</div>
`;

writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB, ${results.length} models)`);
