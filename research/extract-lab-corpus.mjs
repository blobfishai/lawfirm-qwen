#!/usr/bin/env node
/**
 * Extract the Harvey LAB corpus into a structured inventory.
 *
 * `research/repos/harveyai@harvey-labs` — a commit-pinned snapshot containing
 * 2,010 tasks and 3.2 GB of task documents. This is the benchmark our
 * world has been anchoring to BY NAME (`provenance.source_workflow` values like
 * `harvey_lab/diligence/aerospace-vertical-integration`) without ever having
 * the tasks on disk. Now we can check the resemblance instead of asserting it.
 *
 * What we pull out, and why:
 *   work_type      — LAB's own verb taxonomy (draft / extract / compare / ...),
 *                    which is the task-family axis stated by the source rather
 *                    than inferred by us
 *   criteria       — the rubric: id, title, which deliverable it binds to, and
 *                    the PASS-if text. This is how LAB decides "done"
 *   deliverables   — the artifacts a task must produce, by filename+extension
 *   documents      — the input corpus: real .docx/.xlsx/.eml/.pdf in a nested
 *                    data-room tree, counted and typed per task
 *
 * Emits research/answers/data/lab-corpus.json.
 * Run: node research/extract-lab-corpus.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LAB = join(HERE, "repos", "harveyai@harvey-labs");
const TASKS = join(LAB, "tasks");
const REPO_COMMITS = join(HERE, "repos-commits.json");
if (!existsSync(TASKS)) {
  console.error("harvey-labs corpus missing — run bash research/clone-repos.sh");
  process.exit(1);
}

function countDocs(dir) {
  // documents/ may be deeply nested (data-room folder trees); walk it all
  const byExt = {}; let n = 0, depth = 0;
  const walk = (d, lvl) => {
    let entries; try { entries = readdirSync(d); } catch { return; }
    depth = Math.max(depth, lvl);
    for (const e of entries) {
      const p = join(d, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, lvl + 1);
      else { n++; byExt[extname(e).toLowerCase() || "(none)"] = (byExt[extname(e).toLowerCase() || "(none)"] ?? 0) + 1; }
    }
  };
  walk(dir, 0);
  return { n, byExt, depth };
}

// task.json sits at VARYING depth — tasks/<area>/<slug>/, but also two and
// three levels deeper (e.g. diligence packs group tasks under a deal folder).
// A fixed-depth scan silently drops 867 of 2,010 tasks; walk for them instead.
function findTaskDirs(root) {
  const out = [];
  const walk = (d) => {
    let entries; try { entries = readdirSync(d); } catch { return; }
    if (entries.includes("task.json")) { out.push(d); return; } // task dirs do not nest
    for (const e of entries) {
      if (e === "documents") continue; // never recurse the document corpus
      const p = join(d, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
    }
  };
  walk(root);
  return out;
}

const commits = JSON.parse(readFileSync(REPO_COMMITS, "utf8"));
const sourceCommit = commits["harveyai@harvey-labs"];
if (!sourceCommit) {
  console.error(`source revision missing from ${REPO_COMMITS}`);
  process.exit(1);
}
const areas = readdirSync(TASKS).filter((d) => statSync(join(TASKS, d)).isDirectory()).sort();
const tasks = [];
{
  for (const tdir of findTaskDirs(TASKS)) {
    const relParts = relative(TASKS, tdir).split("/");
    const area = relParts[0];
    const slug = relParts.slice(1).join("/");
    const tjson = join(tdir, "task.json");
    let d; try { d = JSON.parse(readFileSync(tjson, "utf8")); } catch { continue; }
    const docsDir = join(tdir, "documents");
    const docs = existsSync(docsDir) ? countDocs(docsDir) : { n: 0, byExt: {}, depth: 0 };
    const crit = d.criteria ?? [];
    tasks.push({
      area, slug,
      title: d.title ?? "",
      work_type: d.work_type ?? "(none)",
      tags: d.tags ?? [],
      instruction_chars: String(d.instructions ?? "").length,
      deliverables: Object.keys(d.deliverables ?? {}),
      deliverable_exts: [...new Set(Object.keys(d.deliverables ?? {}).map((f) => extname(f).toLowerCase()))],
      criteria_count: crit.length,
      criteria_sample: crit.slice(0, 2).map((c) => ({
        id: c.id, title: c.title,
        match: String(c.match_criteria ?? "").slice(0, 260),
        binds: c.deliverables ?? [],
      })),
      documents: docs.n,
      document_exts: docs.byExt,
      document_tree_depth: docs.depth,
      evidence_path: relative(join(HERE, ".."), tjson),
    });
  }
}
tasks.sort((a, b) => {
  const left = `${a.area}/${a.slug}`, right = `${b.area}/${b.slug}`;
  return left < right ? -1 : left > right ? 1 : 0;
});

const tally = (arr, key) => arr.reduce((a, t) => {
  const v = typeof key === "function" ? key(t) : t[key];
  for (const x of Array.isArray(v) ? v : [v]) a[x] = (a[x] ?? 0) + 1;
  return a;
}, {});

const byWorkType = tally(tasks, "work_type");
const byArea = tally(tasks, "area");
const byDeliverableExt = tally(tasks, "deliverable_exts");
const docExtTotals = {};
for (const t of tasks) for (const [e, n] of Object.entries(t.document_exts)) docExtTotals[e] = (docExtTotals[e] ?? 0) + n;

const totalDocs = tasks.reduce((a, t) => a + t.documents, 0);
const totalCriteria = tasks.reduce((a, t) => a + t.criteria_count, 0);
const withDocs = tasks.filter((t) => t.documents > 0);

const DEST = join(HERE, "answers", "data");
mkdirSync(DEST, { recursive: true });
writeFileSync(join(DEST, "lab-corpus.json"), JSON.stringify({
  schema_version: 2,
  source_repo: "harveyai/harvey-labs",
  source_commit: sourceCommit,
  tasks: tasks.length, areas: areas.length,
  totals: { documents: totalDocs, criteria: totalCriteria },
  byWorkType, byArea, byDeliverableExt, docExtTotals,
  taskList: tasks,
}, null, 1));

console.log(`LAB corpus: ${tasks.length} tasks across ${areas.length} practice areas`);
console.log(`  input documents: ${totalDocs.toLocaleString()} (${withDocs.length} tasks ship documents)`);
console.log(`  rubric criteria: ${totalCriteria.toLocaleString()} (mean ${(totalCriteria / tasks.length).toFixed(1)} per task)`);
console.log("\nwork_type — LAB's own task-family taxonomy:");
for (const [k, n] of Object.entries(byWorkType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${k}`);
}
console.log("\ninput document formats:");
for (const [e, n] of Object.entries(docExtTotals).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(6)}  ${e}`);
}
console.log("\ndeliverable formats:");
for (const [e, n] of Object.entries(byDeliverableExt).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${String(n).padStart(5)}  ${e}`);
}
const deep = tasks.filter((t) => t.document_tree_depth >= 2).length;
console.log(`\ntasks whose documents sit in a nested folder tree (depth >= 2): ${deep}`);
const maxDocs = tasks.slice().sort((a, b) => b.documents - a.documents).slice(0, 5);
console.log("largest document corpora:");
for (const t of maxDocs) console.log(`  ${String(t.documents).padStart(5)} docs  ${t.area}/${t.slug}`);
