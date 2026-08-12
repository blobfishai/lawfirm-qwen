#!/usr/bin/env node
/** Deterministic HTML renderer for schema-v2 leaderboard reports. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const RESULTS = resolve(ROOT, opt("--results", "data/leaderboard/results"));
const OUT = resolve(ROOT, opt("--out", "docs/leaderboard/index.html"));
const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const metric = (value, suffix = "%") => value === null || value === undefined ? "—" : `${value}${suffix}`;
const href = (path) => path?.startsWith("data/") ? `../../${path}` : path;

const reports = existsSync(RESULTS) ? readdirSync(RESULTS).filter((name) => name.endsWith(".v2.json"))
  .sort().map((name) => {
    const report = JSON.parse(readFileSync(join(RESULTS, name), "utf8"));
    return { ...report, _file: name };
  }).filter((report) => report.schemaVersion === 2) : [];
if (!reports.length) {
  console.error(`no schema-v2 reports in ${RESULTS}`);
  process.exit(1);
}

const capabilityRows = Array.from({ length: 10 }, (_, offset) => offset + 1).map((type) => {
  const name = reports.find((report) => report.byCapabilityClean?.[type])
    ?.byCapabilityClean?.[type]?.name ?? `capability_${type}`;
  return `<tr><th>${type} · ${esc(name.replaceAll("_", " "))}</th>${reports.map((report) => {
    const row = report.byCapabilityClean?.[type];
    return `<td>${metric(row?.passCubed)}<small>${row?.tasksWithThreeEpisodes ?? 0}/${row?.tasksDefined ?? 0} tasks</small></td>`;
  }).join("")}</tr>`;
}).join("");

const modelRows = reports.map((report) => `<tr>
  <th>${esc(report.label)}<small>${esc(report.model)}</small></th>
  <td>${metric(report.headline.passCubed)}</td>
  <td>${report.headline.tasks}</td>
  <td>${report.coverage.tasksMeasured}/${report.coverage.tasksDefined}</td>
  <td>${metric(report.laneSplit.rate)}</td>
  <td>${metric(report.pagingDiscipline.completeRate)}</td>
  <td>${metric(report.turnCeiling?.rate)}</td>
  <td>${metric(report.retrieval.meanPrecision)} / ${metric(report.retrieval.meanRecall)}</td>
  <td>${metric(report.contaminatedLab.passCubed)}</td>
  <td>${report.refusal.episodes}</td>
  <td><a href="../../data/leaderboard/results/${encodeURIComponent(report._file)}">JSON</a></td>
</tr>`).join("");

const taskDetails = reports.map((report) => {
  const rows = report.tasks.filter((task) => task.episodesFound || task.triage === "boundary")
    .map((task) => `<tr><th>${esc(task.taskId)}</th><td>${task.capabilityType}</td><td>${esc(task.triage)}</td>
      <td>${metric(task.passCubed)}</td><td>${task.contaminated ? "public LAB" : "clean"}</td>
      <td>${task.episodeFiles.map((source, index) => `<a href="${esc(href(source))}">e${index + 1}</a>`).join(" ") || "—"}</td></tr>`).join("");
  return `<details><summary>${esc(report.label)} — ${report.coverage.tasksMeasured} measured tasks</summary>
    <div class="scroll"><table><thead><tr><th>Task</th><th>Type</th><th>Triage</th><th>pass³</th><th>Lane</th><th>Episodes</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6">No world-v${report.worldVersion} episodes measured yet.</td></tr>`}</tbody></table></div></details>`;
}).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Legal Agent Simulation — Leaderboard v2</title>
<style>
:root{--paper:#f6f4ee;--card:#fff;--ink:#18202a;--mut:#667085;--line:#d8d5cb;--accent:#5b43a6;--good:#16794a}
@media(prefers-color-scheme:dark){:root{--paper:#15151a;--card:#1d1d24;--ink:#eee;--mut:#a4a7b0;--line:#34343d;--accent:#b7a3ff;--good:#75d7a4}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,sans-serif}.wrap{max-width:1180px;margin:auto;padding:44px 24px 80px}
h1,h2{font-family:Georgia,serif;margin-bottom:8px}h1{font-size:2.25rem}.lede{max-width:76ch;color:var(--mut);font-size:1.05rem}.tag{font:700 11px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.notice{border-left:4px solid var(--accent);background:var(--card);padding:14px 18px;margin:24px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:20px 0}.card{background:var(--card);border:1px solid var(--line);padding:16px}.card b{font:700 1.5rem Georgia,serif;display:block}.card small,td small,th small{display:block;color:var(--mut);font-weight:400}
.scroll{overflow:auto}table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line)}th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}thead th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut)}tbody th{font-weight:650}a{color:var(--accent)}details{margin:12px 0}summary{cursor:pointer;font-weight:650}.method{color:var(--mut);max-width:84ch}.ok{color:var(--good)}
</style></head><body><main class="wrap">
<div class="tag">legal-agent-simulation · world-v19 · deterministic lane</div>
<h1>Legal Agent Leaderboard v2</h1>
<p class="lede">Reliability is reported as pass³ on the empirically observed boundary set. File, system-state, paging, retrieval, turn-ceiling, contamination, refusal, and infrastructure channels stay separate; no LLM-judge score enters this page. Model episodes use the recorded <code>${esc(reports[0].measurementProtocol ?? "unknown")}</code> protocol.</p>
<div class="notice"><strong>Measurement status:</strong> ${reports.every((report) => report.headline.status === "measured") ? `<span class="ok">boundary set measured</span>` : "calibration incomplete — null metrics are shown as —, never zero-filled."}</div>
<div class="grid">${reports.map((report) => `<div class="card"><small>${esc(report.label)}</small><b>${metric(report.headline.passCubed)}</b><span>boundary pass³ · ${report.headline.tasks} tasks</span></div>`).join("")}</div>
<h2>Model instruments</h2><div class="scroll"><table><thead><tr><th>Model</th><th>Boundary pass³</th><th>Boundary n</th><th>Coverage</th><th>Lane split</th><th>Paging complete</th><th>Turn ceiling</th><th>Retrieval P / R</th><th>Public LAB pass³</th><th>Refusals</th><th>Proof</th></tr></thead><tbody>${modelRows}</tbody></table></div>
<p class="method">Lane split means file-pass and state-fail (or the inverse) and is calculated only where Harbor emitted both lane verdicts. Retrieval always reports precision with recall. Turn ceiling is a terminal model outcome and remains separate from infrastructure timeout. Public verbatim LAB tasks have their own contamination-caveated column.</p>
<h2>Ten-capability reliability grid</h2><div class="scroll"><table><thead><tr><th>Primary capability</th>${reports.map((report) => `<th>${esc(report.label)}<small>pass³ · measured/defined</small></th>`).join("")}</tr></thead><tbody>${capabilityRows}</tbody></table></div>
<h2>Task-level proof</h2><p class="method">Every measured row links directly to its episode JSON or deterministic JSON.GZ archive. Expand a model to audit any displayed aggregate.</p>${taskDetails}
</main></body></html>\n`;
writeFileSync(OUT, html);
console.log(`leaderboard-v2 page: ${reports.length} reports → ${OUT}`);
