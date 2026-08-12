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
 * source-native rubric without a judge. v17 imports every file into the
 * content-addressed LAB evidence store; deterministic criterion compilation
 * is a separate admission gate, so evidence-ready is never conflated with
 * score-ready.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walkFiles, gitCommit } from "../lib.mjs";

export const meta = { id: "harvey-practice", repo: "harveyai@harvey-labs", license: "MIT" };

function deliverablesOf(task) {
  const declared = Object.keys(task.deliverables ?? {});
  if (declared.length) return declared;
  const output = String(task.instructions ?? "").match(
    /(?:^|\n)#{0,3}\s*Output:\s*(?:\n\s*)?`?([^`\n]+\.(?:docx|xlsx|pptx|md|pdf))`?/i,
  );
  return output ? [output[1].trim()] : [];
}

export function port(repoDir) {
  const src = join(repoDir, "tasks");
  const commit = gitCommit(repoDir);
  const files = walkFiles(src, (p) => p.endsWith("task.json") && !p.includes("firm-knowledge"));
  const tasks = files.map((p) => {
    const t = JSON.parse(readFileSync(p, "utf8"));
    const sourceTask = p.split("/tasks/")[1].replace(/\/task\.json$/, "");
    const deliverables = deliverablesOf(t);
    return {
      id: `lab_${p.split("/tasks/")[1].replace(/\/task\.json$/, "").replace(/\//g, "__")}`,
      prompt: t.instructions ?? "", title: t.title ?? "",
      work_type: t.work_type ?? null,
      deliverables,
      criteria_count: (t.criteria ?? []).length,
      grading: "judge_only",
      file_lane: {
        source_task: sourceTask,
        source_commit: commit,
        documents_source: `research/repos/${meta.repo}/tasks/${sourceTask}/documents`,
        deliverables,
        skills: ["docx", "xlsx", "pptx"],
      },
      provenance: { path: `tasks/${sourceTask}/task.json` },
    };
  });
  const missingOutputContract = tasks.filter((task) => task.deliverables.length === 0)
    .map((task) => task.id);
  return {
    source: { repo: meta.repo, commit, path: "tasks/", license: meta.license,
              adaptations: [] },
    tasks,
    documents: { external_store: "world/corpus/lab",
                 source_lock: "world/ingest/lab-source-lock.json",
                 note: "51,683 task-local files; exact bytes + extracted text + provenance" },
    tools: ["documents_search_fulltext", "documents_download", "documents_create"],
    file_lane: {
      tasks: tasks.length,
      exact_filename_contracts: tasks.length - missingOutputContract.length,
      missing_filename_contracts: missingOutputContract,
    },
    grading: { kind: "judge", key: "prose rubric criteria, LLM-adjudicated",
               ungraded: tasks.reduce((a, t) => a + t.criteria_count, 0) },
    gaps: [{ what: "admission", why: "criteria remain excluded until propose-validate-compile and discrimination pass" }],
  };
}
