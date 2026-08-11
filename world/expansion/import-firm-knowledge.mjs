#!/usr/bin/env node
/**
 * Import the 250 Calderwood & Harkness firm-knowledge tasks, with a
 * DETERMINISTIC answer key extracted from their own rubric.
 *
 * Harvey grades these with an LLM judge against per-task rubrics. Reading the
 * rubrics shows that is not required for most of it: of 2,623 criteria, 2,515
 * (96%) name a specific matter id —
 *
 *   "Identifies matter 1001-00004 (Ardent Capital Partners) as containing at
 *    least one OFAC-referencing document."
 *
 * — and 201 of the 250 tasks consist ENTIRELY of such criteria. The ground
 * truth for those is a set of matter ids, which is checkable by string match
 * against the agent's answer. No judge, no variance, reproducible by anyone.
 *
 * That matters beyond convenience. An LLM-judged rubric cannot be proven to
 * reject a wrong answer without asking the judge, which is the thing under
 * test. A matter-id key can.
 *
 * It also lets us measure something their all-pass rubric does not report:
 * OVER-INCLUSION. A rubric of required criteria scores recall. An agent that
 * names every qualifying matter *and* twelve that do not qualify satisfies
 * every criterion. In a firm that is a false positive on a sanctions sweep, so
 * we record precision alongside recall and keep all-pass for comparability.
 *
 * The 49 tasks carrying prose criteria are imported with those criteria marked
 * `judge_required: true` and are excluded from the deterministic score.
 *
 * Emits world/blobfish/firm-knowledge-tasks.json.
 * Run: node world/expansion/import-firm-knowledge.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "research/repos/harveyai@harvey-labs/tasks/firm-knowledge/tasks");
if (!existsSync(SRC)) {
  console.error("firm-knowledge tasks missing — clone harveyai/harvey-labs first");
  process.exit(1);
}

const MATTER = /\b(\d{4}-\d{5})\b/g;

const tasks = [];
for (const dir of readdirSync(SRC).sort()) {
  const p = join(SRC, dir, "task.json");
  if (!existsSync(p)) continue;
  const t = JSON.parse(readFileSync(p, "utf8"));
  const criteria = (t.criteria ?? []).map((c) => {
    const text = `${c.match_criteria ?? ""} ${c.title ?? ""}`;
    const ids = [...new Set([...text.matchAll(MATTER)].map((m) => m[1]))];
    return {
      id: c.id,
      title: c.title,
      match_criteria: c.match_criteria,
      matter_ids: ids,
      judge_required: ids.length === 0,
    };
  });
  const keyed = criteria.filter((c) => !c.judge_required);
  const expected = [...new Set(keyed.flatMap((c) => c.matter_ids))].sort();
  tasks.push({
    task_id: `fk_${t.id}`,
    source_id: t.id,
    title: t.title,
    prompt: t.instructions,
    grading: keyed.length && criteria.every((c) => !c.judge_required) ? "deterministic"
      : keyed.length ? "mixed" : "judge_only",
    expected_matter_ids: expected,
    criteria,
    criteria_total: criteria.length,
    criteria_keyed: keyed.length,
    provenance: {
      repo: "harveyai/harvey-labs",
      path: `tasks/firm-knowledge/tasks/${dir}/task.json`,
      corpus: "world/corpus/ch (9,288 files, 266 matters, 46 clients)",
      license: "MIT",
    },
  });
}

const byGrading = tasks.reduce((a, t) => { a[t.grading] = (a[t.grading] ?? 0) + 1; return a; }, {});
const sizes = tasks.map((t) => t.expected_matter_ids.length).sort((a, b) => a - b);
const med = sizes[Math.floor(sizes.length / 2)];

writeFileSync(join(ROOT, "world/blobfish/firm-knowledge-tasks.json"), JSON.stringify({
  source: "harveyai/harvey-labs tasks/firm-knowledge",
  corpus: "world/corpus/ch",
  tasks: tasks.length,
  grading_breakdown: byGrading,
  criteria_total: tasks.reduce((a, t) => a + t.criteria_total, 0),
  criteria_keyed: tasks.reduce((a, t) => a + t.criteria_keyed, 0),
  note: "expected_matter_ids is the deterministic key, extracted from Harvey's own rubric text. "
    + "Tasks with prose criteria carry judge_required flags and are scored on their keyed "
    + "criteria only, with the prose portion reported as ungraded rather than assumed.",
  taskList: tasks,
}, null, 1));

console.log(`imported ${tasks.length} firm-knowledge tasks`);
console.log(`  grading: ${JSON.stringify(byGrading)}`);
console.log(`  criteria: ${tasks.reduce((a, t) => a + t.criteria_total, 0)} total, ` +
  `${tasks.reduce((a, t) => a + t.criteria_keyed, 0)} with a matter-id key`);
console.log(`  expected matters per task: median ${med}, max ${sizes[sizes.length - 1]}`);
console.log("-> world/blobfish/firm-knowledge-tasks.json");
