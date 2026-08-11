/**
 * CUAD — 510 contracts, 41 clause categories, expert-annotated spans.
 *
 * tasks       one per clause category (41), each with instances drawn across
 *             contracts and BALANCED between answerable and impossible
 * seeded data the contract text ships with each instance
 * tools       none — extraction from provided text
 * verifier    DETERMINISTIC. Answerable: the gold span must appear in the
 *             response. Impossible: the response must ABSTAIN.
 * workflow    none declared
 *
 * The reason this port matters more than its task count: 2,938 of the 4,182
 * test QAs (70%) are `is_impossible` — the category is absent and the correct
 * answer is to say so. CUAD is, in bulk, a test of NOT fabricating, which is
 * the same thing our forbidden-value traps grade. Sampling here deliberately
 * keeps both classes so a model cannot score by always abstaining or never
 * abstaining.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spread, gitCommit, has } from "../lib.mjs";

export const meta = { id: "cuad", repo: "TheAtticusProject@cuad", license: "CC-BY-4.0" };
const DATA = "research/repos/_extracted/cuad/test.json";

export function port(repoDir, { instances = 6 } = {}) {
  const root = repoDir.split("/research/repos/")[0];
  const p = join(root, DATA);
  if (!has(p)) {
    return { source: { repo: meta.repo, commit: gitCommit(repoDir), path: DATA, license: meta.license, adaptations: [] },
             tasks: [], documents: [], tools: [],
             grading: { kind: "deterministic", key: "gold span / abstention", ungraded: 0 },
             gaps: [{ what: "data", why: "data.zip not extracted to research/repos/_extracted/cuad" }] };
  }
  const d = JSON.parse(readFileSync(p, "utf8"));
  const byCat = new Map();
  for (const c of d.data) {
    for (const para of c.paragraphs) {
      for (const qa of para.qas) {
        // "Document Name" etc. — the category is the quoted phrase in the question
        const m = /related to "([^"]+)"/.exec(qa.question);
        const cat = m ? m[1] : qa.question.slice(0, 40);
        if (!byCat.has(cat)) byCat.set(cat, { yes: [], no: [] });
        const rec = { contract: c.title, question: qa.question,
                      context: String(para.context ?? "").slice(0, 12000),
                      expected: qa.is_impossible ? "__abstain__"
                        : String(qa.answers?.[0]?.text ?? "").slice(0, 400),
                      impossible: !!qa.is_impossible };
        byCat.get(cat)[qa.is_impossible ? "no" : "yes"].push(rec);
      }
    }
  }
  const tasks = [];
  for (const [cat, sets] of byCat) {
    // balance the two classes so abstain-always and never-abstain both fail
    const half = Math.max(1, Math.floor(instances / 2));
    const inst = [...spread(sets.yes, half), ...spread(sets.no, instances - half)];
    if (!inst.length) continue;
    tasks.push({
      id: `cuad_${cat.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      title: cat,
      prompt: `Identify the "${cat}" clause in the contract below. Quote the operative language `
        + `verbatim. If the contract contains no such clause, reply exactly: NONE`,
      instances: inst,
      instances_available: sets.yes.length + sets.no.length,
      answerable: sets.yes.length, impossible: sets.no.length,
      label_space: null,
      provenance: { path: "data.zip::test.json" },
    });
  }
  const imp = tasks.reduce((a, t) => a + t.impossible, 0);
  const ans = tasks.reduce((a, t) => a + t.answerable, 0);
  return {
    source: { repo: meta.repo, commit: gitCommit(repoDir), path: DATA, license: meta.license,
      adaptations: ["responses are graded by whether the gold span appears in the answer "
        + "(normalised whitespace/case) rather than by exact SQuAD span offsets, because the "
        + "agent returns prose rather than character indices"] },
    tasks,
    documents: [],
    tools: [],
    grading: { kind: "deterministic",
               key: `gold span containment; "${"__abstain__"}" for the ${imp} impossible QAs `
                    + `(${(100 * imp / (imp + ans)).toFixed(0)}% of the set)`,
               ungraded: 0 },
    gaps: [],
  };
}
