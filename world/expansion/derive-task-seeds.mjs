#!/usr/bin/env node
/**
 * Per-task seed derivation — gives EVERY task its own seed bundle:
 *
 *   task.seed = {
 *     documents:        [matter_documents rows this task's matter cluster owns
 *                        (inputs, markups, schedules, correspondence, AND that
 *                        cluster's distractors — the realistic folder)],
 *     input_documents:  [ids of the documents the task must read in full],
 *     core_data:        { table: [entity rows the task references/mutates] },
 *     mcp:              { system: { table: [rows] } }  // same rows, grouped by
 *                        the MCP server that owns the table (mcp/systems.json)
 *   }
 *
 * Derived from the world document itself (relevant_data, reference_args,
 * prompt-quoted ids, walk tool targets), so the bundle is exactly the data a
 * fresh world would need for this task. The runtime upserts a task's bundle
 * into the session at creation (server.py task-aware sessions), which is a
 * no-op on the full base world today but lets future tasks ship data without
 * touching global tables.
 *
 * Run: node world/expansion/derive-task-seeds.mjs [--world world/blobfish/world-v9.json]
 * (rewrites the world in place). Defaults to the CANONICAL world — keep this in
 * step with config; a stale default silently leaves the newest packs unseeded.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const wArg = argv.includes("--world") ? argv[argv.indexOf("--world") + 1] : "world/blobfish/world-v9.json";
const WORLD = isAbsolute(wArg) ? wArg : join(ROOT, wArg);
const raw = JSON.parse(readFileSync(WORLD, "utf8"));
const world = raw.world ?? raw;

const systems = JSON.parse(readFileSync(join(ROOT, "mcp", "systems.json"), "utf8")).systems;
const toolByName = Object.fromEntries(world.tools.map((t) => [t.name, t]));
const tableByName = Object.fromEntries(world.tables.map((t) => [t.name, t]));
const mdRows = tableByName.matter_documents.sample_rows;
const mdById = new Map(mdRows.map((r) => [r.id, r]));

// table -> owning MCP system (via each system's tools' target tables)
const tableSystem = {};
for (const [sys, spec] of Object.entries(systems)) {
  for (const toolName of spec.tools) {
    for (const tbl of toolByName[toolName]?.target_tables ?? []) {
      tableSystem[tbl] ??= sys; // first owner wins; overlaps share the substrate anyway
    }
  }
}

// document cluster key: the family/matter grouping documents were seeded under
const clusterOf = (row) => row.related_shape || "core-matter-materials";

function rowsByIdOrValue(table, ref) {
  const t = tableByName[table];
  if (!t) return [];
  const pk = (t.columns.find((c) => c.pk) ?? { name: "id" }).name;
  return (t.sample_rows ?? []).filter((r) =>
    String(r[pk]) === String(ref) || (ref != null && Object.values(r).includes(ref)));
}

let seeded = 0;
for (const task of world.tasks) {
  const docIds = new Set();
  const inputIds = new Set();
  const core = {}; // table -> Map(pk -> row)

  const addCore = (table, row) => {
    if (!row || table === "matter_documents") return;
    const pk = (tableByName[table]?.columns.find((c) => c.pk) ?? { name: "id" }).name;
    (core[table] ??= new Map()).set(String(row[pk]), row);
  };

  // 1) relevant_data → documents + entity rows
  for (const rel of task.relevant_data ?? []) {
    if (rel.table === "matter_documents") {
      if (mdById.has(rel.id)) { docIds.add(rel.id); inputIds.add(rel.id); }
      continue;
    }
    for (const row of rowsByIdOrValue(rel.table, rel.id ?? rel.value)) addCore(rel.table, row);
  }

  // 2) reference_args → read ids + entity refs
  (task.reference_args ?? []).forEach((args, i) => {
    const toolName = (task.walk ?? [])[i];
    if (toolName === "read_matter_document" && mdById.has(args?.id)) {
      docIds.add(args.id); inputIds.add(args.id);
    }
    for (const [k, v] of Object.entries(args ?? {})) {
      if (!k.endsWith("_id") && k !== "id") continue;
      for (const tbl of toolByName[toolName]?.target_tables ?? []) {
        // fk like legal_matters_id points at the parent entity table
        const parent = k === "id" ? tbl : null;
        for (const cand of parent ? [parent] : Object.keys(tableByName)) {
          if (k !== "id" && !String(v).startsWith(k.replace(/_id$/, ""))) continue;
          for (const row of rowsByIdOrValue(cand, v)) addCore(cand, row);
          if (k !== "id") break;
        }
      }
    }
  });

  // 3) prompt-quoted entity ids (e.g. "legal_matters_001")
  for (const q of String(task.prompt ?? "").match(/"([a-z][a-z0-9_]*_\d{2,4})"/g) ?? []) {
    const id = q.replace(/"/g, "");
    for (const t of world.tables) {
      for (const row of rowsByIdOrValue(t.name, id)) addCore(t.name, row);
    }
  }

  // 4) the task's document CLUSTER: every doc sharing a cluster with an input
  //    doc (markups, schedules, correspondence, and that cluster's distractors)
  const clusters = new Set([...docIds].map((id) => clusterOf(mdById.get(id))));
  for (const row of mdRows) {
    if (clusters.has(clusterOf(row))) docIds.add(row.id);
  }

  // 5) walk read tools with no pinned rows: seed the first rows of the target
  //    table so list/get checkpoints have data (matches base-world reality)
  for (const toolName of task.walk ?? []) {
    const tool = toolByName[toolName];
    if (!tool || tool.type !== "read") continue;
    for (const tbl of tool.target_tables ?? []) {
      if (tbl === "matter_documents" || (core[tbl]?.size ?? 0) > 0) continue;
      for (const row of (tableByName[tbl]?.sample_rows ?? []).slice(0, 3)) addCore(tbl, row);
    }
  }

  const coreData = Object.fromEntries(
    Object.entries(core).map(([tbl, m]) => [tbl, [...m.values()]]));
  const mcp = {};
  for (const [tbl, rows] of Object.entries(coreData)) {
    const sys = tableSystem[tbl] ?? "practice-management";
    (mcp[sys] ??= {})[tbl] = rows.length;
  }
  const docList = [...docIds].sort((a, b) => a - b);
  if (docList.length) (mcp.dms ??= {}).matter_documents = docList.length;

  task.seed = {
    documents: docList,                       // ids into matter_documents (bodies materialized in tasks/<id>/seed/)
    input_documents: [...inputIds].sort((a, b) => a - b),
    core_data: coreData,
    mcp,                                      // system -> table -> row count (rows live in core_data/documents)
  };
  seeded++;
}

world.seed_schema = {
  version: "lawfirm-qwen.task-seed.v1",
  note: "Per-task seed bundles derived from the world document. documents/input_documents are matter_documents ids; core_data carries the entity rows verbatim; mcp groups the seeding by owning MCP system (counts here, rows in core_data). The runtime upserts a task's bundle into its session at creation (server.py sessions with task_id).",
};
writeFileSync(WORLD, JSON.stringify(raw, null, 1));
const avgDocs = (world.tasks.reduce((a, t) => a + t.seed.documents.length, 0) / seeded).toFixed(1);
const avgCore = (world.tasks.reduce((a, t) => a + Object.values(t.seed.core_data).reduce((x, r) => x + r.length, 0), 0) / seeded).toFixed(1);
console.log(`seeded ${seeded} tasks · avg ${avgDocs} documents + ${avgCore} core rows per task`);
