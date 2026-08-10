#!/usr/bin/env node
/**
 * Failed-trace viewer builder — renders the ACTUAL turn-by-turn record of
 * exemplar failing episodes (one per failure mode per model), straight from
 * the episode files: every thought, every tool call with its arguments, every
 * observation, and the verifier's per-assertion verdict. Plus one historical
 * hosted-push trace annotated with the audit finding (output-cap truncation).
 *
 * Output: docs/evidence/traces.html
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function loadEp(engine, file) {
  return JSON.parse(readFileSync(join(ROOT, "data", "leaderboard", "episodes", engine, file), "utf8"));
}

const EXEMPLARS = [
  {
    engine: "deepseek-chat", label: "DeepSeek V3.2", file: "task_026-t1.json",
    mode: "Off-task record creation (side-copies)",
    note: "The model does the task RIGHT — finds the deal folder, reads four documents in full, files the red-flags report with draft_matter_document (that insert succeeded and satisfied the core check) — and then ALSO creates a duplicate copy via document_agent into the agent_documents table. That undeclared row trips the world's scope guards, which veto the reward. The failure is discipline, not capability.",
  },
  {
    engine: "deepseek-chat", label: "DeepSeek V3.2", file: "task_001-t1.json",
    mode: "Workflow shortcut / checkpoint order",
    note: "The required playbook is list → get → create. The model calls get FIRST (id was in the prompt), then list, then create. Every call succeeds and the row lands — but the ordered-checkpoint contract is violated (get before list), so required_workflow_path fails. Strict by design; identical to the hosted grading.",
  },
  {
    engine: "deepseek-chat", label: "DeepSeek V3.2", file: "task_085-t1.json",
    mode: "Hidden-checkpoint miss + side-write",
    note: "The prompt says 'review the matter details, then record an amount history entry.' The verifier's required path includes an operations_records_agent review checkpoint the prompt never names. The model reviews via get + audit_list instead (reasonable, but not the declared checkpoint) and files an extra review record the task never declared — two contract violations, zero capability failures. This family (records-research) is why both models score ~0–22 on it.",
  },
  {
    engine: "claude-haiku-4-5", label: "Claude Haiku 4.5", file: "task_003-t1.json",
    mode: "Deliverable left in chat",
    note: "Haiku queries the folder, reads the input document — then writes the entire antitrust memo into its final chat message and never calls draft_matter_document. The record system never changes: state_changed fails. The task prompt explicitly says 'Create a new matter documents record titled … containing the full deliverable text in its body.' Across all 388 Haiku episodes it made zero malformed draft calls — when it drafts, it drafts cleanly — so this is instruction-following, not emission capability.",
  },
  {
    engine: "claude-haiku-4-5", label: "Claude Haiku 4.5", file: "task_006-t1.json",
    mode: "Friction non-recovery",
    note: "The world injects seeded API friction (3% of calls). Haiku hits rate_limited / stale_reference errors mid-run; instead of retrying the same call (which succeeds on retry — that's the designed recovery), it wanders into alternate reads and ends the episode without ever filing the deliverable.",
  },
  {
    engine: "claude-haiku-4-5", label: "Claude Haiku 4.5", file: "task_015-t1.json",
    mode: "Workflow shortcut (skipped checkpoints)",
    note: "The required path is list → get → amount_history_create → review_create. Haiku jumps straight to the writes it considers essential and skips required read checkpoints — the outcome rows exist, but the evidence chain the contract demands was never walked.",
  },
];

// ------------------------------------------------------------- hosted trace
const hosted = JSON.parse(readFileSync(join(ROOT, "data", "flake", "flaky-trajectories.json"), "utf8"));
const hostedFail = hosted.trajectories.find((t) =>
  t.task_id === "task_127" &&
  (t.steps ?? []).filter((s) => /missing 3 required/.test(s.observation ?? "")).length >= 2);

// ---------------------------------------------------------------- renderers
function stepHtml(s, i) {
  const argStr = JSON.stringify(s.args ?? s.arguments ?? {}, null, 0) ?? "{}";
  const argShown = argStr.length > 700
    ? esc(argStr.slice(0, 700)) + `<span class="mut"> …[${argStr.length.toLocaleString()} chars total]</span>`
    : esc(argStr);
  const isFinal = s.tool === "_final_answer";
  const obs = String(s.observation ?? "");
  return `<div class="step ${s.ok === false ? "err" : ""} ${isFinal ? "final" : ""}">
    <div class="step-head"><span class="turn">turn ${s.turn ?? i + 1}</span>
      <span class="tool">${esc(isFinal ? "— final answer (no tool call) —" : s.tool)}</span>
      ${s.argParseError ? '<span class="flag">arguments failed to parse → sent as {}</span>' : ""}
      ${s.ok === false ? '<span class="flag err-flag">TOOL ERROR</span>' : ""}</div>
    ${s.thought ? `<div class="thought">💭 ${esc(String(s.thought).slice(0, 600))}${String(s.thought).length > 600 ? "…" : ""}</div>` : ""}
    ${!isFinal ? `<div class="args">${argShown}</div>` : ""}
    <div class="obs">${esc(obs.slice(0, 500))}${obs.length > 500 ? `<span class="mut"> …[${obs.length.toLocaleString()} chars]</span>` : ""}</div>
  </div>`;
}

function stepsHtml(steps) {
  if (steps.length <= 26) return steps.map(stepHtml).join("\n");
  const head = steps.slice(0, 10), tail = steps.slice(-12);
  return head.map(stepHtml).join("\n") +
    `<div class="omit">⋯ ${steps.length - 22} intermediate steps omitted (full trace in the episode file) ⋯</div>` +
    tail.map((s, i) => stepHtml(s, steps.length - 12 + i)).join("\n");
}

function verdictHtml(ep) {
  const failing = (ep.assertions ?? []).filter((a) => !a.passed);
  return `<div class="verdict">
    <div class="verdict-head">VERIFIER VERDICT: <span class="bad">FAILED</span> — ${esc((ep.failedConditions ?? []).join(", "))} · reward ${ep.reward ?? 0}</div>
    ${failing.map((a) => `<div class="assert"><strong>${esc(a.name)}</strong>: ${esc(String(a.details ?? "").slice(0, 260))}</div>`).join("")}
  </div>`;
}

const worldRaw = JSON.parse(readFileSync(join(ROOT, "world", "blobfish", "world-expanded.json"), "utf8"));
const world = worldRaw.world ?? worldRaw;
function taskPrompt(id) {
  return world.tasks.find((t) => t.task_id === id)?.prompt ?? "";
}

const sections = EXEMPLARS.map((ex) => {
  let ep;
  try { ep = loadEp(ex.engine, ex.file); } catch { return ""; }
  return `<section class="trace">
    <h2>${esc(ex.label)} · ${esc(ep.taskId)} · <span class="mode">${esc(ex.mode)}</span></h2>
    <p class="note">${esc(ex.note)}</p>
    <p class="meta">episode <code>data/leaderboard/episodes/${ex.engine}/${ex.file}</code> · ${ep.toolCalls} tool calls · ${ep.turnsUsed}/${ep.maxTurns} turns · $${ep.costUsd}</p>
    <details open><summary>Task prompt</summary><div class="prompt">${esc(taskPrompt(ep.taskId))}</div></details>
    ${stepsHtml(ep.steps ?? [])}
    ${verdictHtml(ep)}
  </section>`;
}).join("\n");

let hostedSection = "";
if (hostedFail) {
  hostedSection = `<section class="trace artifact-note">
    <h2>Historical: the hosted push's "emission collapse" — reclassified as a harness artifact</h2>
    <p class="note">This is a verbatim trace from the ORIGINAL hosted boundary push (deepseek-v4-flash,
    ${esc(hostedFail.frontier_push ?? "")}), the mode the shipped failure report called dominant. The audit
    (docs/AUDIT.md) showed these empty draft calls are the 4,096-token output cap slicing the tool-call JSON
    mid-string — parse failure → {} → "missing 3 required positional arguments". Note the thoughts: the model
    believes it is fixing the arguments; the harness never let the arguments through. At an 8,192 cap this
    mode disappeared entirely (zero parse errors across 547 local DeepSeek draft calls).</p>
    <p class="meta">trace <code>${esc(hostedFail.id)}</code> · task ${esc(hostedFail.task_id)} · model ${esc(hostedFail.model)} (hosted)</p>
    ${stepsHtml((hostedFail.steps ?? []).map((s, i) => ({ ...s, args: s.arguments, turn: s.step ?? i + 1, ok: !/missing \d+|ERROR/i.test(s.observation ?? "") })))}
    <div class="verdict"><div class="verdict-head">HOSTED VERDICT: <span class="bad">FAILED</span> — the run never recovered from the truncated emissions</div></div>
  </section>`;
}

const html = `<meta charset="utf-8">
<title>lawfirm-qwen — Failed Episode Traces, Turn by Turn</title>
<style>
  :root { --paper:#f9f9f7; --card:#fff; --ink:#1c2128; --ink2:#57606d; --mut:#8a919c;
    --line:#e4e5e1; --accent:#33415e; --bad:#e34948; --okc:#008300; --warn:#c98500; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --paper:#16161a; --card:#1e1e23; --ink:#eceae2; --ink2:#b9bcc4; --mut:#868c96;
    --line:#2e2e34; --accent:#9fb2d8; --bad:#e66767; --okc:#4cae4c; --warn:#d9a441; } }
  :root[data-theme="dark"] { --paper:#16161a; --card:#1e1e23; --ink:#eceae2; --ink2:#b9bcc4;
    --mut:#868c96; --line:#2e2e34; --accent:#9fb2d8; --bad:#e66767; --okc:#4cae4c; --warn:#d9a441; }
  * { box-sizing:border-box; } body { background:var(--paper); color:var(--ink); margin:0;
    font:15px/1.5 system-ui,-apple-system,sans-serif; }
  .wrap { max-width:1000px; margin:0 auto; padding:36px 22px 80px; }
  h1,h2 { font-family:Georgia,serif; text-wrap:balance; }
  h1 { font-size:1.7rem; margin:0 0 4px; } h2 { font-size:1.15rem; margin:0 0 4px; }
  .eyebrow { text-transform:uppercase; letter-spacing:.14em; font-size:.7rem; color:var(--mut);
    font-weight:600; margin-bottom:8px; }
  .note { color:var(--ink2); font-size:.87rem; max-width:80ch; }
  .meta { color:var(--mut); font-size:.75rem; }
  .mode { color:var(--warn); }
  section.trace { background:var(--card); border:1px solid var(--line); padding:18px 20px;
    margin-top:26px; }
  section.artifact-note { border-left:4px solid var(--bad); }
  .prompt { font-size:.82rem; color:var(--ink2); border:1px dashed var(--line); padding:8px 12px;
    margin:6px 0 10px; max-width:88ch; }
  .step { border-left:3px solid var(--line); padding:6px 12px; margin:8px 0; }
  .step.err { border-left-color:var(--bad); }
  .step.final { border-left-color:var(--accent); }
  .step-head { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
  .turn { font-size:.68rem; text-transform:uppercase; letter-spacing:.08em; color:var(--mut);
    min-width:52px; }
  .tool { font-family:ui-monospace,Menlo,monospace; font-size:.82rem; font-weight:600; }
  .flag { font-size:.68rem; padding:1px 7px; border-radius:9px; background:var(--paper);
    border:1px solid var(--warn); color:var(--warn); }
  .flag.err-flag { border-color:var(--bad); color:var(--bad); }
  .thought { font-style:italic; color:var(--ink2); font-size:.8rem; margin:4px 0; max-width:86ch; }
  .args { font-family:ui-monospace,Menlo,monospace; font-size:.72rem; color:var(--ink);
    background:var(--paper); border:1px solid var(--line); padding:6px 8px; margin:4px 0;
    word-break:break-all; max-width:100%; }
  .obs { font-size:.76rem; color:var(--mut); font-family:ui-monospace,Menlo,monospace;
    word-break:break-word; }
  .omit { text-align:center; color:var(--mut); font-size:.78rem; padding:6px; }
  .verdict { border:1px solid var(--bad); background:var(--paper); padding:10px 14px; margin-top:12px; }
  .verdict-head { font-weight:650; font-size:.85rem; }
  .assert { font-size:.76rem; color:var(--ink2); margin-top:5px; font-family:ui-monospace,Menlo,monospace; }
  .bad { color:var(--bad); } code { font-family:ui-monospace,Menlo,monospace; font-size:.85em;
    background:var(--paper); border:1px solid var(--line); padding:1px 4px; border-radius:3px; }
  details summary { cursor:pointer; font-size:.8rem; color:var(--accent); }
</style>
<div class="wrap">
  <div class="eyebrow">lawfirm-qwen · run evidence · failed episodes, turn by turn</div>
  <h1>What failure actually looks like</h1>
  <p class="note">Verbatim step records from failing episodes — the model's thought (when the API returns
  one), the exact tool call and arguments it emitted, the world's response, and the verifier's
  per-assertion verdict. One exemplar per failure mode per model; every other failing episode is on disk
  under <code>data/leaderboard/episodes/</code> in the same format. Simulation only — all entities synthetic.</p>
  ${sections}
  ${hostedSection}
  <footer class="note" style="margin-top:36px">Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC ·
  <code>node docs/evidence/build-traces.mjs</code></footer>
</div>`;

writeFileSync(join(ROOT, "docs", "evidence", "traces.html"), html);
console.log(`traces page: ${(html.length / 1024).toFixed(0)} KB, ${EXEMPLARS.length} exemplars + ${hostedFail ? 1 : 0} hosted`);
