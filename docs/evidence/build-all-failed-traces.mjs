#!/usr/bin/env node
/**
 * ALL failed traces — every failing episode of every measured engine, grouped
 * by classified failure mode, each with its compact turn-by-turn record and
 * failed verifier conditions. Nothing sampled, nothing omitted.
 *
 * Output: docs/evidence/all-failed-traces.html
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, MODE_DESCRIPTIONS } from "../../sim/lib/classify-failure.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EP_ROOT = join(ROOT, "data", "leaderboard", "episodes");
const RES_DIR = join(ROOT, "data", "leaderboard", "results");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MODE_LABELS = {
  deliverable_in_chat: "Deliverable left in chat", emission_collapse: "Emission collapse",
  workflow_shortcut: "Workflow shortcut / checkpoint order", wrong_value: "Wrong graded value",
  evidence_gap: "Evidence gap", fabrication: "Fabricated determination",
  friction_non_recovery: "Friction non-recovery", no_action: "No effective action",
  turn_exhaustion: "Turn exhaustion", off_task_damage: "Off-task record creation (side-copies)",
  api_error: "Provider/API failure", output_cap_truncation: "HARNESS: output-cap truncation", other: "Other",
};
const MODE_ORDER = Object.keys(MODE_LABELS);

function stepLine(s) {
  const isFinal = s.tool === "_final_answer";
  const args = JSON.stringify(s.args ?? {});
  const argShown = args.length > 180 ? args.slice(0, 180) + `…[${args.length.toLocaleString()}ch]` : args;
  const obs = String(s.observation ?? "").replace(/\s+/g, " ");
  const obsShown = obs.length > 150 ? obs.slice(0, 150) + "…" : obs;
  return `<div class="sl ${s.ok === false ? "err" : ""} ${isFinal ? "fin" : ""}">
    <span class="t">t${s.turn ?? "?"}</span>
    <span class="tn">${esc(isFinal ? "final answer" : s.tool)}</span>${s.argParseError ? '<span class="pf">parse-fail→{}</span>' : ""}
    ${!isFinal ? `<span class="ar">${esc(argShown)}</span>` : ""}
    <span class="ob">${s.ok === false ? "✗ " : ""}${esc(obsShown)}</span>
  </div>`;
}

function episodeHtml(engine, file, ep, open) {
  return `<details${open ? " open" : ""}><summary><code>${esc(ep.taskId)}</code> ep${file.match(/-t(\d)/)?.[1] ?? "?"}
    · ${ep.toolCalls} calls · ${ep.turnsUsed} turns · fails: <span class="bad">${esc((ep.failedConditions ?? []).join(", ").slice(0, 110))}</span>${ep.preRescore ? ' <span class="rescored">rescored</span>' : ""}</summary>
    <div class="trace-body">${(ep.steps ?? []).map(stepLine).join("")}</div>
  </details>`;
}

const engines = readdirSync(RES_DIR).filter((f) => f.endsWith(".json") && !f.includes("@"))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((e) => existsSync(join(EP_ROOT, e)));

let body = "";
const summary = [];
for (const engine of engines) {
  const agg = JSON.parse(readFileSync(join(RES_DIR, `${engine}.json`), "utf8"));
  const files = readdirSync(join(EP_ROOT, engine)).filter((f) => f.endsWith(".json")).sort();
  const failed = [];
  for (const f of files) {
    try {
      const ep = JSON.parse(readFileSync(join(EP_ROOT, engine, f), "utf8"));
      if (!ep.passed) failed.push({ f, ep, mode: classify(ep) });
    } catch { /* skip */ }
  }
  summary.push(`${agg.label}: ${failed.length} failing episodes`);
  const byMode = {};
  for (const x of failed) (byMode[x.mode] ??= []).push(x);
  body += `<h2>${esc(agg.label)} — score ${agg.overall.score} · ${failed.length} failing episodes of ${files.length}</h2>`;
  for (const mode of MODE_ORDER) {
    const eps = byMode[mode];
    if (!eps?.length) continue;
    body += `<section class="mode-block">
      <h3>${esc(MODE_LABELS[mode])} — ${eps.length} episodes</h3>
      <p class="note">${esc(MODE_DESCRIPTIONS[mode] ?? "")}</p>
      ${eps.map((x, i) => episodeHtml(engine, x.f, x.ep, i === 0)).join("\n")}
    </section>`;
  }
}

const html = `<meta charset="utf-8">
<title>lawfirm-qwen — ALL Failed Traces</title>
<style>
  :root { --paper:#f9f9f7; --card:#fff; --ink:#1c2128; --ink2:#57606d; --mut:#8a919c;
    --line:#e4e5e1; --accent:#33415e; --bad:#e34948; --warn:#c98500; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --paper:#16161a; --card:#1e1e23; --ink:#eceae2; --ink2:#b9bcc4; --mut:#868c96;
    --line:#2e2e34; --accent:#9fb2d8; --bad:#e66767; --warn:#d9a441; } }
  :root[data-theme="dark"] { --paper:#16161a; --card:#1e1e23; --ink:#eceae2; --ink2:#b9bcc4;
    --mut:#868c96; --line:#2e2e34; --accent:#9fb2d8; --bad:#e66767; --warn:#d9a441; }
  * { box-sizing:border-box; } body { background:var(--paper); color:var(--ink); margin:0;
    font:14px/1.45 system-ui,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding:32px 20px 80px; }
  h1,h2,h3 { font-family:Georgia,serif; }
  h1 { font-size:1.6rem; margin:0 0 4px; }
  h2 { font-size:1.25rem; margin:36px 0 4px; border-bottom:2px solid var(--line); padding-bottom:4px; }
  h3 { font-size:1rem; margin:18px 0 2px; color:var(--warn); }
  .eyebrow { text-transform:uppercase; letter-spacing:.14em; font-size:.68rem; color:var(--mut);
    font-weight:600; margin-bottom:8px; }
  .note { color:var(--ink2); font-size:.8rem; max-width:84ch; margin:2px 0 8px; }
  details { background:var(--card); border:1px solid var(--line); margin:6px 0; padding:0 10px; }
  summary { cursor:pointer; padding:7px 2px; font-size:.8rem; }
  .trace-body { border-top:1px solid var(--line); padding:6px 0; }
  .sl { display:grid; grid-template-columns:34px 230px 1fr; gap:8px; padding:2px 0;
    font-family:ui-monospace,Menlo,monospace; font-size:.7rem; border-left:2px solid var(--line);
    padding-left:8px; margin:2px 0; }
  .sl.err { border-left-color:var(--bad); } .sl.fin { border-left-color:var(--accent); }
  .sl .t { color:var(--mut); } .sl .tn { font-weight:600; word-break:break-all; }
  .sl .ar { color:var(--ink2); word-break:break-all; grid-column:3; }
  .sl .ob { color:var(--mut); word-break:break-word; grid-column:3; }
  .sl .pf { color:var(--warn); font-size:.65rem; }
  .bad { color:var(--bad); } .rescored { color:var(--accent); font-size:.68rem; }
  code { font-family:ui-monospace,Menlo,monospace; }
  .mode-block { margin-bottom:10px; }
</style>
<div class="wrap">
  <div class="eyebrow">lawfirm-qwen · run evidence · every failing episode</div>
  <h1>All failed traces — complete, grouped by failure mode</h1>
  <p class="note">${esc(summary.join(" · "))}. Every failing episode of every measured engine, with its
  compact turn-by-turn record (tool, arguments, result) and failed verifier conditions. First episode of
  each mode expanded; click any row to expand. Full-fidelity records (thoughts, complete arguments,
  complete observations, per-assertion verdicts) are the JSON files under
  <code>data/leaderboard/episodes/</code>. "rescored" marks episodes whose verdict was corrected by the
  contamination audit (docs/AUDIT.md) but still fail on genuine conditions. Simulation only.</p>
  ${body}
  <footer class="note" style="margin-top:32px">Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC ·
  <code>node docs/evidence/build-all-failed-traces.mjs</code></footer>
</div>`;

writeFileSync(join(ROOT, "docs", "evidence", "all-failed-traces.html"), html);
console.log(`all-failed-traces.html: ${(html.length / 1024).toFixed(0)} KB · ${summary.join(" · ")}`);
