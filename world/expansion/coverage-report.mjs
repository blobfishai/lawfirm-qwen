#!/usr/bin/env node
/**
 * Coverage proof generator.
 *
 * Walks world-expanded.json and emits the world-side capability inventory
 * (every task with its provenance anchor/family, every tool family, every
 * document class), then joins data/research/domain-registry.json (the
 * discovery-sweep registry of every legal eval / task family / law-firm
 * workflow found in the domain) into a verdict table:
 *
 *   covered  — world hosts the shape; proof = task ids + tools + documents
 *   partial  — some families hosted, some not; proof + missing list
 *   missing  — nothing in the world hosts it (the honest gap list)
 *
 * Output: docs/COVERAGE.md + data/research/coverage.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const worldRaw = JSON.parse(readFileSync(join(ROOT, "world", "blobfish", "world-v8.json"), "utf8"));
const world = worldRaw.world ?? worldRaw;
const REG_PATH = join(ROOT, "data", "research", "domain-registry.json");
const registry = existsSync(REG_PATH) ? JSON.parse(readFileSync(REG_PATH, "utf8")) : { items: [] };

// ---------------------------------------------------------------- world side
function parseProv(task) {
  const src = task.provenance?.source_workflow ?? "";
  const m = /^([a-z0-9_]+):\s*([^/]+?)(?:\/(.*))?$/i.exec(src);
  if (!m) return { anchor: task.method === "graph_walk" ? "graph-walk" : "unanchored", family: "general" };
  return { anchor: m[1], family: m[2].trim(), slug: m[3] ?? null };
}

const byAnchor = {};
for (const t of world.tasks) {
  const { anchor, family } = parseProv(t);
  const a = (byAnchor[anchor] ??= { tasks: 0, families: {}, taskIds: [] });
  a.tasks++;
  a.taskIds.push(t.task_id);
  (a.families[family] ??= []).push(t.task_id);
}

const toolFamilies = {};
for (const tool of world.tools) {
  const fam =
    /_(list|get)$/.test(tool.name) ? "entity read (list/get)" :
    /_audit_list$/.test(tool.name) ? "audit-trail read" :
    /^query_/.test(tool.name) ? "query/filter read" :
    /^search_/.test(tool.name) ? "keyword search" :
    /^read_/.test(tool.name) ? "full-document read" :
    /_create$/.test(tool.name) ? "record create (amount/evidence/remediation/review)" :
    /^update_/.test(tool.name) ? "record update" :
    tool.name === "draft_matter_document" ? "deliverable filing" :
    /agent$/.test(tool.name) ? "delegation/sub-agent surface" :
    "memory/knowledge/playbook";
  (toolFamilies[fam] ??= []).push(tool.name);
}

const md = world.tables.find((t) => t.name === "matter_documents");
const docClasses = {};
for (const r of md.sample_rows) {
  const c = r.related_shape || "core-matter-materials";
  docClasses[c] = (docClasses[c] ?? 0) + 1;
}

// The world's verifiable outcome grammar — what a task CAN grade.
const GRAMMAR = [
  "ordered multi-step workflow completion (required checkpoint path from the rollout trace)",
  "row insertion with pinned field values (exact numeric / categorical answer keys)",
  "row update with pinned target row + value",
  "required full-document reads (evidence-chain enforcement from trace arguments)",
  "fabrication traps (forbidden rows — abstention graded)",
  "off-task damage / undeclared writes / row destruction guards",
  "deliverable filing into the record system (matter_documents insert)",
  "graded partial credit + anti-hack vetoes per assertion",
  "seeded API friction (rate-limit/stale-reference recovery), ambiguous acks, write caps",
];

// ------------------------------------------------------------- registry join
// anchors present in the world → automatic proof
const ANCHOR_KEYS = {
  "harvey-lab": "harvey_lab", harvey_lab: "harvey_lab", "biglaw-bench": "biglaw_bench",
  biglaw_bench: "biglaw_bench", legalbench: "legalbench", cuad: "cuad", maud: "maud",
  legalagentbench: "legalagentbench", taxcalcbench: "taxcalcbench",
  "stanford-hallucination": "stanford_hai_hallucination",
  "stanford-hai-hallucination": "stanford_hai_hallucination",
  convfinqa: "taxcalcbench",
};

// {{fam:family-name}} tokens in proofs expand to the CURRENT task ids of that
// family, so proofs survive pack re-assembly (ids shift; families are stable).
function expandFamilyTokens(text) {
  return String(text).replace(/\{\{fam:([a-z0-9\-]+)\}\}/g, (_, fam) => {
    for (const a of Object.values(byAnchor)) {
      const ids = a.families[fam];
      if (ids) return `${ids[0]}–${ids[ids.length - 1]} (${ids.length} tasks)`;
    }
    return `[family ${fam}: no tasks]`;
  });
}

function verdict(item) {
  const key = (item.coverage_key ?? item.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  // 1. adjudicated mapping wins (substring anchor-matching mislabels e.g. maslegalbench)
  const manual = registry.manual_map?.[item.coverage_key] ?? registry.manual_map?.[key];
  if (manual) return manual;
  // 2. exact anchor match only
  const anchor = ANCHOR_KEYS[key];
  if (anchor && byAnchor[anchor]) {
    return { verdict: "covered", proof: `anchor ${anchor}: ${byAnchor[anchor].tasks} tasks (${byAnchor[anchor].taskIds.slice(0, 4).join(", ")}…)` };
  }
  return { verdict: "unmapped", proof: "" };
}

const rows = (registry.items ?? []).map((item) => {
  const v = verdict(item);
  return {
    name: item.name,
    kind: item.kind,
    language: item.language ?? "en",
    families: (item.task_families ?? []).join("; "),
    requires: item.world_requirements ?? "",
    ...v,
    proof: expandFamilyTokens(v.proof ?? ""),
  };
});

const counts = rows.reduce((a, r) => { a[r.verdict] = (a[r.verdict] ?? 0) + 1; return a; }, {});

// ---------------------------------------------------------------- render
const out = [];
out.push("# Coverage Proof — what this world hosts, with evidence");
out.push("");
out.push(`Generated by \`world/expansion/coverage-report.mjs\` from \`world-expanded.json\` (v${world.version}) — ${world.tasks.length} tasks, ${world.tools.length} tools, ${md.sample_rows.length} seeded documents. Registry: ${rows.length} domain items${rows.length ? ` (${JSON.stringify(counts)})` : " (registry pending)"}.`);
out.push("");
out.push("## 1. World-side inventory (the proof substrate)");
out.push("");
out.push("### Tasks by benchmark anchor");
out.push("");
out.push("| Anchor | Tasks | Families | Task ids |");
out.push("|---|---|---|---|");
for (const [anchor, a] of Object.entries(byAnchor).sort((x, y) => y[1].tasks - x[1].tasks)) {
  const fams = Object.entries(a.families).map(([f, ids]) => `${f} (${ids.length})`).join("; ");
  out.push(`| ${anchor} | ${a.tasks} | ${fams.slice(0, 220)} | ${a.taskIds.slice(0, 6).join(", ")}${a.taskIds.length > 6 ? "…" : ""} |`);
}
out.push("");
out.push("### Executable tool families");
out.push("");
out.push("| Family | Count | Examples |");
out.push("|---|---|---|");
for (const [fam, names] of Object.entries(toolFamilies).sort((a, b) => b[1].length - a[1].length)) {
  out.push(`| ${fam} | ${names.length} | ${names.slice(0, 4).join(", ")} |`);
}
out.push("");
out.push("### Seeded document classes");
out.push("");
out.push("| Class | Documents |");
out.push("|---|---|");
for (const [c, n] of Object.entries(docClasses).sort((a, b) => b[1] - a[1])) {
  out.push(`| ${c} | ${n} |`);
}
out.push("");
out.push("### The verifiable outcome grammar");
out.push("");
for (const g of GRAMMAR) out.push(`- ${g}`);
out.push("");
out.push("## 2. Domain registry → coverage verdicts");
out.push("");
if (!rows.length) {
  out.push("*Registry not yet generated — run the discovery sweep first.*");
} else {
  const VERDICT_NOTES = {
    covered: "existing world tasks host the item's core families (proof: task ids + tools)",
    partial: "some families hosted, others named as missing",
    "hostable-gap": "no tasks yet, but the outcome grammar + tables can express it via a content pack",
    "structural-gap": "requires mechanics the world does not have (named per item)",
    unmapped: "not yet adjudicated",
  };
  for (const v of ["covered", "partial", "hostable-gap", "structural-gap", "missing", "unmapped"]) {
    const sub = rows.filter((r) => r.verdict === v);
    if (!sub.length) continue;
    out.push(`### ${v.toUpperCase()} (${sub.length}) — ${VERDICT_NOTES[v] ?? ""}`);
    out.push("");
    out.push("| Item | Kind | Lang | Task families | Proof / gap |");
    out.push("|---|---|---|---|---|");
    for (const r of sub) {
      out.push(`| ${r.name} | ${r.kind} | ${r.language} | ${String(r.families).slice(0, 140)} | ${String(r.proof || r.requires).slice(0, 200)} |`);
    }
    out.push("");
  }
}
writeFileSync(join(ROOT, "docs", "COVERAGE.md"), out.join("\n"));
writeFileSync(join(ROOT, "data", "research", "coverage.json"), JSON.stringify({ byAnchor, toolFamilies, docClasses, rows, counts }, null, 1));
console.log(`COVERAGE.md: ${Object.keys(byAnchor).length} anchors, ${rows.length} registry items → ${JSON.stringify(counts)}`);
