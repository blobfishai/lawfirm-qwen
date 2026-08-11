#!/usr/bin/env node
/**
 * Domain-fidelity lint — finds generic-template leakage in a world: tables,
 * columns, tools, sample values, and task prompts that don't belong to the
 * world's stated domain (the "sales world with ERP/GitHub/PagerDuty tools"
 * disease, checked here against the law-firm thesis).
 *
 * Usage: node world/expansion/domain-lint.mjs [--world world/blobfish/world-v6.json]
 * Output: docs/DOMAIN-AUDIT.md + data/research/domain-lint.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const opt = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const WORLD = join(ROOT, opt("--world", "world/blobfish/world-v6.json"));
const raw = JSON.parse(readFileSync(WORLD, "utf8"));
const world = raw.world ?? raw;

// Two tiers of out-of-domain vocabulary for a LAW FIRM world:
//  TIER1 (infra/devops/retail-platform) — foreign ANYWHERE: a law firm's world
//   has no PagerDuty/GitHub/Kubernetes surface, and its documents don't either.
//  TIER2 (ERP/logistics business terms) — foreign only in FIRM SYSTEMS
//   (table/tool definitions). Client documents a firm reviews (supply
//   agreements, MSAs) legitimately contain suppliers/shipments — that is the
//   firm's WORK, not its systems.
const TIER1 = ["pagerduty", "github", "jira", "kubernetes", "checkout", "cart", "storefront", "sku"];
const TIER2 = ["warehouse", "shipment", "shipping", "shipped", "purchase_order", "po_id",
  "inventory", "freight", "pallet", "loading dock", "customer_order", "fulfillment", "restock"];
const rx = (list) => new RegExp(`\\b(${list.join("|").replace(/_/g, "[_ ]?")})\\b`, "i");
const RX1 = rx(TIER1), RX2 = rx(TIER2);

const findings = [];
const hit = (kind, name, field, text, systemsSurface) => {
  const t = String(text ?? "");
  for (const R of systemsSurface ? [RX1, RX2] : [RX1]) {
    const m = R.exec(t);
    if (m) { findings.push({ kind, name, field, term: m[1].toLowerCase(), excerpt: t.slice(Math.max(0, m.index - 40), m.index + 60) }); return; }
  }
};

for (const t of world.tables) {
  if (t.name === "matter_documents") continue; // client documents are the firm's WORK
  hit("table", t.name, "name", t.name, true);
  hit("table", t.name, "description", t.description, true);
  for (const c of t.columns) hit("table", t.name, `column:${c.name}`, `${c.name} ${c.note ?? ""}`, true);
  for (const r of (t.sample_rows ?? []).slice(0, 3)) {
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === "string" && v.length < 400) hit("table", t.name, `row:${k}`, v, true);
    }
  }
}
for (const tool of world.tools) {
  hit("tool", tool.name, "name", tool.name, true);
  hit("tool", tool.name, "description", `${tool.description} ${tool.purpose ?? ""}`, true);
  hit("tool", tool.name, "params", JSON.stringify(tool.parameters), true);
}
for (const task of world.tasks) {
  hit("task", task.task_id, "prompt", task.prompt, false); // TIER1 only in prompts
}

// leak-by-association: tools targeting a leaked table are leaked surface
const leakedTableSet = new Set(findings.filter((f) => f.kind === "table").map((f) => f.name));
for (const tool of world.tools) {
  if ((tool.target_tables ?? []).some((x) => leakedTableSet.has(x)) &&
      !findings.some((f) => f.kind === "tool" && f.name === tool.name)) {
    findings.push({ kind: "tool", name: tool.name, field: "target_tables",
      term: "targets-leaked-table", excerpt: (tool.target_tables ?? []).filter((x) => leakedTableSet.has(x)).join(",") });
  }
}

// aggregate per asset
const byAsset = {};
for (const f of findings) {
  const k = `${f.kind}:${f.name}`;
  (byAsset[k] ??= { kind: f.kind, name: f.name, terms: new Set(), fields: [] });
  byAsset[k].terms.add(f.term);
  if (byAsset[k].fields.length < 6) byAsset[k].fields.push(`${f.field} ("…${f.excerpt.trim()}…")`);
}
const assets = Object.values(byAsset).map((a) => ({ ...a, terms: [...a.terms] }));

// tasks whose surface touches a leaked table/tool
const leakedTables = new Set(assets.filter((a) => a.kind === "table").map((a) => a.name));
const leakedTools = new Set(assets.filter((a) => a.kind === "tool").map((a) => a.name));
const affectedTasks = world.tasks.filter((t) =>
  (t.tables_affected ?? []).some((x) => leakedTables.has(x)) ||
  (t.walk ?? []).some((x) => leakedTools.has(x)) ||
  leakedTools.size && (t.walk ?? []).some((w) => leakedTools.has(w)) ||
  assets.some((a) => a.kind === "task" && a.name === t.task_id)
).map((t) => t.task_id);

const out = {
  world: WORLD.replace(ROOT + "/", ""),
  domain: "law-firm",
  foreign_vocabulary: { tier1_anywhere: TIER1, tier2_firm_systems_only: TIER2 },
  assets_flagged: assets,
  affected_tasks: affectedTasks,
  totals: {
    tables: assets.filter((a) => a.kind === "table").length,
    tools: assets.filter((a) => a.kind === "tool").length,
    tasks_with_foreign_prompts: assets.filter((a) => a.kind === "task").length,
    tasks_touching_leaked_surface: affectedTasks.length,
  },
};
writeFileSync(join(ROOT, "data", "research", "domain-lint.json"), JSON.stringify(out, null, 1));

const md = [];
md.push("# Domain-Fidelity Audit — template leakage in the law-firm world");
md.push("");
md.push("The same disease flagged in the studio's sales world (ERP/GitHub/PagerDuty tools in a");
md.push("sales domain) checked against THIS world. Lint: `node world/expansion/domain-lint.mjs`");
md.push("(word-boundary scan of tables, columns, sample values, tools, and task prompts against");
md.push("an out-of-domain vocabulary for a law firm).");
md.push("");
md.push(`**Flagged: ${out.totals.tables} tables · ${out.totals.tools} tools · ${out.totals.tasks_with_foreign_prompts} task prompts · ${out.totals.tasks_touching_leaked_surface} tasks touching a leaked surface.**`);
md.push("");
md.push("| Asset | Kind | Foreign terms | Evidence |");
md.push("|---|---|---|---|");
for (const a of assets.sort((x, y) => x.kind.localeCompare(y.kind) || x.name.localeCompare(y.name))) {
  md.push(`| ${a.name} | ${a.kind} | ${a.terms.join(", ")} | ${a.fields[0]?.replace(/\|/g, "\\|") ?? ""} |`);
}
md.push("");
md.push(`Affected tasks: ${affectedTasks.join(", ") || "none"}`);
md.push("");
md.push("## Handling (verifier-safe)");
md.push("");
md.push("1. **No retroactive renames.** Re-skinning columns (warehouse_id → office_id) would break");
md.push("   the shipped verifiers' state snapshots and invalidate 1,000+ measured traces. Renames");
md.push("   belong to a world-v2 regeneration, not this dataset.");
md.push("2. **Tagged, not hidden.** Leaked assets are recorded here and in `data/research/domain-lint.json`;");
md.push("   `config.scoring.domainFidelity` lists the affected tasks so future runs can select");
md.push("   `--tasks law-native` (scored minus leaked-surface tasks). Published aggregates were");
md.push("   measured on the pre-audit scored set and are NOT retroactively rewritten — this is a");
md.push("   disclosed measurement-set caveat, same policy as the task_016 quarantine.");
md.push("3. **Forward fix by replacement.** The domain-correct law-firm billing/staffing surfaces");
md.push("   (client trust ledger, time entries, LEDES/UTBMS billing, staffing without warehouses)");
md.push("   are already-identified hostable gaps in `docs/COVERAGE.md` — new packs replace the");
md.push("   template surfaces rather than patching them.");
md.push("4. **Generation gate (playbook Stage 2/3).** Every table/column/tool must justify itself");
md.push("   against the thesis at creation time; this lint runs in CI for every new world and the");
md.push("   sales world inherits it with a sales-domain vocabulary.");
writeFileSync(join(ROOT, "docs", "DOMAIN-AUDIT.md"), md.join("\n") + "\n");
console.log(`domain lint: ${assets.length} assets flagged, ${affectedTasks.length} tasks affected → docs/DOMAIN-AUDIT.md`);
