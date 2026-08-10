#!/usr/bin/env node
/**
 * Domain purge — removes every tool/table that is ERP-template leakage
 * (docs/DOMAIN-AUDIT.md) from the world, together with the tasks/verifiers
 * that depended on that surface, producing world/blobfish/world-lawnative.json.
 *
 * Safety: refuses to write if any KEPT task references a removed tool
 * (walk/required_tools) or a removed table (tables_affected). Prints an
 * auditable removal manifest. Prove with the oracle afterwards.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const raw = JSON.parse(readFileSync(join(ROOT, "world", "blobfish", "world-expanded.json"), "utf8"));
const world = raw.world ?? raw;

// hard leak (lint) + the rest of the ERP-template HR/ops surface
const REMOVE_TABLES = new Set(["invoices", "employees", "departments", "employee_work_assignments"]);
const REMOVE_TOOLS = new Set([
  "query_invoices", "update_invoices_status",
  "query_employees", "update_employees_active",
  "query_departments", "update_departments_department_code",
  "query_employee_work_assignments", "update_employee_work_assignments_status",
  "lookup_employee_work_assignment_with_employees",
  "organization_records_agent", "organization_workflow_agent",
]);
// Domain-relevant broad agents are KEPT with their target lists pruned of the
// removed tables (they were leak-by-association only, and the core harvey_lab
// drafting tasks declare operations_records_agent in required_tools).
const PRUNE_TARGETS = new Set(["operations_records_agent", "operations_workflow_agent"]);

// tasks that must go with the surface (leaked-surface tasks from the lint,
// recomputed here from actual references so nothing is missed)
const removedTasks = [];
const keptTasks = [];
for (const t of world.tasks) {
  const usesTool = [...(t.walk ?? []), ...(t.required_tools ?? [])].some((x) => REMOVE_TOOLS.has(x));
  const usesTable = (t.tables_affected ?? []).some((x) => REMOVE_TABLES.has(x)) ||
    (t.relevant_data ?? []).some((r) => REMOVE_TABLES.has(r.table));
  (usesTool || usesTable ? removedTasks : keptTasks).push(t);
}

// safety: no kept task may reference removed surface
for (const t of keptTasks) {
  for (const x of [...(t.walk ?? []), ...(t.required_tools ?? [])]) {
    if (REMOVE_TOOLS.has(x)) throw new Error(`kept ${t.task_id} references removed tool ${x}`);
  }
}
// verifier text references (task tables) for kept tasks
const keptIds = new Set(keptTasks.map((t) => t.task_id));
for (const v of world.verifiers) {
  if (!keptIds.has(v.task_id)) continue;
  for (const tbl of REMOVE_TABLES) {
    if (new RegExp(`"${tbl}"`).test(v.vcode ?? "") &&
        /rows_inserted_into|_is_|no_collateral/.test(v.vcode ?? "") &&
        new RegExp(`(rows_inserted_into_${tbl}|${tbl}_\\d+_)`).test(v.vcode ?? "")) {
      throw new Error(`kept verifier ${v.task_id} pins removed table ${tbl}`);
    }
  }
}

// agent_files ERP imports: remove the two template TSVs if unreferenced
const agentFiles = world.tables.find((t) => t.name === "agent_files");
const fileRefs = new Set();
for (const t of keptTasks) {
  for (const r of t.relevant_data ?? []) if (r.table === "agent_files") fileRefs.add(String(r.value ?? r.id));
  for (const a of t.reference_args ?? []) if (a && a.filename) fileRefs.add(String(a.filename));
}
const beforeFiles = agentFiles.sample_rows.length;
agentFiles.sample_rows = agentFiles.sample_rows.filter((r) =>
  !/^(invoices|employees)_import\.tsv$/.test(r.filename) || fileRefs.has(r.filename));
agentFiles.row_count = agentFiles.sample_rows.length;

const removedTaskIds = removedTasks.map((t) => t.task_id);
world.tables = world.tables.filter((t) => !REMOVE_TABLES.has(t.name));
world.tools = world.tools.filter((t) => !REMOVE_TOOLS.has(t.name));
for (const t of world.tools) {
  if (PRUNE_TARGETS.has(t.name)) {
    t.target_tables = (t.target_tables ?? []).filter((x) => !REMOVE_TABLES.has(x));
    t.domain_purge_note = "target_tables pruned of ERP-template tables (2026-08-10)";
  }
}
world.tasks = keptTasks;
world.verifiers = world.verifiers.filter((v) => keptIds.has(v.task_id));
// scrub task seeds that carried removed-table rows
for (const t of world.tasks) {
  if (t.seed?.core_data) for (const tbl of REMOVE_TABLES) delete t.seed.core_data[tbl];
  if (t.seed?.mcp) for (const sys of Object.values(t.seed.mcp)) for (const tbl of REMOVE_TABLES) delete sys[tbl];
}
world.domain_purge = {
  performed_at: "2026-08-10",
  removed_tools: [...REMOVE_TOOLS],
  removed_tables: [...REMOVE_TABLES],
  removed_tasks: removedTaskIds,
  removed_agent_files: beforeFiles - agentFiles.sample_rows.length,
  reason: "ERP-template leakage (docs/DOMAIN-AUDIT.md): out-of-domain surface for a law firm",
};
world.version = (world.version ?? 20) + 1;

writeFileSync(join(ROOT, "world", "blobfish", "world-lawnative.json"), JSON.stringify(raw, null, 1));
console.log(JSON.stringify({
  tools: world.tools.length, tables: world.tables.length, tasks: world.tasks.length,
  removed: { tools: REMOVE_TOOLS.size, tables: REMOVE_TABLES.size, tasks: removedTaskIds, agent_files: beforeFiles - agentFiles.sample_rows.length },
}, null, 1));
