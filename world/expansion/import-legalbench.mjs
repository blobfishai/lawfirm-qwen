#!/usr/bin/env node
/**
 * Import LegalBench — their prompts, their instances, their labels.
 *
 * This is the parity fix for the biggest offender in docs/PARITY.md. Our
 * "legalbench-anchored" pack was 14 tasks written from my own knowledge using
 * ZERO of their data, while the repo on disk ships 162 task directories with
 * real instances and real gold labels. That is not coverage of LegalBench and
 * this file replaces the claim with the thing itself.
 *
 * WHAT IS ACTUALLY IN THE REPO (measured, not assumed):
 *   162 task directories, each with base_prompt.txt (their prompt)
 *   161 with train.tsv   —  2,709 labelled instances
 *    16 with test.tsv    — 10,219 labelled instances (the official test split)
 * The remaining test splits are hosted on HuggingFace, not in the repo. We host
 * what is on disk and RECORD WHICH SPLIT each task came from, because a number
 * computed on train instances is not a LegalBench test score and must never be
 * printed as one.
 *
 * Granularity: one world task per LegalBench task (162), each presenting K
 * instances drawn deterministically from their data. That preserves the
 * benchmark's own task granularity — parity is 162/162 — while keeping the run
 * affordable. Grading is exact match against their `answer` column, normalised
 * for case and surrounding whitespace only.
 *
 * Emits world/blobfish/legalbench-tasks.json.
 * Run: node world/expansion/import-legalbench.mjs [--instances 5]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "research/repos/HazyResearch@legalbench/tasks");
const argv = process.argv.slice(2);
const K = Number(argv.includes("--instances") ? argv[argv.indexOf("--instances") + 1] : 5);

if (!existsSync(SRC)) { console.error("legalbench not cloned"); process.exit(1); }

/** TSV with quoted fields containing tabs/newlines is common here — parse properly. */
function parseTsv(text) {
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === "\t") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length >= head.length - 1).map((r) =>
    Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/** Deterministic spread across the file rather than the first K rows. */
function pick(rows, k) {
  if (rows.length <= k) return rows;
  const step = rows.length / k;
  return Array.from({ length: k }, (_, i) => rows[Math.floor(i * step)]);
}

const tasks = [];
const skipped = [];
for (const dir of readdirSync(SRC).sort()) {
  const d = join(SRC, dir);
  if (!statSync(d).isDirectory()) continue;
  const promptPath = join(d, "base_prompt.txt");
  const testPath = join(d, "test.tsv");
  const trainPath = join(d, "train.tsv");
  const dataPath = existsSync(testPath) ? testPath : existsSync(trainPath) ? trainPath : null;
  if (!dataPath) { skipped.push({ task: dir, reason: "no train.tsv or test.tsv on disk" }); continue; }
  const split = dataPath === testPath ? "test" : "train";
  const rows = parseTsv(readFileSync(dataPath, "utf8"));
  const labelled = rows.filter((r) => (r.answer ?? "").trim());
  if (!labelled.length) { skipped.push({ task: dir, reason: "no labelled rows" }); continue; }

  const instances = pick(labelled, K).map((r) => {
    const { index, answer, ...rest } = r;
    return { index, answer: String(answer).trim(),
             fields: Object.fromEntries(Object.entries(rest).map(([k2, v]) => [k2, String(v).slice(0, 6000)])) };
  });
  const labels = [...new Set(labelled.map((r) => String(r.answer).trim()))];

  tasks.push({
    task_id: `lb_${dir}`,
    legalbench_task: dir,
    prompt_template: existsSync(promptPath) ? readFileSync(promptPath, "utf8").slice(0, 4000) : "",
    split,
    instances,
    instances_available: labelled.length,
    label_space: labels.length <= 24 ? labels.sort() : null,
    provenance: {
      repo: "HazyResearch/legalbench",
      path: `tasks/${dir}/${split}.tsv`,
      grading: "exact match on the `answer` column, case-insensitive, trimmed",
      note: split === "train"
        ? "TRAIN split — the official test split is not in the repo. A score here is NOT a LegalBench test score."
        : "official test split as shipped in the repo",
    },
  });
}

const bySplit = tasks.reduce((a, t) => { a[t.split] = (a[t.split] ?? 0) + 1; return a; }, {});
const totalInst = tasks.reduce((a, t) => a + t.instances.length, 0);

writeFileSync(join(ROOT, "world/blobfish/legalbench-tasks.json"), JSON.stringify({
  source: "HazyResearch/legalbench",
  tasks: tasks.length,
  instances_per_task: K,
  instances_total: totalInst,
  split_breakdown: bySplit,
  skipped,
  note: "Their prompts, their instances, their gold labels. Split is recorded per task; "
    + "train-split scores are not LegalBench test scores and are reported separately.",
  taskList: tasks,
}, null, 1));

console.log(`imported ${tasks.length} LegalBench tasks (${JSON.stringify(bySplit)})`);
console.log(`  instances: ${totalInst} (${K} per task, drawn deterministically)`);
console.log(`  available upstream: ${tasks.reduce((a, t) => a + t.instances_available, 0).toLocaleString()} labelled rows`);
if (skipped.length) console.log(`  skipped: ${skipped.length} (${skipped.slice(0, 3).map((s) => s.task).join(", ")}…)`);
console.log("-> world/blobfish/legalbench-tasks.json");
