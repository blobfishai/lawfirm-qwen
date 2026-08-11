/**
 * MAUD — merger agreement understanding, expert multiple-choice.
 *
 * tasks       one per distinct question (deal-point), instances across contracts
 * seeded data the excerpted contract text ships with each instance
 * tools       none — classification from provided text
 * verifier    DETERMINISTIC exact match on their `answer` column
 * workflow    none declared
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spread, gitCommit, has } from "../lib.mjs";

export const meta = { id: "maud", repo: "TheAtticusProject@maud", license: "CC-BY-4.0" };
const DATA = "research/repos/_extracted/maud/data/MAUD_test.csv";

function parseCsv(text) {
  const rows = []; let f = "", row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false; else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows[0] ?? [];
  return rows.slice(1).filter((r) => r.length >= head.length - 1)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

export function port(repoDir, { instances = 5 } = {}) {
  const root = repoDir.split("/research/repos/")[0];
  const p = join(root, DATA);
  if (!has(p)) {
    return { source: { repo: meta.repo, commit: gitCommit(repoDir), path: DATA, license: meta.license, adaptations: [] },
             tasks: [], documents: [], tools: [],
             grading: { kind: "deterministic", key: "answer column", ungraded: 0 },
             gaps: [{ what: "data", why: "data.zip not extracted to research/repos/_extracted/maud" }] };
  }
  const rows = parseCsv(readFileSync(p, "utf8")).filter((r) => (r.answer ?? "").trim() && (r.question ?? "").trim());
  const byQ = new Map();
  for (const r of rows) {
    if (!byQ.has(r.question)) byQ.set(r.question, []);
    byQ.get(r.question).push(r);
  }
  const tasks = [];
  let i = 0;
  for (const [question, rs] of byQ) {
    const labels = [...new Set(rs.map((r) => String(r.answer).trim()))];
    tasks.push({
      id: `maud_${String(++i).padStart(3, "0")}`,
      title: question.slice(0, 90),
      prompt: question,
      instances: spread(rs, instances).map((r) => ({
        contract: r.contract_name,
        fields: { text: String(r.text ?? "").slice(0, 12000) },
        expected: String(r.answer).trim(),
      })),
      instances_available: rs.length,
      label_space: labels.length <= 24 ? labels.sort() : null,
      provenance: { path: "data.zip::data/MAUD_test.csv" },
    });
  }
  return {
    source: { repo: meta.repo, commit: gitCommit(repoDir), path: DATA, license: meta.license,
              adaptations: ["a system line constrains output to the label, as for LegalBench"] },
    tasks, documents: [], tools: [],
    grading: { kind: "deterministic", key: "answer column, exact match", ungraded: 0 },
    gaps: [],
  };
}
