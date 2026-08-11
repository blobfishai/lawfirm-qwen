/**
 * Harvey LAB — the practice-area and contracting task sets.
 *
 * tasks       1,760 across 26 practice areas + a 498-task contracting lifecycle
 * seeded data per-task documents/ trees of real .docx/.xlsx/.eml/.pptx
 * tools       filesystem-shaped; LAB itself exposes bash/read/write/edit/glob/grep
 * verifier    JUDGE — ~57 prose rubric criteria per task, LLM-adjudicated
 * workflow    none declared beyond the deliverable list
 *
 * This adapter deliberately reports grading.kind = "judge". We can host the
 * documents verbatim (packs-lab does, for one task) but we cannot score the
 * rubric without a judge, and claiming otherwise would be the exact error
 * docs/PARITY.md exists to prevent.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walkFiles, gitCommit } from "../lib.mjs";

export const meta = { id: "harvey-practice", repo: "harveyai@harvey-labs", license: "MIT" };

export function port(repoDir) {
  const src = join(repoDir, "tasks");
  const files = walkFiles(src, (p) => p.endsWith("task.json") && !p.includes("firm-knowledge"));
  const tasks = files.map((p) => {
    const t = JSON.parse(readFileSync(p, "utf8"));
    return {
      id: `lab_${p.split("/tasks/")[1].replace(/\/task\.json$/, "").replace(/\//g, "__")}`,
      prompt: t.instructions ?? "", title: t.title ?? "",
      work_type: t.work_type ?? null,
      deliverables: Object.keys(t.deliverables ?? {}),
      criteria_count: (t.criteria ?? []).length,
      grading: "judge_only",
      provenance: { path: p.split("/harvey-labs/")[1] },
    };
  });
  return {
    source: { repo: meta.repo, commit: gitCommit(repoDir), path: "tasks/", license: meta.license,
              adaptations: [] },
    tasks,
    documents: { external_store: null,
                 note: "per-task documents/ trees, 51k+ files; not yet ingested" },
    tools: ["corpus_search", "corpus_read"],
    grading: { kind: "judge", key: "prose rubric criteria, LLM-adjudicated",
               ungraded: tasks.reduce((a, t) => a + t.criteria_count, 0) },
    gaps: [{ what: "scoring", why: "rubric is prose; no deterministic key extractable" },
           { what: "documents", why: "per-task corpora not yet ingested into world/corpus" }],
  };
}
