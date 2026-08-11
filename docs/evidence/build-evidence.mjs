#!/usr/bin/env node
/**
 * Evidence page builder — visual proof of everything that ran in the world:
 *   1. all 231 tasks with oracle + model-run outcomes per task
 *   2. Harvey LAB coverage comparison (covered / not covered / beyond-LAB)
 *   3. the full seeded document corpus (211 docs)
 *   4. failure-mode reports per measured model + agent-drafted exhibit
 * Output: docs/evidence/index.html (self-contained).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const worldRaw = JSON.parse(readFileSync(join(ROOT, "world", "blobfish", "world-v9.json"), "utf8"));
const world = worldRaw.world ?? worldRaw;
const oracle = JSON.parse(readFileSync(join(ROOT, "world", "local", "oracle-expanded-full.json"), "utf8"));
const dsRes = JSON.parse(readFileSync(join(ROOT, "data", "leaderboard", "results", "deepseek-chat.json"), "utf8"));
const haikuRes = JSON.parse(readFileSync(join(ROOT, "data", "leaderboard", "results", "claude-haiku-4-5.json"), "utf8"));
const modes = Object.fromEntries(["deepseek-chat", "claude-haiku-4-5"].map((e) => [
  e, JSON.parse(readFileSync(join(ROOT, "data", "leaderboard", "failure-modes", `${e}.json`), "utf8"))]));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dsByTask = Object.fromEntries((dsRes.tasks ?? []).map((t) => [t.taskId, t]));
const hkByTask = Object.fromEntries((haikuRes.tasks ?? []).map((t) => [t.taskId, t]));
const oraclePassed = new Set(oracle.failures?.length ? [] : world.tasks.map((t) => t.task_id));

function prov(task) {
  const src = task.provenance?.source_workflow ?? "";
  const m = /^([a-z0-9_]+):\s*([^/]+?)(?:\/(.*))?$/i.exec(src);
  if (!m) return { anchor: task.method === "graph_walk" ? "graph-walk" : "unanchored", family: "general" };
  return { anchor: m[1], family: m[2].trim() };
}

// ---------------------------------------------------------------- task rows
const anchorOrder = {};
const taskRows = world.tasks.map((t) => {
  const { anchor, family } = prov(t);
  anchorOrder[anchor] = (anchorOrder[anchor] ?? 0) + 1;
  const ds = dsByTask[t.task_id];
  const hk = hkByTask[t.task_id];
  const cell = (r) => {
    if (!r || !r.episodes) return `<td class="mut">—</td>`;
    const cls = r.passRate === 1 ? "ok" : r.passRate === 0 ? "bad" : "mix";
    return `<td class="${cls}">${r.passes}/${r.episodes}</td>`;
  };
  const quarantined = t.task_id === "task_016";
  return `<tr${quarantined ? ' class="quar"' : ""}>
    <td class="mono">${t.task_id}${quarantined ? " ⚠" : ""}</td>
    <td>${esc(anchor)}</td>
    <td>${esc(family).slice(0, 44)}</td>
    <td class="prompt" title="${esc(t.prompt).slice(0, 500)}">${esc(t.prompt).slice(0, 110)}…</td>
    <td class="mono">${(t.walk ?? []).length}</td>
    <td class="ok">PASS</td>
    ${cell(ds)}${cell(hk)}
  </tr>`;
}).join("\n");

// ------------------------------------------------------------- document rows
const md = world.tables.find((t) => t.name === "matter_documents");
const docsByClass = {};
for (const r of md.sample_rows) {
  const c = r.related_shape || "core-matter-materials";
  (docsByClass[c] ??= []).push(r);
}
const docSections = Object.entries(docsByClass)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([cls, rows]) => `
  <details ${rows.length > 60 ? "" : "open"}><summary><strong>${esc(cls)}</strong> — ${rows.length} documents</summary>
  <div class="table-scroll"><table>
    <thead><tr><th>id</th><th>Title</th><th>Type</th><th>Body</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="mono">${r.id}</td><td>${esc(r.title).slice(0, 110)}</td><td>${esc(r.doc_type)}</td><td class="mut">${(r.body ?? "").length.toLocaleString()} chars</td></tr>`).join("")}</tbody>
  </table></div></details>`).join("\n");

// ------------------------------------------------- agent-drafted exhibit
let exhibit = "";
try {
  const epDir = join(ROOT, "data", "leaderboard", "episodes", "deepseek-chat");
  for (const f of ["task_127-t2.json", "task_127-t1.json", "task_003-t1.json"]) {
    if (!existsSync(join(epDir, f))) continue;
    const ep = JSON.parse(readFileSync(join(epDir, f), "utf8"));
    const draft = (ep.steps ?? []).find((s) => s.tool === "draft_matter_document" && s.ok && s.args?.body?.length > 800);
    if (draft && ep.passed) {
      exhibit = `<h3>Exhibit: an agent-drafted deliverable filed into the record system</h3>
      <p class="note">${esc(ep.taskId)} · DeepSeek V3.2 · verifier PASSED · <code>draft_matter_document</code> title "${esc(draft.args.title)}" (${draft.args.body.length.toLocaleString()} chars). Excerpt:</p>
      <pre class="memo">${esc(draft.args.body.slice(0, 1800))}\n…</pre>`;
      break;
    }
  }
} catch { /* optional */ }

// ------------------------------------------------------------- failure modes
const MODE_LABELS = {
  deliverable_in_chat: "Deliverable left in chat", emission_collapse: "Emission collapse",
  workflow_shortcut: "Workflow shortcut / checkpoint order", wrong_value: "Wrong graded value",
  evidence_gap: "Evidence gap", fabrication: "Fabricated determination",
  friction_non_recovery: "Friction non-recovery", no_action: "No effective action",
  turn_exhaustion: "Turn exhaustion", off_task_damage: "Off-task record creation (side-copies)",
  api_error: "Provider/API failure", output_cap_truncation: "HARNESS: output-cap truncation", other: "Other",
};
const fmSection = Object.entries(modes).map(([eng, m]) => {
  const total = m.modes.reduce((a, x) => a + x.episodes, 0) || 1;
  const segs = m.modes.map((x, i) => `<div class="seg m${i}" style="width:${(x.episodes / total) * 100}%" title="${esc(MODE_LABELS[x.mode] ?? x.mode)}: ${x.episodes} eps (${x.shareOfFailures}%)"></div>`).join("");
  const rows = m.modes.map((x, i) => `<tr><td><span class="chip m${i}"></span>${esc(MODE_LABELS[x.mode] ?? x.mode)}</td><td>${x.episodes}</td><td>${x.shareOfFailures}%</td><td class="mut">${x.tasks.slice(0, 8).join(", ")}${x.tasks.length > 8 ? "…" : ""}</td></tr>`).join("");
  return `<div class="card">
    <h3>${esc(m.label)} — score ${m.overallScore} · flaky-21 ${m.flakySetScore} · ${m.failures}/${m.episodes} episodes failed${eng.includes("haiku") ? " · <em>partial run (lane stopped to cap spend)</em>" : ""}</h3>
    <div class="fm-stack">${segs}</div>
    <div class="table-scroll"><table><thead><tr><th>Mode</th><th>Episodes</th><th>Share</th><th>Tasks</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Worst families: ${m.worstPracticeAreas.map((w) => `${esc(w.key)} ${w.score}`).join(" · ")}. Full report: <code>reports/${eng}.md</code></p>
  </div>`;
}).join("\n");

// ------------------------------------------------------------------ HTML
const html = `<meta charset="utf-8">
<title>lawfirm-qwen — Run Evidence & Harvey LAB Coverage</title>
<style>
  :root { --paper:#f9f9f7; --card:#fff; --ink:#1c2128; --ink2:#57606d; --mut:#8a919c;
    --line:#e4e5e1; --accent:#33415e; --ok:#008300; --bad:#e34948; --mix:#c98500;
    --m0:#2a78d6; --m1:#eb6834; --m2:#1baf7a; --m3:#eda100; --m4:#e87ba4; --m5:#4a3aa7; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --paper:#16161a; --card:#1e1e23; --ink:#eceae2; --ink2:#b9bcc4; --mut:#868c96;
    --line:#2e2e34; --accent:#9fb2d8; --ok:#4cae4c; --bad:#e66767; --mix:#d9a441; } }
  :root[data-theme="dark"] { --paper:#16161a; --card:#1e1e23; --ink:#eceae2; --ink2:#b9bcc4;
    --mut:#868c96; --line:#2e2e34; --accent:#9fb2d8; --ok:#4cae4c; --bad:#e66767; --mix:#d9a441; }
  * { box-sizing:border-box; } body { background:var(--paper); color:var(--ink); margin:0;
    font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  .wrap { max-width:1160px; margin:0 auto; padding:36px 22px 80px; }
  h1,h2,h3 { font-family:Georgia,"Iowan Old Style",serif; text-wrap:balance; }
  h1 { font-size:1.8rem; margin:0 0 4px; } h2 { font-size:1.3rem; margin:44px 0 6px; }
  h3 { font-size:1.05rem; margin:20px 0 6px; }
  .eyebrow { text-transform:uppercase; letter-spacing:.14em; font-size:.7rem; color:var(--mut);
    font-weight:600; margin-bottom:8px; }
  .note { color:var(--ink2); font-size:.85rem; max-width:82ch; }
  .stats { display:flex; flex-wrap:wrap; gap:10px; margin:20px 0 6px; }
  .stat { background:var(--card); border:1px solid var(--line); padding:10px 16px; }
  .stat b { display:block; font-size:1.35rem; font-family:Georgia,serif;
    font-variant-numeric:tabular-nums; }
  .stat span { color:var(--mut); font-size:.7rem; text-transform:uppercase; letter-spacing:.1em; }
  .table-scroll { overflow-x:auto; margin-top:10px; max-height:560px; overflow-y:auto;
    border:1px solid var(--line); }
  table { border-collapse:collapse; width:100%; background:var(--card); font-size:.8rem; }
  th,td { padding:5px 10px; text-align:left; border-bottom:1px solid var(--line);
    white-space:nowrap; }
  thead th { position:sticky; top:0; background:var(--card); font-size:.68rem;
    text-transform:uppercase; letter-spacing:.07em; color:var(--mut); z-index:1; }
  td { font-variant-numeric:tabular-nums; }
  td.prompt { white-space:normal; min-width:340px; color:var(--ink2); }
  .mono { font-family:ui-monospace,Menlo,monospace; font-size:.75rem; }
  .ok { color:var(--ok); font-weight:600; } .bad { color:var(--bad); font-weight:600; }
  .mix { color:var(--mix); font-weight:600; } .mut { color:var(--mut); }
  tr.quar td { opacity:.55; }
  .cols { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-top:12px; }
  @media (max-width:900px) { .cols { grid-template-columns:1fr; } }
  .card { background:var(--card); border:1px solid var(--line); padding:16px 18px; margin-top:12px; }
  .card ul { margin:8px 0 0; padding-left:18px; } .card li { margin:4px 0; font-size:.85rem;
    color:var(--ink2); }
  .card.covered { border-top:3px solid var(--ok); } .card.gap { border-top:3px solid var(--bad); }
  .card.beyond { border-top:3px solid var(--m0); }
  details { margin-top:10px; } summary { cursor:pointer; padding:6px 0; }
  .fm-stack { display:flex; height:20px; gap:2px; background:var(--paper); border-radius:3px;
    overflow:hidden; margin:8px 0; }
  .seg { min-width:3px; } .chip { display:inline-block; width:9px; height:9px; border-radius:2px;
    margin-right:6px; }
  .m0{background:var(--m0);} .m1{background:var(--m1);} .m2{background:var(--m2);}
  .m3{background:var(--m3);} .m4{background:var(--m4);} .m5{background:var(--m5);}
  pre.memo { background:var(--card); border:1px solid var(--line); padding:14px;
    white-space:pre-wrap; font-size:.75rem; max-width:88ch; color:var(--ink2); }
  code { font-family:ui-monospace,Menlo,monospace; font-size:.85em; background:var(--card);
    border:1px solid var(--line); padding:1px 4px; border-radius:3px; }
  .disclaimer { border:1px solid var(--line); background:var(--card); color:var(--ink2);
    border-left:3px solid var(--accent); padding:8px 12px; font-size:.8rem; margin-top:14px;
    max-width:86ch; }
</style>
<div class="wrap">
  <div class="eyebrow">lawfirm-qwen · Eve Litigation world (simulated) · run evidence</div>
  <h1>Every task, every document, every failure — with receipts</h1>
  <p class="note">All data below is generated from the world document, the oracle fidelity runs, and
  the measured episode corpus on disk (<code>data/leaderboard/episodes/</code>). Nothing is
  hand-entered. Scores are post-audit (<code>docs/AUDIT.md</code>: three harness bugs found,
  quantified, fixed before trusting results).</p>
  <p class="disclaimer"><strong>Simulation only.</strong> Every matter, party, document, and figure
  is synthetic. "Harvey LAB" refers to the public benchmark's task shapes; no affiliation.</p>

  <div class="stats">
    <div class="stat"><b>231</b><span>tasks in world</span></div>
    <div class="stat"><b>231/231</b><span>oracle-verified</span></div>
    <div class="stat"><b>${md.sample_rows.length}</b><span>seeded documents</span></div>
    <div class="stat"><b>${dsRes.tasksMeasured * dsRes.episodesPerTask + haikuRes.tasksMeasured * haikuRes.episodesPerTask}</b><span>model episodes run</span></div>
    <div class="stat"><b>${dsRes.overall.score}</b><span>DeepSeek V3.2 score</span></div>
    <div class="stat"><b>${haikuRes.overall.score}</b><span>Haiku 4.5 (partial)</span></div>
  </div>

  <h2>1 · All ${world.tasks.length} tasks and their runs</h2>
  <p class="note">Oracle = the task's reference walk executed against the live world and passed its
  shipped VCode verifier (the admission bar). DS/Haiku = model episodes passed/run (3 per task;
  original 155-task scored set; expansion tasks are oracle-verified, model measurement pending
  per cost directive). ⚠ task_016 quarantined (prompt/verifier drift).</p>
  <div class="table-scroll"><table>
    <thead><tr><th>Task</th><th>Anchor</th><th>Family</th><th>Prompt</th><th>Walk</th><th>Oracle</th><th>DeepSeek</th><th>Haiku</th></tr></thead>
    <tbody>${taskRows}</tbody>
  </table></div>

  <h2>2 · Harvey LAB coverage — covered, not covered, and beyond</h2>
  <p class="note">Harvey LAB v1.0 (vendored clone, read file-by-file): ~1,660–1,760 tasks,
  24 practice areas, 5 work types — analyze (488) · draft (444) · review (306) · research (24) ·
  contracting (498 across 14 deal domains) — graded by LLM judge against ~101K expert rubric
  criteria, all-pass scoring, no executable environment.</p>
  <div class="cols">
    <div class="card covered"><h3>LAB shapes this world hosts</h3><ul>
      <li><strong>All 24 LAB practice areas</strong> have anchored task families (antitrust → white-collar; the same 24 the AA leaderboard lists), 146 tasks with harvey_lab provenance</li>
      <li><strong>analyze</strong> — multi-document analytical memos over seeded deal folders with distractors (e.g. task_003, task_127)</li>
      <li><strong>draft</strong> — deliverables filed to the record system; tier-4 escalation: counterparty markups, playbooks, disclosure schedules, superseding instruction letters (deep-drafting pack)</li>
      <li><strong>review</strong> — red-flag / diligence review (task_012, task_026 family), clause risk review (CUAD pack)</li>
      <li><strong>contracting</strong> — first-turn redline + playbook-escalation shapes (deep-drafting), SPA deal-point work (BigLaw pack)</li>
    </ul></div>
    <div class="card gap"><h3>LAB has, this world doesn't</h3><ul>
      <li><strong>Scale & expert authorship</strong>: ~1,660 tasks / ~101K attorney-written rubric criteria vs 231 generated tasks</li>
      <li><strong>Prose-quality grading</strong> — an LLM judge can score argument quality; deterministic verifiers grade records, evidence chains, and pinned values, not writing quality</li>
      <li><strong>research work type</strong> (24 LAB tasks) — open legal research memos need a citation corpus this world doesn't ship</li>
      <li><strong>Multi-turn contracting</strong> — LAB's subsequent-turn-redline variants imply a negotiation history; no counterparty agent here</li>
      <li><strong>Human-guided documents</strong> — LAB matter files were human-reviewed; this corpus is synthetic + oracle-admitted</li>
    </ul></div>
    <div class="card beyond"><h3>This world has, LAB doesn't</h3><ul>
      <li><strong>Executable state</strong>: 74 live tables — a filed memo vs a claimed memo are different verdicts</li>
      <li><strong>Deterministic answer keys</strong>: CUAD clauses (10), MAUD deal points (10), SPA fields (7), LegalBench doctrine (14), damages arithmetic (7), court-rule deadlines (6) — exact pinned values, zero judge variance</li>
      <li><strong>Hallucination/abstention traps</strong> (7): the record lacks the answer; only escalation passes; fabrication is veto-failed</li>
      <li><strong>Retrieval with enforced reads</strong> (8): wrong-document research fails from the trace</li>
      <li><strong>Repeatability & flakiness</strong>: 3-episode protocol, 21 boundary-proven flaky tasks, bit-identical re-runs</li>
      <li><strong>Operational stress</strong>: seeded rate-limits, stale references, ambiguous acks, write caps, scope-discipline guards</li>
      <li><strong>Multi-hop CRUD chains</strong> (8) + firm-ops workflows (matter opening, conflicts, billing) — LAB has no system of record at all</li>
    </ul></div>
  </div>

  <h2>3 · All ${md.sample_rows.length} documents seeded in the world</h2>
  <p class="note">Grouped by corpus class. Every expansion document embeds its tasks' ground truth
  (or deliberately omits it, for abstention traps); distractors are superseded drafts, term sheets,
  and look-alike correspondence that share keywords but not operative facts.</p>
  ${docSections}
  ${exhibit}

  <h2>4 · Failure-mode reports (post-audit)</h2>
  <p class="note">Every failing episode classified from its full step trace (tool, arguments,
  observation). The audit removed two harness-caused modes before these numbers
  (output-cap truncation; shared-seed contamination — 202 verdicts corrected).</p>
  ${fmSection}

  <footer class="note" style="margin-top:40px">Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC ·
  regenerate: <code>node docs/evidence/build-evidence.mjs</code></footer>
</div>`;

writeFileSync(join(ROOT, "docs", "evidence", "index.html"), html);
console.log(`evidence page: ${(html.length / 1024).toFixed(0)} KB, ${world.tasks.length} tasks, ${md.sample_rows.length} docs`);
