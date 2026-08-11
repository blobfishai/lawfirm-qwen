/**
 * LegalBench — 162 task directories of legal-reasoning classification.
 *
 * tasks       one per task directory; instances drawn deterministically
 * seeded data none — the instance text IS the input
 * tools       none; this is a prompting benchmark, not an agentic one
 * verifier    exact match on their `answer` column (deterministic)
 * workflow    none declared
 *
 * Only 16 tasks ship an official test split in the repo; the rest carry train
 * instances and the full test splits live on HuggingFace. Split is recorded per
 * task and never pooled — a train number is not a LegalBench test score.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseTsv, spread, gitCommit, has } from "../lib.mjs";

export const meta = { id: "legalbench", repo: "HazyResearch@legalbench", license: "MIT" };

export function port(repoDir, { instances = 5 } = {}) {
  const src = join(repoDir, "tasks");
  const tasks = [], gaps = [];
  for (const dir of readdirSync(src).sort()) {
    const d = join(src, dir);
    if (!statSync(d).isDirectory()) continue;
    const test = join(d, "test.tsv"), train = join(d, "train.tsv");
    const dataPath = has(test) ? test : has(train) ? train : null;
    if (!dataPath) { gaps.push({ what: dir, why: "no train.tsv or test.tsv in repo" }); continue; }
    const rows = parseTsv(readFileSync(dataPath, "utf8")).filter((r) => (r.answer ?? "").trim());
    if (!rows.length) { gaps.push({ what: dir, why: "no labelled rows" }); continue; }
    const labels = [...new Set(rows.map((r) => String(r.answer).trim()))];
    tasks.push({
      id: `lb_${dir}`,
      prompt: has(join(d, "base_prompt.txt"))
        ? readFileSync(join(d, "base_prompt.txt"), "utf8").slice(0, 4000) : "",
      split: dataPath === test ? "test" : "train",
      instances: spread(rows, instances).map((r) => {
        const { index, answer, ...rest } = r;
        return { index, expected: String(answer).trim(),
                 fields: Object.fromEntries(Object.entries(rest)
                   .map(([k, v]) => [k, String(v).slice(0, 6000)])) };
      }),
      instances_available: rows.length,
      label_space: labels.length <= 24 ? labels.sort() : null,
      provenance: { path: `tasks/${dir}/${dataPath === test ? "test" : "train"}.tsv` },
    });
  }
  return {
    source: { repo: meta.repo, commit: gitCommit(repoDir), path: "tasks/", license: meta.license,
      adaptations: ["a system line constrains output to the label; LegalBench prompts target "
        + "completion models and end in 'A:', so a chat model answers in prose and scores 0 "
        + "on tasks it is substantively right about"] },
    tasks,
    documents: [],
    tools: [],
    grading: { kind: "deterministic", key: "answer column, exact match (case/space normalised)",
               ungraded: 0 },
    gaps,
  };
}
