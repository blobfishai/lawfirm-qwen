#!/usr/bin/env node
/**
 * Classifies the discrimination sweep (world/local/discriminate.py).
 *
 * A corrupted write payload that still passes is only a BUG when the task
 * claims an answer key. Two very different things look identical in the raw
 * sweep output:
 *
 *   BROKEN KEY   the verifier has pinned-value assertions (`*_is_<value>`,
 *                required_documents_read, forbidden-row traps) and the
 *                corrupted write passed anyway — the key does not bind.
 *                This is a defect.
 *
 *   NO KEY       the verifier has no pinned-value assertion at all. It grades
 *                the workflow, the reads and the insertion, but nothing about
 *                WHAT was written. Corrupting free prose cannot be detected by
 *                construction, so this is not a bug — it is a statement about
 *                how much the task actually grades, and it belongs in the
 *                headline as a quality number.
 *
 * Emits docs/DISCRIMINATION.md + data/discrimination.json.
 * Run: node world/expansion/discrimination-report.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SWEEP = join(ROOT, "world", "local", "discrimination-report.json");
if (!existsSync(SWEEP)) {
  console.error("no sweep output — run world/local/discriminate.py first");
  process.exit(1);
}
const sweep = JSON.parse(readFileSync(SWEEP, "utf8"));
const raw = JSON.parse(readFileSync(join(ROOT, "world/blobfish/world-v6.json"), "utf8"));
const world = raw.world ?? raw;
const taskById = Object.fromEntries(world.tasks.map((t) => [t.task_id, t]));

/** Assertions that bind an actual answer, as opposed to structure/guards. */
const KEY_RE = /(_is_|_equals_|required_documents_read|no_forbidden_|_absent$|_count_is)/;
const STRUCTURAL = new Set([
  "state_changed", "reads_before_writes", "no_shortcut_direct_update",
  "required_workflow_path", "no_offtask_table_changes", "no_rows_destroyed",
  "no_undeclared_rows_created", "audit_logs_append_only", "all_tools_succeeded",
]);

function keyAssertions(taskId) {
  const p = join(ROOT, "tasks", taskId, "verifier.py");
  if (!existsSync(p)) return [];
  const src = readFileSync(p, "utf8");
  return [...src.matchAll(/chk\(\s*"([a-z_0-9]+)"/g)].map((m) => m[1])
    .filter((n) => !STRUCTURAL.has(n) && !/^rows_inserted_into_/.test(n))
    .filter((n) => KEY_RE.test(n));
}

const MODES = ["noop", "text_only", "blind_write", "wrong_value"];
const rows = sweep.rows.map((r) => {
  const keys = keyAssertions(r.task_id);
  const wv = r.wrong_value ?? {};
  const accepted = MODES.filter((m) => (r[m] ?? {}).passed);
  const anchor = (taskById[r.task_id]?.provenance?.source_workflow ?? "").split(":")[0] || "graph-walk";
  let verdict = "discriminating";
  if (accepted.some((m) => m !== "wrong_value")) verdict = "BROKEN-GUARD";
  else if (wv.passed && keys.length) verdict = "BROKEN-KEY";
  else if (wv.passed) verdict = "no-answer-key";
  else if (wv.write_errored) verdict = "key-inconclusive";
  return { task: r.task_id, anchor, verdict, keys: keys.length, accepted,
    keyNames: keys.slice(0, 4) };
});

const by = (v) => rows.filter((r) => r.verdict === v);
const counts = Object.fromEntries(
  ["discriminating", "no-answer-key", "key-inconclusive", "BROKEN-KEY", "BROKEN-GUARD"]
    .map((v) => [v, by(v).length]));

const anchorRoll = {};
for (const r of rows) {
  const a = (anchorRoll[r.anchor] ??= { n: 0, weak: 0 });
  a.n++; if (r.verdict === "no-answer-key") a.weak++;
}

const out = [];
out.push("# Discrimination audit — does each task reject wrong behavior?");
out.push("");
out.push("The oracle proves a task is *satisfiable*: its reference walk executes and passes. That is");
out.push("half of admission. A task that ALSO passes when the agent does nothing, reads without");
out.push("writing, writes without reading, or writes the wrong value grades nothing — and measuring a");
out.push("model on it spends money to learn noise.");
out.push("");
out.push("`world/local/discriminate.py` drives four adversarial episodes per task against the live");
out.push("world and records whether the verifier rejects each:");
out.push("");
out.push("| Mode | What the fake agent does |");
out.push("|---|---|");
out.push("| `noop` | no calls at all |");
out.push("| `text_only` | every read checkpoint, no writes — the deliverable-in-chat mode |");
out.push("| `blind_write` | every write checkpoint, no reads — the shortcut mode |");
out.push("| `wrong_value` | the full reference walk, terminal write payload corrupted (ids preserved) |");
out.push("");
out.push(`## Result over ${rows.length} tasks`);
out.push("");
out.push("| Verdict | Tasks | Meaning |");
out.push("|---|---|---|");
out.push(`| discriminating | ${counts["discriminating"]} | rejects all four |`);
out.push(`| no-answer-key | ${counts["no-answer-key"]} | rejects the three behavioral modes; has no pinned-value assertion, so a corrupted payload cannot be caught **by construction** |`);
out.push(`| key-inconclusive | ${counts["key-inconclusive"]} | the corrupted write was rejected by the tool itself (enum/constraint), so the episode proves nothing about the key |`);
out.push(`| **BROKEN-KEY** | ${counts["BROKEN-KEY"]} | claims an answer key, yet a corrupted write still passes — a defect |`);
out.push(`| **BROKEN-GUARD** | ${counts["BROKEN-GUARD"]} | accepts no-op, text-only or blind-write — a defect |`);
out.push("");
if (counts["BROKEN-KEY"] || counts["BROKEN-GUARD"]) {
  out.push("### Defects");
  out.push("");
  out.push("| Task | Verdict | Accepted modes | Key assertions |");
  out.push("|---|---|---|---|");
  for (const r of [...by("BROKEN-GUARD"), ...by("BROKEN-KEY")]) {
    out.push(`| ${r.task} | ${r.verdict} | ${r.accepted.join(", ")} | ${r.keyNames.join(", ") || "—"} |`);
  }
  out.push("");
}
out.push("### What `no-answer-key` means for measurement");
out.push("");
out.push("These tasks still grade real behavior — the workflow path, evidence-before-write, the");
out.push("insertion, and the anti-hack guards all bind. What they do not grade is the CONTENT of the");
out.push("deliverable. For a prose deliverable (a memo, a report) that is unavoidable: there is no");
out.push("exact string to pin. For a determinate answer (a number, a status, an enum) it is a gap, and");
out.push("the fix is to pin the value in the verifier rather than to drop the task.");
out.push("");
out.push("| Anchor | Tasks | No answer key |");
out.push("|---|---|---|");
for (const [a, v] of Object.entries(anchorRoll).sort((x, y) => y[1].n - x[1].n)) {
  out.push(`| ${a} | ${v.n} | ${v.weak} |`);
}
out.push("");
out.push("*Regenerate: serve the world with `--v2-contracts mcp/v3/contracts`, then*");
out.push("*`python3 world/local/discriminate.py && node world/expansion/discrimination-report.mjs`.*");

writeFileSync(join(ROOT, "docs", "DISCRIMINATION.md"), out.join("\n") + "\n");
writeFileSync(join(ROOT, "data", "discrimination.json"),
  JSON.stringify({ counts, rows, anchorRoll }, null, 1));
console.log(`discrimination: ${JSON.stringify(counts)} -> docs/DISCRIMINATION.md`);
