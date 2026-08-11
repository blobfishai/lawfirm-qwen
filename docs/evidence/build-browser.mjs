#!/usr/bin/env node
/**
 * Tasks & Traces browser — one self-contained page indexing the whole catalog:
 *
 *   TASKS  : all tasks in the canonical world, each with its prompt, reference
 *            walk, effects, provenance anchor, verifier assertions, and the
 *            seeded documents materialized under tasks/<id>/seed/documents/.
 *   TRACES : every episode on disk under traces/<model>/{passed,failed}/,
 *            failures expanded turn-by-turn with the verifier's per-assertion
 *            verdict.
 *
 * Nothing is sampled: if anything is capped for page size, the cap is printed
 * to stdout AND rendered on the page.
 *
 * Run: node docs/evidence/build-browser.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { quarantineReason } from "../../sim/lib/quarantine.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORLD = join(ROOT, "world", "blobfish", "world-v8.json");
const raw = JSON.parse(readFileSync(WORLD, "utf8"));
const world = raw.world ?? raw;

const OBS_CAP = 420;   // chars of tool output kept per step
const BODY_CAP = 4000; // chars of seeded-document body kept
const caps = [];

// ------------------------------------------------------------------- tasks
const mdRows = world.tables.find((t) => t.name === "matter_documents").sample_rows;
const mdById = new Map(mdRows.map((r) => [r.id, r]));

function verifierAssertions(taskId) {
  const p = join(ROOT, "tasks", taskId, "verifier.py");
  if (!existsSync(p)) return [];
  const src = readFileSync(p, "utf8");
  return [...src.matchAll(/chk\(\s*"([a-z_0-9]+)"/g)].map((m) => m[1]);
}

// Document bodies live ONCE in a shared map; tasks reference them by id.
// (Clusters are shared across tasks — inlining per task multiplied the page ~10x.)
const docStore = {};
for (const r of mdRows) {
  const body = String(r.body ?? "");
  if (body.length > BODY_CAP) caps.push(`doc ${r.id} body ${body.length}→${BODY_CAP}`);
  docStore[r.id] = {
    title: r.title, type: r.doc_type,
    body: body.slice(0, BODY_CAP), truncated: body.length > BODY_CAP,
  };
}

const tasks = world.tasks.map((t) => {
  const seed = t.seed ?? { documents: [], input_documents: [], core_data: {}, mcp: {} };
  const docs = seed.documents.filter((id) => docStore[id])
    .map((id) => ({ id, input: seed.input_documents.includes(id) }));
  const prov = t.provenance?.source_workflow ?? "";
  return {
    id: t.task_id,
    prompt: t.prompt ?? "",
    goal: t.goal ?? "",
    walk: t.walk ?? [],
    effects: t.effects ?? [],
    anchor: prov.split(":")[0] || "graph-walk",
    family: (prov.split(":")[1] ?? "").split("/")[0]?.trim() ?? "",
    tier: t.difficulty_tier ?? "",
    tables: t.tables_affected ?? [],
    assertions: verifierAssertions(t.task_id),
    coreTables: Object.keys(seed.core_data ?? {}),
    docs,
  };
});

// ------------------------------------------------------------------ traces
const TR = join(ROOT, "traces");
const models = existsSync(TR)
  ? readdirSync(TR).filter((d) => statSync(join(TR, d)).isDirectory())
  : [];

// Verdicts the path-rule correction supersedes (sim/rescore-path-rule.mjs).
// The path assertion is a pure function of the tool sequence, so these are
// exact recomputations, not estimates — the browser scores them as passes.
// Tasks retired for grading nothing (docs/DISCRIMINATION.md). Episodes that
// measured them are history, not evidence: a pass on a task that also accepts a
// corrupted payload says nothing about capability, so they are shown and counted
// but never folded into a rate.
const retiredTasks = new Set((world.retired_tasks ?? []).map((r) => r.task_id));
const liveTasks = new Set(world.tasks.map((t) => t.task_id));
// An episode measuring a task the current world does not contain is history in
// either case — explicitly retired, or from an older world whose ids are gone.
const orphanReason = (id) => retiredTasks.has(id)
  ? "retired for grading nothing — its prompt named its own tool walk and its verifier pinned no value, so a corrupted write payload passed with full reward"
  : liveTasks.has(id) ? null
  : "not present in the current world — this episode was recorded against an earlier world whose task ids are gone";

const RESCORE = join(ROOT, "data", "path-rule-rescore.json");
const flipped = new Set(existsSync(RESCORE)
  ? JSON.parse(readFileSync(RESCORE, "utf8")).flips : []);

const traces = [];
for (const model of models) {
  for (const bucket of ["passed", "failed"]) {
    const dir = join(TR, model, bucket);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      let j;
      try { j = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
      const steps = (j.steps ?? []).map((s) => {
        const obs = String(s.observation ?? s.result ?? "");
        return {
          turn: s.turn ?? null,
          tool: s.tool ?? s.name ?? null,
          args: s.args ?? null,
          thought: s.thought ? String(s.thought).slice(0, 600) : "",
          error: !!s.error,
          obs: obs.slice(0, OBS_CAP),
          more: Math.max(0, obs.length - OBS_CAP),
          final: !!s.final || (!s.tool && !s.name),
        };
      });
      const file = `traces/${model}/${bucket}/${f}`;
      const rescored = flipped.has(file);
      traces.push({
        file,
        quarantine: quarantineReason(j),
        retired: orphanReason(j.taskId),
        rescored,
        task: j.taskId, model: j.model ?? model, engine: j.engine ?? model,
        surface: j.mcpMode ?? "", passed: rescored ? true : !!j.passed, reward: j.reward ?? 0,
        calls: j.toolCalls ?? steps.length, turns: j.turnsUsed ?? null,
        maxTurns: j.maxTurns ?? null, cost: j.costUsd ?? 0,
        failed: j.failedConditions ?? [],
        assertions: (j.assertions ?? []).map((a) => ({
          name: a.name, ok: !!a.passed, detail: String(a.details ?? "").slice(0, 240),
        })),
        // full step record for failures; passes carry the summary only
        steps: j.passed ? [] : steps,
      });
    }
  }
}
traces.sort((a, b) => (a.model + a.task).localeCompare(b.model + b.task));

// Headline rates are computed on SELF-CONSISTENT verdicts only. Quarantined
// episodes are counted and shown, never folded into a rate.
const byModel = {};
for (const t of traces) {
  const m = (byModel[t.model] ??= { n: 0, pass: 0, cost: 0, tasks: new Set(), q: 0, qPass: 0, ret: 0 });
  m.cost += t.cost; m.tasks.add(t.task);
  if (t.retired) { m.ret++; continue; }
  if (t.quarantine) { m.q++; if (t.passed) m.qPass++; continue; }
  m.n++; if (t.passed) m.pass++;
}
const modelRows = Object.entries(byModel).map(([m, v]) => ({
  model: m, n: v.n, pass: v.pass, rate: v.n ? (100 * v.pass / v.n) : 0,
  cost: v.cost, tasks: v.tasks.size, q: v.q, qPass: v.qPass, ret: v.ret,
})).sort((a, b) => (b.n ? b.rate : -1) - (a.n ? a.rate : -1));
const qTotal = traces.filter((t) => t.quarantine).length;
const retTotal = traces.filter((t) => t.retired).length;
const qFalsePass = traces.filter((t) => t.quarantine && t.passed).length;

const DATA = { tasks, traces, modelRows, caps, docStore, qTotal, qFalsePass, retTotal, world: {
  version: world.version ?? "", tasks: world.tasks.length,
  tools: world.tools.length, docs: mdRows.length,
} };

// ------------------------------------------------------------------ render
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const json = JSON.stringify(DATA).replace(/</g, "\\u003c");

const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>lawfirm-qwen — Tasks &amp; Traces</title>
<style>
  :root { --paper:#f9f9f7; --card:#fff; --ink:#1c2128; --ink2:#57606d; --mut:#8a919c;
    --line:#e4e5e1; --accent:#33415e; --bad:#e34948; --okc:#008300; --warn:#c98500;
    --sel:#eceef4; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --paper:#16161a; --card:#1e1e23; --ink:#eceae2; --ink2:#b9bcc4; --mut:#868c96;
    --line:#2e2e34; --accent:#9fb2d8; --bad:#e66767; --okc:#4cae4c; --warn:#d9a441;
    --sel:#272a33; } }
  :root[data-theme="dark"] { --paper:#16161a; --card:#1e1e23; --ink:#eceae2; --ink2:#b9bcc4;
    --mut:#868c96; --line:#2e2e34; --accent:#9fb2d8; --bad:#e66767; --okc:#4cae4c;
    --warn:#d9a441; --sel:#272a33; }
  * { box-sizing:border-box; }
  body { background:var(--paper); color:var(--ink); margin:0;
    font:15px/1.5 system-ui,-apple-system,sans-serif; }
  h1,h2,h3 { font-family:Georgia,serif; text-wrap:balance; }
  a { color:var(--accent); }
  .top { border-bottom:1px solid var(--line); padding:20px 22px 0; background:var(--card); }
  .eyebrow { text-transform:uppercase; letter-spacing:.14em; font-size:.7rem; color:var(--mut);
    font-weight:600; }
  h1 { font-size:1.45rem; margin:6px 0 4px; }
  .sub { color:var(--ink2); font-size:.85rem; max-width:82ch; margin:0 0 14px; }
  .tabs { display:flex; gap:4px; }
  .tab { appearance:none; background:none; border:1px solid var(--line); border-bottom:none;
    color:var(--ink2); font:inherit; font-size:.85rem; padding:7px 16px; cursor:pointer;
    border-radius:5px 5px 0 0; }
  .tab[aria-selected="true"] { background:var(--paper); color:var(--ink); font-weight:600;
    box-shadow:inset 0 2px 0 var(--accent); }
  .tab:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; padding:12px 22px;
    border-bottom:1px solid var(--line); }
  input[type=search], select { font:inherit; font-size:.85rem; padding:6px 10px;
    border:1px solid var(--line); border-radius:5px; background:var(--card); color:var(--ink); }
  input[type=search] { min-width:min(320px,60vw); }
  .count { color:var(--mut); font-size:.78rem; margin-left:auto; font-variant-numeric:tabular-nums; }
  .pane { display:grid; grid-template-columns:minmax(240px,340px) 1fr; gap:0;
    height:calc(100vh - 210px); min-height:420px; }
  @media (max-width:820px) { .pane { grid-template-columns:1fr; height:auto; }
    .list { max-height:300px; } }
  .list { overflow-y:auto; border-right:1px solid var(--line); }
  .row { display:block; width:100%; text-align:left; appearance:none; background:none;
    border:none; border-bottom:1px solid var(--line); padding:9px 16px; cursor:pointer;
    font:inherit; color:var(--ink); }
  .row:hover { background:var(--sel); }
  .row[aria-current="true"] { background:var(--sel); box-shadow:inset 3px 0 0 var(--accent); }
  .row:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
  .rid { font-family:ui-monospace,Menlo,monospace; font-size:.78rem; font-weight:600; }
  .rsub { color:var(--mut); font-size:.73rem; overflow:hidden; text-overflow:ellipsis;
    white-space:nowrap; }
  .detail { overflow-y:auto; padding:20px 24px 60px; }
  .pill { font-size:.68rem; padding:1px 8px; border-radius:9px; border:1px solid var(--line);
    color:var(--ink2); white-space:nowrap; }
  .pill.ok { border-color:var(--okc); color:var(--okc); }
  .pill.no { border-color:var(--bad); color:var(--bad); }
  .pill.wr { border-color:var(--warn); color:var(--warn); }
  .pills { display:flex; gap:6px; flex-wrap:wrap; margin:6px 0 14px; }
  .prompt { border:1px dashed var(--line); padding:10px 13px; font-size:.85rem;
    color:var(--ink2); max-width:88ch; white-space:pre-wrap; }
  h3 { font-size:.82rem; text-transform:uppercase; letter-spacing:.08em; color:var(--mut);
    margin:22px 0 7px; font-family:system-ui,sans-serif; font-weight:600; }
  .walk { font-family:ui-monospace,Menlo,monospace; font-size:.78rem; color:var(--ink);
    background:var(--card); border:1px solid var(--line); padding:8px 11px;
    overflow-x:auto; white-space:nowrap; }
  ul.plain { margin:0; padding-left:18px; font-size:.83rem; color:var(--ink2); }
  ul.plain li { margin:2px 0; }
  .mono { font-family:ui-monospace,Menlo,monospace; font-size:.78rem; }
  details.doc { border:1px solid var(--line); background:var(--card); margin:7px 0; }
  details.doc > summary { cursor:pointer; padding:8px 12px; font-size:.82rem;
    display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  details.doc[open] > summary { border-bottom:1px solid var(--line); }
  .docbody { padding:12px 14px; white-space:pre-wrap; font-size:.8rem; color:var(--ink2);
    max-height:460px; overflow-y:auto; }
  .step { border-left:3px solid var(--line); padding:6px 12px; margin:8px 0; }
  .step.err { border-left-color:var(--bad); }
  .step.fin { border-left-color:var(--accent); }
  .step-head { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
  .turn { font-size:.68rem; text-transform:uppercase; letter-spacing:.08em; color:var(--mut);
    min-width:54px; }
  .tool { font-family:ui-monospace,Menlo,monospace; font-size:.8rem; font-weight:600; }
  .thought { font-style:italic; color:var(--ink2); font-size:.79rem; margin:4px 0; max-width:86ch; }
  .args, .obs { font-family:ui-monospace,Menlo,monospace; font-size:.72rem; margin:4px 0;
    word-break:break-word; }
  .args { color:var(--ink); background:var(--paper); border:1px solid var(--line); padding:5px 8px; }
  .obs { color:var(--mut); }
  table { border-collapse:collapse; font-size:.82rem; width:100%; }
  th, td { text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); }
  th { color:var(--mut); font-weight:600; font-size:.72rem; text-transform:uppercase;
    letter-spacing:.06em; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; font-family:ui-monospace,Menlo,monospace; }
  .tblwrap { overflow-x:auto; border:1px solid var(--line); background:var(--card); }
  .assert { font-size:.76rem; margin-top:4px; font-family:ui-monospace,Menlo,monospace;
    color:var(--ink2); }
  .assert .n { color:var(--bad); } .assert .y { color:var(--okc); }
  .empty { color:var(--mut); font-size:.85rem; padding:30px 4px; }
  .capnote { color:var(--warn); font-size:.75rem; margin-top:10px; }
</style>
<div class="top">
  <div class="eyebrow">lawfirm-qwen · catalog</div>
  <h1>Tasks &amp; Traces</h1>
  <p class="sub">Every task in the canonical world with its prompt, reference walk, verifier
  assertions and seeded documents — and every episode any model has run against it, with failures
  expanded turn by turn. Simulation only; all entities synthetic.</p>
  <div class="tabs" role="tablist">
    <button class="tab" role="tab" id="tab-tasks" aria-selected="true">Tasks</button>
    <button class="tab" role="tab" id="tab-traces" aria-selected="false">Traces</button>
    <button class="tab" role="tab" id="tab-models" aria-selected="false">By model</button>
  </div>
</div>
<div id="view"></div>
<script id="data" type="application/json">${json}</script>
<script>
const D = JSON.parse(document.getElementById("data").textContent);
const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const view = document.getElementById("view");
const tabs = [...document.querySelectorAll(".tab")];
let mode = "tasks", selTask = D.tasks[0]?.id, selTrace = 0;

tabs.forEach(t => t.onclick = () => {
  mode = t.id.replace("tab-", "");
  tabs.forEach(x => x.setAttribute("aria-selected", String(x === t)));
  render();
});

function pills(arr) {
  return '<div class="pills">' + arr.filter(Boolean).map(([txt, cls]) =>
    '<span class="pill ' + (cls || "") + '">' + esc(txt) + '</span>').join("") + '</div>';
}

// ------------------------------------------------------------------- tasks
function taskDetail(t) {
  const runs = D.traces.filter(x => x.task === t.id);
  const passed = runs.filter(x => x.passed).length;
  let h = '<h2>' + esc(t.id) + '</h2>' + pills([
    [t.anchor], t.family && [t.family], t.tier && [t.tier],
    [t.docs.length + " seeded docs"],
    [t.assertions.length + " assertions"],
    runs.length ? [passed + "/" + runs.length + " episodes passed",
      passed === 0 ? "no" : passed === runs.length ? "ok" : "wr"] : null,
  ]);
  h += '<div class="prompt">' + esc(t.prompt) + '</div>';
  h += '<h3>Reference walk</h3><div class="walk">' +
    (t.walk.length ? t.walk.map(esc).join(" &rarr; ") : "&mdash;") + '</div>';
  if (t.effects.length) {
    h += '<h3>Declared effects</h3><ul class="plain">' + t.effects.map(e =>
      '<li class="mono">' + esc(e.table) + " &middot; " + esc(e.op) + '</li>').join("") + '</ul>';
  }
  h += '<h3>Verifier assertions</h3><ul class="plain">' +
    (t.assertions.length ? t.assertions.map(a => '<li class="mono">' + esc(a) + '</li>').join("")
      : '<li>&mdash;</li>') + '</ul>';
  if (t.coreTables.length) {
    h += '<h3>Seeded core tables</h3><div class="mono">' + t.coreTables.map(esc).join(", ") + '</div>';
  }
  h += '<h3>Seeded documents (' + t.docs.length + ')</h3>';
  h += t.docs.length ? t.docs.map(d => {
    const s = D.docStore[d.id] || { title: "(missing)", type: "", body: "" };
    return '<details class="doc"><summary><span class="mono">#' + d.id + '</span> ' + esc(s.title) +
    '<span class="pill' + (d.input ? " wr" : "") + '">' + (d.input ? "INPUT — must read in full" : esc(s.type)) +
    '</span></summary><div class="docbody">' + esc(s.body) +
    (s.truncated ? "\\n\\n[body truncated for this page — full text in tasks/" + t.id + "/seed/documents/]" : "") +
    '</div></details>'; }).join("")
    : '<p class="empty">This task touches no documents — it works entirely on entity tables.</p>';
  if (runs.length) {
    h += '<h3>Episodes</h3><div class="tblwrap"><table><tr><th>Model</th><th>Result</th>' +
      '<th class="num">Calls</th><th class="num">Cost</th><th>Failed conditions</th></tr>' +
      runs.map(r => '<tr><td class="mono">' + esc(r.model) + '</td><td>' +
        (r.quarantine ? '<span class="pill wr">quarantined</span>'
          : r.passed ? '<span class="pill ok">pass</span>' : '<span class="pill no">fail</span>') +
        '</td><td class="num">' + r.calls + '</td><td class="num">$' + r.cost.toFixed(3) +
        '</td><td class="mono">' + esc(r.failed.join(", ") || "—") + '</td></tr>').join("") +
      '</table></div>';
  }
  return h;
}

// ------------------------------------------------------------------ traces
function traceDetail(r) {
  let h = '<h2>' + esc(r.task) + ' &middot; ' + esc(r.model) + '</h2>' + pills([
    r.retired ? ["RETIRED TASK", "wr"]
      : r.quarantine ? ["QUARANTINED", "wr"]
      : r.rescored ? ["PASS (verdict corrected)", "ok"]
      : [r.passed ? "PASS" : "FAIL", r.passed ? "ok" : "no"],
    ["reward " + r.reward],
    [r.calls + " tool calls"],
    r.turns != null ? [r.turns + "/" + r.maxTurns + " turns"] : null,
    ["$" + r.cost.toFixed(4)],
    r.surface && ["surface: " + r.surface],
  ]);
  if (r.retired) {
    h += '<div style="border-left:4px solid var(--warn);background:var(--card);padding:10px 14px;' +
      'margin:0 0 12px;font-size:.83rem;color:var(--ink2)"><strong>This task no longer exists.</strong> ' +
      esc(r.retired) + '. The episode is kept as history; ' +
      'its recorded result (<em>' + (r.passed ? "pass" : "fail") + '</em>) is excluded from every rate. ' +
      'See docs/DISCRIMINATION.md.</div>';
  }
  if (r.rescored) {
    h += '<div style="border-left:4px solid var(--okc);background:var(--card);padding:10px 14px;' +
      'margin:0 0 12px;font-size:.83rem;color:var(--ink2)"><strong>Verdict corrected.</strong> ' +
      'This episode is recorded on disk as a failure on <code>required_workflow_path</code>, but it ' +
      'completed every checkpoint — only the order of two <em>reads</em> differed from the reference ' +
      'walk, which the rule no longer grades. The path assertion is a pure function of the tool ' +
      'sequence, so this is an exact recomputation, not an estimate. See reports/PATH-RULE-RESCORE.md.</div>';
  }
  if (r.quarantine) {
    h += '<div style="border-left:4px solid var(--warn);background:var(--card);padding:10px 14px;' +
      'margin:0 0 12px;font-size:.83rem;color:var(--ink2)"><strong>This verdict is not evidence.</strong> ' +
      'It was recorded before the baseline fix, so it credits the agent for rows the task\\'s own seed ' +
      'bundle inserted. Recorded result: <em>' + (r.passed ? "pass" : "fail") + '</em>. ' +
      esc(r.quarantine) + ' &mdash; the episode must be re-run to produce a valid verdict.</div>';
  }
  h += '<div class="mono" style="color:var(--mut);font-size:.72rem">' + esc(r.file) + '</div>';
  const task = D.tasks.find(t => t.id === r.task);
  if (task) h += '<h3>Task prompt</h3><div class="prompt">' + esc(task.prompt) + '</div>';
  if (r.assertions.length) {
    h += '<h3>Verifier verdict</h3>' + r.assertions.map(a =>
      '<div class="assert"><span class="' + (a.ok ? "y" : "n") + '">' +
      (a.ok ? "PASS" : "FAIL") + '</span> ' + esc(a.name) +
      (a.detail ? ' &mdash; ' + esc(a.detail) : "") + '</div>').join("");
  }
  h += '<h3>Turn by turn (' + r.steps.length + ' steps)</h3>';
  h += r.steps.length ? r.steps.map(s =>
    '<div class="step' + (s.error ? " err" : s.final ? " fin" : "") + '">' +
    '<div class="step-head"><span class="turn">turn ' + (s.turn ?? "—") + '</span>' +
    '<span class="tool">' + esc(s.tool || "(final message)") + '</span></div>' +
    (s.thought ? '<div class="thought">' + esc(s.thought) + '</div>' : "") +
    (s.args ? '<div class="args">' + esc(JSON.stringify(s.args)) + '</div>' : "") +
    (s.obs ? '<div class="obs">' + esc(s.obs) +
      (s.more ? ' <span style="opacity:.7">…[' + s.more + ' more chars]</span>' : "") + '</div>' : "") +
    '</div>').join("")
    : '<p class="empty">Passing episode — the step record is kept on disk at ' + esc(r.file) +
      '. Only failures are expanded here.</p>';
  return h;
}

// ------------------------------------------------------------------ shell
function listPane(items, idOf, labelOf, subOf, sel, onSel, detailFn, filters) {
  const wrap = document.createElement("div");
  wrap.innerHTML = '<div class="bar">' + filters +
    '<span class="count" id="count"></span></div>' +
    '<div class="pane"><div class="list" id="list"></div><div class="detail" id="detail"></div></div>';
  view.innerHTML = ""; view.appendChild(wrap);
  const listEl = wrap.querySelector("#list"), detEl = wrap.querySelector("#detail");
  const q = wrap.querySelector("#q"), sels = [...wrap.querySelectorAll("select")];
  // Search covers seeded document text too; built lazily so load stays fast.
  const hay = it => it._h ??= (JSON.stringify(it) + " " + (it.docs ?? []).map(d => {
    const s = D.docStore[d.id]; return s ? s.title + " " + s.body : ""; }).join(" ")).toLowerCase();
  function apply() {
    const term = (q?.value || "").toLowerCase();
    const fv = sels.map(s => s.value);
    const shown = items.filter(it => {
      if (term && !hay(it).includes(term)) return false;
      return fv.every((v, i) => !v || String(it[sels[i].dataset.key]) === v);
    });
    wrap.querySelector("#count").textContent = shown.length + " of " + items.length;
    listEl.innerHTML = shown.map(it =>
      '<button class="row" data-id="' + esc(idOf(it)) + '" aria-current="' +
      (String(idOf(it)) === String(sel) ? "true" : "false") + '">' +
      '<div class="rid">' + labelOf(it) + '</div><div class="rsub">' + esc(subOf(it)) + '</div></button>'
    ).join("") || '<p class="empty" style="padding:20px">No match.</p>';
    listEl.querySelectorAll(".row").forEach(b => b.onclick = () => {
      sel = b.dataset.id; onSel(sel);
      listEl.querySelectorAll(".row").forEach(x =>
        x.setAttribute("aria-current", String(x === b)));
      const it = items.find(i => String(idOf(i)) === String(sel));
      detEl.innerHTML = it ? detailFn(it) : "";
      detEl.scrollTop = 0;
    });
    const cur = items.find(i => String(idOf(i)) === String(sel)) || shown[0];
    detEl.innerHTML = cur ? detailFn(cur) : '<p class="empty">Nothing selected.</p>';
  }
  q && (q.oninput = apply); sels.forEach(s => s.onchange = apply);
  apply();
}

function render() {
  if (mode === "tasks") {
    const anchors = [...new Set(D.tasks.map(t => t.anchor))].sort();
    listPane(D.tasks, t => t.id,
      t => esc(t.id) + (t.docs.length ? ' <span style="color:var(--mut);font-weight:400">· ' +
        t.docs.length + ' docs</span>' : ""),
      t => t.anchor + (t.family ? " · " + t.family : ""),
      selTask, v => selTask = v, taskDetail,
      '<input type="search" id="q" placeholder="Search prompts, walks, assertions, documents…">' +
      '<select data-key="anchor"><option value="">All anchors</option>' +
      anchors.map(a => '<option>' + esc(a) + '</option>').join("") + '</select>');
  } else if (mode === "traces") {
    const models = [...new Set(D.traces.map(t => t.model))].sort();
    listPane(D.traces.map((t, i) => ({ ...t, _i: i, _q: t.retired ? "retired" : t.quarantine ? "quarantined" : "clean" })),
      t => t._i,
      t => esc(t.task) + ' <span class="pill ' + (t.quarantine ? "wr" : t.passed ? "ok" : "no") + '">' +
        (t.retired ? "retired" : t.quarantine ? "quarantined" : t.rescored ? "pass ✎" : t.passed ? "pass" : "fail") + '</span>',
      t => t.model + " · " + t.calls + " calls · $" + t.cost.toFixed(3) +
        (t.failed.length ? " · " + t.failed.join(", ") : ""),
      selTrace, v => selTrace = v, traceDetail,
      '<input type="search" id="q" placeholder="Search tasks, models, failed conditions…">' +
      '<select data-key="model"><option value="">All models</option>' +
      models.map(m => '<option>' + esc(m) + '</option>').join("") + '</select>' +
      '<select data-key="passed"><option value="">Pass and fail</option>' +
      '<option value="false">Failures only</option><option value="true">Passes only</option></select>' +
      '<select data-key="_q"><option value="">All verdicts</option>' +
      '<option value="clean">Self-consistent only</option>' +
      '<option value="retired">Retired task only</option>' +
      '<option value="quarantined">Quarantined only</option></select>');
  } else {
    view.innerHTML = '<div class="detail" style="max-width:900px">' +
      '<h2>Episodes by model</h2><p class="sub">Every episode on disk. Rates are over ' +
      '<strong>self-consistent verdicts only</strong> — quarantined episodes are shown in their own ' +
      'column and excluded from the rate. Rates are also over the task subset each model actually ' +
      'ran, so this is not a like-for-like leaderboard; see the surface note in ' +
      'docs/TOOL-SURFACE-AB.md.</p><div class="tblwrap"><table>' +
      '<tr><th>Model</th><th class="num">Scored</th><th class="num">Tasks</th>' +
      '<th class="num">Passed</th><th class="num">Rate</th>' +
      '<th class="num">Quarantined</th><th class="num">Retired task</th><th class="num">Spend</th></tr>' +
      D.modelRows.map(r => '<tr><td class="mono">' + esc(r.model) + '</td>' +
        '<td class="num">' + r.n + '</td><td class="num">' + r.tasks + '</td>' +
        '<td class="num">' + (r.n ? r.pass : "—") + '</td><td class="num">' +
        (r.n ? r.rate.toFixed(1) : '<span title="every episode measured a task the current world no longer contains">no evidence</span>') + '</td>' +
        '<td class="num">' + (r.q ? r.q + (r.qPass ? " (" + r.qPass + " scored pass)" : "") : "—") +
        '</td><td class="num">' + (r.ret || "—") +
        '</td><td class="num">$' + r.cost.toFixed(2) + '</td></tr>').join("") +
      '</table></div>' +
      (D.qTotal ? '<h3>Why episodes are quarantined</h3><p class="sub">' + D.qTotal +
        ' archived verdicts (' + D.qFalsePass + ' of them recorded as <em>passes</em>) are internally ' +
        'inconsistent: the verifier\\'s own <code>reads_before_writes</code> reports <code>writes=0</code> ' +
        'while its <code>state_changed</code> / <code>rows_inserted_into_*</code> assertions credit a ' +
        'change. They were scored before the runtime captured its baseline after per-task seeding, so ' +
        'rows the seed bundle inserted were attributed to the agent. The runtime is fixed and verified; ' +
        'these traces predate it. Traces record steps and verdicts but not world state, so they cannot ' +
        'be re-scored offline — they must be re-run.</p>' : "") +
      '<h3>World</h3><div class="mono">' + D.world.tasks + ' tasks · ' + D.world.tools +
      ' tools · ' + D.world.docs + ' seeded documents</div>' +
      (D.caps.length ? '<p class="capnote">Page-size caps applied to ' + D.caps.length +
        ' fields (document bodies over 4,000 chars, tool output over 420 chars). Full text is on ' +
        'disk under tasks/&lt;id&gt;/seed/ and traces/.</p>' : "") +
      '</div>';
  }
}
render();
</script>`;

const OUT = join(ROOT, "docs", "evidence", "browser.html");
writeFileSync(OUT, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`browser.html: ${kb} KB · ${tasks.length} tasks · ${traces.length} traces ` +
  `(${traces.filter((t) => !t.passed).length} failed, expanded turn-by-turn) · ` +
  `${modelRows.length} models · ${caps.length} fields capped`);
console.log(`quarantined verdicts excluded from all rates: ${qTotal} ` +
  `(${qFalsePass} of them recorded as passes)`);
