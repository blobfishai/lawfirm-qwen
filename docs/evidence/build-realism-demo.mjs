#!/usr/bin/env node
/**
 * Realism demo — drives the live world over MCP and captures REAL request/
 * response pairs, then renders them beside the seeded documents they read
 * from. Nothing here is illustrative: every JSON body on the page came back
 * from the running server during this build.
 *
 * Prereq: a world server (default :8980 = world-v4 + v3 contracts).
 * Run:    node docs/evidence/build-realism-demo.mjs [--base http://127.0.0.1:8980]
 * Output: docs/evidence/realism.html + data/research/realism-transcript.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const BASE = (argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : "http://127.0.0.1:8980").replace(/\/$/, "");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const world = (() => { const r = JSON.parse(readFileSync(join(ROOT, "world", "blobfish", "world-v12.json"), "utf8")); return r.world ?? r; })();
const mdRows = world.tables.find((t) => t.name === "matter_documents").sample_rows;
const docById = new Map(mdRows.map((r) => [r.id, r]));

let sessionId = null, rpc = 0;
async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function call(name, args) {
  const r = await post("/mcp", { jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } });
  const res = r.result ?? {};
  return { ok: !res.isError, text: (res.content ?? []).map((c) => c.text ?? "").join("\n") };
}

// ---- the demo script: one realistic scene per firm system -----------------
const SCENES = [
  {
    system: "practice-management (Clio-mirrored)", persona: "Billing partner, Monday prebill review",
    story: "Pull the matter, record today's work with a UTBMS code, and move the prebill forward — the same three calls a billing partner makes every week.",
    steps: [
      ["matters_get", { id: 1 }],
      ["time_entries_create", { matter_id: 1, user_id: 2, date: "2026-08-11", quantity_hours: 1.8, rate: 425, description: "Review counterparty markup; call with client re fallback positions", utbms_task_code: "L120" }],
      ["bills_list", { state: "draft", limit: 2 }],
    ],
  },
  {
    system: "practice-management — trust accounting", persona: "Trust accountant, month-end three-way reconciliation",
    story: "The client ledger must never go negative. Matter 3 is healthy (funded, then spent); matter 10 is one of two deliberately overdrawn ledgers the compliance-sweep task must find. Deposits are positive, disbursements negative, and every memo matches its transaction kind — a post-seed coherence pass enforces that a trust account is funded before it is spent.",
    steps: [
      ["trust_transactions_list", { matter_id: 3 }],
      ["trust_balance_get", { matter_id: 3 }],
      ["trust_transactions_list", { matter_id: 10 }],
      ["trust_balance_get", { matter_id: 10 }],
    ],
  },
  {
    system: "docket-records (CourtListener-mirrored)", persona: "Associate cite-checking a brief",
    story: "One citation resolves, one does not. The tool returns an honest empty result rather than inventing an opinion — the property that makes hallucination gradeable.",
    steps: [
      ["citation_lookup", { text: "821 Sim. 3d 926" }],
      ["citation_lookup", { text: "999 Sim. 9d 999" }],
      ["dockets_search", { q: "Talvern" }],
    ],
  },
  {
    system: "ediscovery (Relativity-mirrored)", persona: "Review attorney working a privilege batch",
    story: "Query the batch, open the document's extracted text, code it. Note the Relativity-native envelope: Objects / TotalCount / ArtifactID.",
    steps: [
      ["documents_query", { workspace_id: 3, privileged: "yes", length: 3 }],
      ["review_documents_get", { id: 2 }],
    ],
  },
  {
    system: "ebilling (LEDES 1998B)", persona: "E-billing coordinator before submission",
    story: "The line items come back keyed by the real LEDES 1998B field names, and the reconciliation exposes a genuine header-vs-lines mismatch seeded into invoice 2.",
    steps: [
      ["invoice_lines_list", { invoice_id: 2, limit: 3 }],
      ["invoice_total_check", { invoice_id: 2 }],
      ["invoices_get", { id: 2 }],
    ],
  },
  {
    system: "dms (iManage-mirrored)", persona: "Associate taking a document out to revise it",
    story: "Checkout locks the document; a second person's checkout is refused with a 409, exactly like a real DMS.",
    steps: [
      ["documents_get", { id: 5 }],
      ["documents_checkout", { id: 5, checked_out_by: "aiko.tanaka" }],
      ["documents_checkout", { id: 5, checked_out_by: "someone.else" }],
    ],
  },
  {
    system: "workspace (Google-mirrored)", persona: "Paralegal building a chronology from email",
    story: "Gmail-native shapes: a message list with resultSizeEstimate, then a full message resource with payload.headers.",
    steps: [
      ["gmail_messages_list", { q: "Settlement", maxResults: 3 }],
      ["gmail_messages_get", { id: 9 }],
    ],
  },
  {
    system: "seeded document corpus", persona: "Associate opening the matter folder",
    story: "The documents the tasks grade against are full legal drafting, not lorem — a precedent clause from the ACORD-anchored library and a regulatory chapter from the ObliQA-anchored pack.",
    steps: [
      ["query_matter_documents", { title: "Clause library — CL-105", limit: 2 }],
      ["read_matter_document", { id: (mdRows.find((r) => /CL-105/.test(r.title)) ?? {}).id }],
      ["read_matter_document", { id: (mdRows.find((r) => /AML Rulebook Chapter 14/.test(r.title)) ?? {}).id }],
    ],
  },
];

// ---- run it live ---------------------------------------------------------
const health = await (await fetch(BASE + "/health")).json();
sessionId = (await post("/sessions", {})).session_id;
const toolList = (await post("/mcp", { jsonrpc: "2.0", id: ++rpc, method: "tools/list", params: {} })).result.tools;

const transcript = [];
for (const scene of SCENES) {
  const calls = [];
  for (const [name, args] of scene.steps) {
    const r = await call(name, args);
    calls.push({ tool: name, args, ok: r.ok, response: r.text });
  }
  transcript.push({ ...scene, calls });
}
writeFileSync(join(ROOT, "data", "research", "realism-transcript.json"),
  JSON.stringify({ base: BASE, captured_at: new Date().toISOString(), health, transcript }, null, 1));

// ---- render --------------------------------------------------------------
const pretty = (t) => { try { return JSON.stringify(JSON.parse(t), null, 1); } catch { return t; } };
const clip = (s, n) => (s.length > n ? s.slice(0, n) + `\n…[${s.length.toLocaleString()} chars total]` : s);

const docSamples = ["CL-105", "AML Rulebook Chapter 14", "Formation pack — Firm entity-selection", "Deadline pack — Consolidated Rules Memo"]
  .map((needle) => mdRows.find((r) => r.title.includes(needle)))
  .filter(Boolean);

const html = `<meta charset="utf-8">
<title>lawfirm-qwen — Realism proof: live tools + seeded documents</title>
<style>
  :root { --paper:#f9f9f7; --card:#fff; --ink:#1c2128; --ink2:#57606d; --mut:#8a919c;
    --line:#e4e5e1; --accent:#33415e; --ok:#008300; --bad:#e34948; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --paper:#16161a; --card:#1e1e23; --ink:#eceae2; --ink2:#b9bcc4; --mut:#868c96;
    --line:#2e2e34; --accent:#9fb2d8; --ok:#4cae4c; --bad:#e66767; } }
  :root[data-theme="dark"] { --paper:#16161a; --card:#1e1e23; --ink:#eceae2; --ink2:#b9bcc4;
    --mut:#868c96; --line:#2e2e34; --accent:#9fb2d8; --ok:#4cae4c; --bad:#e66767; }
  *{box-sizing:border-box} body{background:var(--paper);color:var(--ink);margin:0;
    font:15px/1.5 system-ui,-apple-system,sans-serif}
  .wrap{max-width:1060px;margin:0 auto;padding:36px 22px 80px}
  h1,h2,h3{font-family:Georgia,serif;text-wrap:balance}
  h1{font-size:1.75rem;margin:0 0 6px} h2{font-size:1.25rem;margin:38px 0 4px}
  h3{font-size:1rem;margin:0 0 2px}
  .eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.7rem;color:var(--mut);font-weight:600;margin-bottom:8px}
  .note{color:var(--ink2);font-size:.87rem;max-width:82ch}
  .stats{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}
  .stat{background:var(--card);border:1px solid var(--line);padding:10px 16px}
  .stat b{display:block;font-size:1.3rem;font-family:Georgia,serif;font-variant-numeric:tabular-nums}
  .stat span{color:var(--mut);font-size:.7rem;text-transform:uppercase;letter-spacing:.1em}
  .scene{background:var(--card);border:1px solid var(--line);padding:16px 18px;margin-top:16px}
  .persona{color:var(--accent);font-size:.82rem;font-weight:600}
  .story{color:var(--ink2);font-size:.85rem;margin:4px 0 10px;max-width:80ch}
  .call{border-left:3px solid var(--line);padding:4px 0 4px 12px;margin:10px 0}
  .call.err{border-left-color:var(--bad)}
  .req{font-family:ui-monospace,Menlo,monospace;font-size:.78rem;font-weight:600}
  .req .args{font-weight:400;color:var(--ink2)}
  .badge{font-size:.66rem;padding:1px 6px;border-radius:9px;border:1px solid var(--ok);color:var(--ok);margin-left:6px}
  .badge.e{border-color:var(--bad);color:var(--bad)}
  pre{background:var(--paper);border:1px solid var(--line);padding:8px 10px;margin:6px 0 0;
    font-size:.72rem;overflow-x:auto;white-space:pre-wrap;word-break:break-word;color:var(--ink2)}
  details{margin-top:10px} summary{cursor:pointer;font-size:.82rem;color:var(--accent)}
  .doc{background:var(--card);border:1px solid var(--line);padding:14px 16px;margin-top:10px}
  .doc h3{font-size:.92rem} .doc .meta{color:var(--mut);font-size:.72rem;margin-bottom:6px}
  .doc pre{font-size:.74rem;max-height:320px;overflow-y:auto}
  code{font-family:ui-monospace,Menlo,monospace;font-size:.85em}
</style>
<div class="wrap">
  <div class="eyebrow">lawfirm-qwen · realism proof · captured live ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</div>
  <h1>The tools and the documents, actually working</h1>
  <p class="note">Every request and response below was captured from the running world during this
  page's build — one scene per firm system, each a task a real person does. The seeded documents at
  the bottom are the same rows the tools return and the verifiers grade against. Simulation only:
  all matters, parties, and figures are synthetic.</p>
  <div class="stats">
    <div class="stat"><b>${health.tools}</b><span>tools served</span></div>
    <div class="stat"><b>${toolList.length}</b><span>advertised over MCP</span></div>
    <div class="stat"><b>${health.tables}</b><span>SQL tables</span></div>
    <div class="stat"><b>${health.tasks}</b><span>tasks in world</span></div>
    <div class="stat"><b>${mdRows.length}</b><span>seeded documents</span></div>
    <div class="stat"><b>${transcript.reduce((a, s) => a + s.calls.length, 0)}</b><span>live calls on this page</span></div>
  </div>

  <h2>Live scenes</h2>
  ${transcript.map((s) => `
  <div class="scene">
    <h3>${esc(s.system)}</h3>
    <div class="persona">${esc(s.persona)}</div>
    <div class="story">${esc(s.story)}</div>
    ${s.calls.map((c) => `
      <div class="call ${c.ok ? "" : "err"}">
        <div class="req">${esc(c.tool)}<span class="args">(${esc(JSON.stringify(c.args))})</span>${c.ok ? '<span class="badge">200</span>' : '<span class="badge e">error</span>'}</div>
        <pre>${esc(clip(pretty(c.response), 1400))}</pre>
      </div>`).join("")}
  </div>`).join("")}

  <h2>Seeded documents, in full</h2>
  <p class="note">Four of the ${mdRows.length} seeded matter documents, verbatim — a precedent clause
  (ACORD-anchored library), a regulatory chapter (ObliQA-anchored), the entity-selection guidance whose
  decision rule a task must apply, and the court-rules memo behind the deadline-computation pack.</p>
  ${docSamples.map((d) => `
  <div class="doc">
    <h3>${esc(d.title)}</h3>
    <div class="meta">matter_documents id ${d.id} · doc_type <code>${esc(d.doc_type)}</code> · ${String(d.body ?? "").length.toLocaleString()} chars · family <code>${esc(d.related_shape ?? "core")}</code></div>
    <pre>${esc(d.body)}</pre>
  </div>`).join("")}

  <footer class="note" style="margin-top:36px">Transcript JSON: <code>data/research/realism-transcript.json</code> ·
  regenerate: <code>node docs/evidence/build-realism-demo.mjs</code></footer>
</div>`;

writeFileSync(join(ROOT, "docs", "evidence", "realism.html"), html);
console.log(`realism.html: ${transcript.length} scenes, ${transcript.reduce((a, s) => a + s.calls.length, 0)} live calls, ${docSamples.length} documents`);
