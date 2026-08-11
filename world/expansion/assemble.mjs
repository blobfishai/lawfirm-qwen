#!/usr/bin/env node
/**
 * Expansion assembler — turns eval-anchored content packs into world tasks.
 *
 * Input:  world/expansion/packs/*.json   (content packs from generation)
 *   {
 *     "family": "cuad-clause-extraction",
 *     "anchor": "cuad",                      // benchmark provenance
 *     "documents": [{ "title", "doc_type", "body" }],
 *     "tasks": [{
 *       "slug": "short-name",
 *       "prompt": "...",                     // full task instruction
 *       "reads": ["doc title", ...],         // documents that MUST be read (in order)
 *       "creates": [{                        // ordered write steps after the reads
 *         "tool": "legal_matters_evidence_create",
 *         "args": { ... },                   // full reference arguments
 *         "pinned": { "evidence_type": "uncapped_liability" }   // graded fields
 *       }],
 *       "forbidden": [{                      // negative checks (absent-answer traps)
 *         "table": "legal_matters_reviews",
 *         "field": "outcome", "value": "approved"
 *       }],
 *       "query_first": true,                 // walk starts with query_matter_documents
 *       "difficulty": "medium"
 *     }]
 *   }
 *
 * Output: world/blobfish/world-expanded.json — the original world with
 *   documents appended to matter_documents, tasks/verifiers appended
 *   (append-only: original 156 tasks and their verifiers are byte-identical).
 *
 * Every generated task carries reference_args so world/local/oracle.py can
 * execute its reference walk; admission is oracle-pass on the expanded world.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { pathCheckPython } from "./lib/path-check.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const argv = process.argv.slice(2);
const opt = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const PACKS_DIR = opt("--packs-dir", join(HERE, "packs"));
const WORLD_IN = join(ROOT, opt("--in", "world/blobfish/world.json"));
const WORLD_OUT = join(ROOT, opt("--out", "world/blobfish/world-expanded.json"));

const raw = JSON.parse(readFileSync(WORLD_IN, "utf8"));
const world = raw.world ?? raw;
const originalTaskCount = world.tasks.length;
const originalDocCount = world.tables.find((t) => t.name === "matter_documents").sample_rows.length;

const toolByName = Object.fromEntries(world.tools.map((t) => [t.name, t]));
const tableByName = Object.fromEntries(world.tables.map((t) => [t.name, t]));

// ---------------------------------------------------------------- vcode
function pyStr(s) {
  return JSON.stringify(String(s));
}

/** Python-style normalization for pinned values: numbers must render the way
 *  str(float) does in the verifier (SQLite REAL affinity stores 50000000 as
 *  50000000.0, so integer pins are asserted as "50000000.0"). */
function pyNorm(v) {
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(1) : String(v);
  return String(v);
}

function buildVcode(taskId, task, walk, insertChecks, forbidden, requiredReadIds, taskTables) {
  const readTools = [...new Set(walk.filter((w) => toolByName[w]?.type !== "write"))];
  const writeTools = [...new Set(walk.filter((w) => toolByName[w]?.type === "write"))];
  const createExempt = [...new Set(insertChecks.map((c) => c.table))];

  const insertBlocks = insertChecks.map((c, i) => {
    const pinLines = (c.pinnedPairs ?? []).map(([f, v], j) => {
      const nv = pyNorm(v);
      return `
    _new_${i}_pin_${j} = [r for r in _new_rows_${i} if _norm(r.get(${pyStr(f)})) == _norm(${pyStr(nv)})]
    chk(${pyStr(`${c.table}_new_row_${j}_${f}_is_${String(nv).slice(0, 40)}`)}, len(_new_${i}_pin_${j}) > 0,
        f"expected a new ${c.table} row with ${f}=${String(nv).slice(0, 60)}; got " +
        str([_norm(r.get(${pyStr(f)})) for r in _new_rows_${i}][:8]))`;
    }).join("");
    return `
    _bi_${i} = _by_id(_rows(initial_state, ${pyStr(c.table)}))
    _af_${i} = _rows(final_state, ${pyStr(c.table)})
    _new_rows_${i} = [r for r in _af_${i} if str(r.get("id")) not in _bi_${i}]
    chk(${pyStr(`rows_inserted_into_${c.table}`)}, len(_new_rows_${i}) >= ${c.minRows ?? 1},
        f"${c.table}: {len(_bi_${i})} -> {len(_af_${i})} rows ({len(_new_rows_${i})} new, need >= ${c.minRows ?? 1})")${pinLines}`;
  }).join("\n");

  const forbiddenBlocks = (forbidden ?? []).map((f, i) => `
    _bi_f${i} = _by_id(_rows(initial_state, ${pyStr(f.table)}))
    _af_f${i} = _rows(final_state, ${pyStr(f.table)})
    _forb_${i} = [r for r in _af_f${i} if str(r.get("id")) not in _bi_f${i} and _norm(r.get(${pyStr(f.field)})) == _norm(${pyStr(pyNorm(f.value))})]
    chk(${pyStr(`no_new_${f.table}_row_with_${f.field}_${String(f.value).slice(0, 30)}`)}, len(_forb_${i}) == 0,
        "no fabricated ${f.field}=${String(f.value).slice(0, 40)} row" if not _forb_${i}
        else f"FABRICATION: {len(_forb_${i})} new ${f.table} row(s) claim ${f.field}=${String(f.value).slice(0, 40)} but the source materials do not support it")`).join("\n");

  const readIdChecks = (requiredReadIds ?? []).length ? `
    _read_ids = [str((s.get("arguments") or {}).get("id")) for s in successful_steps if s.get("tool") == "read_matter_document"]
    _need_ids = [${requiredReadIds.map((x) => pyStr(x)).join(", ")}]
    _missing_reads = [i for i in _need_ids if i not in _read_ids]
    chk("required_documents_read", len(_missing_reads) == 0,
        "all required input documents were read in full" if not _missing_reads
        else f"EVIDENCE GAP: matter_documents {_missing_reads} were never read with read_matter_document")` : "";

  const allTables = [...new Set([...createExempt, ...taskTables, "audit_logs"])];

  return `"""VCode verifier for ${taskId} (expansion: ${task.family})

Task: ${String(task.prompt).slice(0, 90).replace(/"/g, "'")}
Tools (walk): ${walk.join(" -> ")}
Checks: pinned-field state diff + behavioral (state changed, read-before-write,
        no shortcut, required reads) + fabrication guards + tool-success advisory.

initial_state / final_state are {table: [row, ...]} snapshots taken before and
after the rollout; trace is the list of executed steps.
"""

READ_TOOLS = ${JSON.stringify(readTools)}
WRITE_TOOLS = ${JSON.stringify(writeTools)}

def _rows(state, table):
    return state.get(table, []) if isinstance(state, dict) else []

def _by_id(rows):
    out = {}
    for r in rows:
        if isinstance(r, dict) and r.get("id") is not None:
            out[str(r["id"])] = r
    return out

def _norm(value):
    if value is None: return "null"
    if value is True: return "true"
    if value is False: return "false"
    return str(value).strip().lower()

def verify(initial_state, final_state, trace):
    results, failed = [], []
    def chk(name, passed, detail):
        results.append({"name": name, "passed": bool(passed), "details": detail})
        if not passed: failed.append(name)

    successful_steps = [s for s in trace if s.get("tool") != "_final_answer" and s.get("ok")]
    tools = [s.get("tool", "") for s in successful_steps]
    changed = initial_state != final_state
    chk("state_changed", changed,
        "world state changed" if changed else "NO state change — agent did nothing")

    reads = [t for t in tools if t in READ_TOOLS]
    writes = [t for t in tools if t in WRITE_TOOLS]
    read_first = len(reads) > 0 and (
        len(writes) == 0 or tools.index(reads[0]) < tools.index(writes[0]))
    chk("reads_before_writes", read_first,
        f"reads={len(reads)}, writes={len(writes)}, read_first={read_first}")

    shortcut = len(writes) > 0 and len(reads) == 0
    chk("no_shortcut_direct_update", not shortcut,
        "SHORTCUT: wrote without reading first" if shortcut else "inspected data before writing")

${pathCheckPython(walk, (n) => toolByName[n]?.type === "write")}
${readIdChecks}
${insertBlocks}
${forbiddenBlocks}

    _task_tables = set(${JSON.stringify(allTables)})
    _dmg_tables = []
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        if _t in _task_tables:
            continue
        if _rows(initial_state, _t) != _rows(final_state, _t):
            _dmg_tables.append(_t)
    chk("no_offtask_table_changes", len(_dmg_tables) == 0,
        "no off-task tables were modified" if not _dmg_tables
        else f"OFF-TASK DAMAGE: tables {sorted(_dmg_tables)} changed but are outside this task's scope")

    _destroyed = {}
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        _bi_g = _rows(initial_state, _t)
        _af_g = _rows(final_state, _t)
        _bi_ids_g = _by_id(_bi_g)
        _af_ids_g = _by_id(_af_g)
        _gone = [k for k in _bi_ids_g if k not in _af_ids_g]
        if _gone or len(_af_g) < len(_bi_g):
            _destroyed[_t] = f"{len(_bi_g)} -> {len(_af_g)} rows"
    chk("no_rows_destroyed", len(_destroyed) == 0,
        "no rows were destroyed in any table" if not _destroyed
        else f"ROWS DESTROYED: {_destroyed} — this task declares no deletion")

    _create_exempt = set(${JSON.stringify(createExempt)}) | {"audit_logs"}
    _fabricated = {}
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        if _t in _create_exempt:
            continue
        _bi_c = _rows(initial_state, _t)
        _af_c = _rows(final_state, _t)
        _new = [k for k in _by_id(_af_c) if k not in _by_id(_bi_c)]
        if _new or len(_af_c) > len(_bi_c):
            _fabricated[_t] = f"{len(_bi_c)} -> {len(_af_c)} rows"
    chk("no_undeclared_rows_created", len(_fabricated) == 0,
        "all created rows were declared by task insert effects" if not _fabricated
        else f"UNDECLARED RECORD CREATION: {_fabricated}")

    _real_trace = [s for s in trace if s.get("tool") != "_final_answer"]
    ok_count = sum(1 for s in _real_trace if s.get("ok"))
    chk("all_tools_succeeded", len(_real_trace) > 0 and ok_count * 5 >= len(_real_trace) * 4,
        f"{ok_count}/{len(_real_trace)} tool calls succeeded")

    _BEHAVIORAL = {"state_changed", "reads_before_writes", "no_shortcut_direct_update", "required_workflow_path", "required_documents_read", "all_tools_succeeded"}
    _ANTI_HACK = {"reads_before_writes", "no_shortcut_direct_update", "required_workflow_path", "required_documents_read"}
    _ADVISORY = {"all_tools_succeeded"}
    _GUARDS = set(["no_offtask_table_changes", "no_rows_destroyed", "no_undeclared_rows_created"]) | {r["name"] for r in results if r["name"].startswith("no_new_")}
    effect_results = [r for r in results if r["name"] not in _BEHAVIORAL]
    core_results = [r for r in effect_results if r["name"] not in _GUARDS]
    core_failed = [r for r in core_results if not r["passed"]]
    guard_failed = [r for r in effect_results if r["name"] in _GUARDS and not r["passed"]]
    anti_hack_failed = [r for r in results if r["name"] in _ANTI_HACK and not r["passed"]]
    advisory_failed = [r for r in results if r["name"] in _ADVISORY and not r["passed"]]
    structural_failed = [name for name in failed if name not in _ADVISORY]
    if guard_failed or anti_hack_failed:
        reward = 0.0
    elif core_results:
        reward = (len(core_results) - len(core_failed)) / len(core_results)
    else:
        reward = 0.0 if structural_failed else 1.0
    return {
        "task_id": ${pyStr(taskId)},
        "passed": len(structural_failed) == 0,
        "reward": round(reward, 4),
        "explanation": ("All task checks passed" + ("; advisory: " + ", ".join(r["name"] for r in advisory_failed) if advisory_failed else "")) if not structural_failed else "Failed: " + ", ".join(structural_failed),
        "failed_conditions": structural_failed,
        "advisory_conditions": [r["name"] for r in advisory_failed],
        "assertions": results,
    }
`;
}

// ---------------------------------------------------------------- assembly
const packFiles = existsSync(PACKS_DIR)
  ? readdirSync(PACKS_DIR).filter((f) => f.endsWith(".json")).sort()
  : [];
if (!packFiles.length) {
  console.error(`No packs found in ${PACKS_DIR}`);
  process.exit(1);
}

const mdTable = world.tables.find((t) => t.name === "matter_documents");
let nextDocId = Math.max(...mdTable.sample_rows.map((r) => r.id)) + 1;
// Allocate above the HIGHEST existing id, not by count. Counting collides the
// moment any task has been retired: ids are scattered, so `count + 1` lands on
// an id that is still in use and the world silently ships duplicates (the
// oracle then runs one id twice and the verifier lookup picks whichever comes
// first). Retired ids are never reused, so archived traces stay interpretable.
let nextTaskNum = 1 + Math.max(0, ...world.tasks
  .map((t) => Number(/^task_(\d+)$/.exec(t.task_id ?? "")?.[1]))
  .filter(Number.isFinite));

const report = { packs: [], documentsAdded: 0, tasksAdded: 0, skipped: [] };
const docIdByTitle = new Map(mdTable.sample_rows.map((r) => [r.title, r.id]));

for (const pf of packFiles) {
  const pack = JSON.parse(readFileSync(join(PACKS_DIR, pf), "utf8"));
  const packReport = { file: pf, family: pack.family, documents: 0, tasks: 0 };

  for (const doc of pack.documents ?? []) {
    if (docIdByTitle.has(doc.title)) continue; // idempotent
    const row = {
      id: nextDocId++,
      title: doc.title,
      doc_type: doc.doc_type ?? "input",
      related_shape: pack.family,
      body: doc.body,
    };
    mdTable.sample_rows.push(row);
    docIdByTitle.set(row.title, row.id);
    packReport.documents++;
    report.documentsAdded++;
  }

  for (const spec of pack.tasks ?? []) {
    const readIds = (spec.reads ?? []).map((title) => {
      const id = docIdByTitle.get(title);
      if (id === undefined) throw new Error(`${pf}/${spec.slug}: read doc not found: "${title}"`);
      return id;
    });
    const creates = (spec.creates ?? []).map((c) => {
      if (!toolByName[c.tool]) throw new Error(`${pf}/${spec.slug}: unknown tool ${c.tool}`);
      return c;
    });
    if (!creates.length) { report.skipped.push(`${pf}/${spec.slug}: no writes`); continue; }

    const walk = spec.walk_override ?? [
      ...(spec.query_first !== false ? ["query_matter_documents"] : []),
      ...readIds.map(() => "read_matter_document"),
      ...creates.map((c) => c.tool),
    ];
    if (spec.walk_override) {
      for (const t of spec.walk_override) {
        if (!toolByName[t]) throw new Error(`${pf}/${spec.slug}: walk_override unknown tool ${t}`);
      }
    }
    const taskId = `task_${String(nextTaskNum++).padStart(3, "0")}`;

    // group by table; every pinned {field: value} pair is asserted
    // independently, so multiple creates into one table each keep their pins
    const mergedByTable = {};
    for (const c of creates) {
      const table = toolByName[c.tool].target_tables[0];
      const cols = new Set((tableByName[table]?.columns ?? []).map((col) => col.name));
      const m = (mergedByTable[table] ??= { table, minRows: 0, pinnedPairs: [] });
      m.minRows += 1;
      for (const [f, v] of Object.entries(c.pinned ?? {})) {
        if (!cols.has(f)) {
          report.skipped.push(`${pf}/${spec.slug}: pin on non-column ${table}.${f} dropped`);
          continue;
        }
        m.pinnedPairs.push([f, v]);
      }
    }
    const finalChecks = Object.values(mergedByTable);

    const taskTables = [...new Set(finalChecks.map((c) => c.table))];
    const forbidden = (spec.forbidden ?? []).filter((f) => {
      const cols = new Set((tableByName[f.table]?.columns ?? []).map((col) => col.name));
      if (!tableByName[f.table] || !cols.has(f.field)) {
        report.skipped.push(`${pf}/${spec.slug}: forbidden on unknown ${f.table}.${f.field} dropped`);
        return false;
      }
      return true;
    });
    const vcode = buildVcode(taskId, { ...spec, family: pack.family }, walk,
      finalChecks, forbidden, readIds.map(String), taskTables);

    const ARG_DEFAULTS = {
      content_digest: "sha256:reference-digest", owner_role: "associate",
      status: "open", due_at: "2026-09-01T12:00:00Z", reviewer_role: "partner",
      rationale: "Reference determination grounded in the required reads.",
      change_reason: "Reference value recorded from source documents.",
      changed_by_role: "partner", content_summary: "Reference evidence.",
      source_uri: "matter://reference", evidence_type: "document",
      due_note: "Complete before next docket review.",
      action_required: "Reconcile against source materials.",
      detail: "Reference detail.", notes: "Reference note.",
    };
    const completeArgs = (tool, rawArgs, pinned) => {
      let params = tool.parameters ?? {};
      if (Array.isArray(params)) params = Object.fromEntries(params.map((p) => [p.name, p.type]));
      const args = { ...(rawArgs ?? {}) };
      for (const [pname, ptype] of Object.entries(params)) {
        if (args[pname] !== undefined && args[pname] !== null && args[pname] !== "") continue;
        if (pname.endsWith("_id")) {
          const existing = Object.entries(args).find(([k]) => k.endsWith("_id"));
          args[pname] = existing ? existing[1] : `${pname.replace(/_id$/, "")}_001`;
        } else if (/number|float|real/.test(String(ptype))) {
          args[pname] = 100000;
        } else {
          args[pname] = ARG_DEFAULTS[pname] ?? `reference-${pname}`;
        }
      }
      for (const [f, v] of Object.entries(pinned ?? {})) args[f] = v; // pins are the answer key
      return args;
    };

    let referenceArgs = [];
    if (spec.reference_args_override) {
      const createByTool = {};
      for (const c of creates) (createByTool[c.tool] ??= []).push(c);
      referenceArgs = spec.walk_override.map((toolName, i) => {
        const raw = spec.reference_args_override[i] ?? {};
        if (toolByName[toolName]?.type === "write") {
          const c = (createByTool[toolName] ?? []).shift();
          return completeArgs(toolByName[toolName], { ...raw, ...(c?.args ?? {}) }, c?.pinned);
        }
        return raw;
      });
    } else {
      if (spec.query_first !== false) {
        referenceArgs.push({ title: (spec.reads?.[0] ?? "").slice(0, 60) || "Expansion" });
      }
      for (const id of readIds) referenceArgs.push({ id });
      for (const c of creates) referenceArgs.push(completeArgs(toolByName[c.tool], c.args, c.pinned));
    }

    world.tasks.push({
      task_id: taskId,
      outcome_class: "eligible_action",
      prompt: spec.prompt,
      goal: spec.goal ?? spec.prompt.slice(0, 120),
      required_tools: [...new Set(walk)],
      complexity: spec.difficulty === "high" ? "high" : "medium",
      method: "eval_anchored_expansion",
      steps: spec.steps ?? [
        "Locate the input documents for this engagement in the matter folder",
        "Read every required input document in full",
        "Derive the graded determinations strictly from the documents",
        "Record the determinations with the required write tools",
      ],
      relevant_data: readIds.map((id, i) => ({
        table: "matter_documents", id, field: "title", value: spec.reads[i],
      })),
      expected_state_changes: finalChecks.map((c) => ({
        table: c.table, field: "(new row)", note: `>=${c.minRows} rows with pinned fields`,
      })),
      tables_affected: taskTables,
      walk,
      reference_args: referenceArgs,
      effects: finalChecks.map((c) => ({ table: c.table, op: "insert" })),
      provenance: { source_workflow: `${pack.anchor}: ${pack.family}/${spec.slug}` },
      difficulty_tier: spec.difficulty ?? "medium",
      acceptance_label: "pending_calibration",
      expansion: { pack: pf, slug: spec.slug },
    });
    world.verifiers.push({
      task_id: taskId,
      assertions: [
        "state_changed", "reads_before_writes", "no_shortcut_direct_update",
        "required_workflow_path",
        ...(readIds.length ? ["required_documents_read"] : []),
        ...finalChecks.map((c) => `rows_inserted_into_${c.table}`),
        "no_offtask_table_changes", "no_rows_destroyed",
        "no_undeclared_rows_created", "all_tools_succeeded",
      ],
      vcode,
      generated_by: "world/expansion/assemble.mjs",
    });
    packReport.tasks++;
    report.tasksAdded++;
  }
  report.packs.push(packReport);
}

// update counts + provenance metadata
mdTable.row_count = mdTable.sample_rows.length;
world.version = (world.version ?? 19) + 1;
world.expansion_report = {
  generated_at: new Date().toISOString(),
  base_tasks: originalTaskCount,
  base_documents: originalDocCount,
  documents_added: report.documentsAdded,
  tasks_added: report.tasksAdded,
  packs: report.packs,
};

// append-only safety: originals byte-identical
const check = JSON.parse(readFileSync(WORLD_IN, "utf8"));
const checkWorld = check.world ?? check;
for (let i = 0; i < originalTaskCount; i++) {
  if (JSON.stringify(checkWorld.tasks[i]) !== JSON.stringify(world.tasks[i])) {
    throw new Error(`append-only violation at task index ${i}`);
  }
}

writeFileSync(WORLD_OUT, JSON.stringify(raw, null, 1));
console.log(JSON.stringify(report, null, 2));
console.log(`world: ${originalTaskCount} -> ${world.tasks.length} tasks, ` +
  `${originalDocCount} -> ${mdTable.sample_rows.length} matter documents`);
console.log(`→ ${WORLD_OUT}`);
