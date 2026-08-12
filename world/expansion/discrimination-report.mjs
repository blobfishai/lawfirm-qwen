#!/usr/bin/env node
/**
 * Classify a raw discrimination sweep and enforce the admission policy.
 *
 * `world/local/discriminate.py --report-only` deliberately records all raw
 * adversarial acceptances.  A wrong-value acceptance is a defect only when a
 * verifier claims a determinate answer key; prose/state-only tasks are instead
 * reported as `no-answer-key`.  Behavioral leaks, missing episodes, malformed
 * reports, and claimed-but-unenforced keys are CI failures.
 *
 * Emits docs/DISCRIMINATION.md + data/discrimination.json and exits non-zero
 * on BROKEN-GUARD, BROKEN-KEY, or HARNESS-ERROR.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return resolve(ROOT, index === -1 ? fallback : process.argv[index + 1]);
}

const SWEEP = option("--sweep", "world/local/discrimination-report.json");
const WORLD = option("--world", "world/blobfish/world-v16.json");
const DOC_OUT = option("--docs-out", "docs/DISCRIMINATION-v16.md");
const DATA_OUT = option("--data-out", "data/discrimination-v16-classified.json");

for (const [label, path] of [["sweep", SWEEP], ["world", WORLD]]) {
  if (!existsSync(path)) {
    console.error(`missing ${label}: ${path}`);
    process.exit(2);
  }
}

const sweep = JSON.parse(readFileSync(SWEEP, "utf8"));
const raw = JSON.parse(readFileSync(WORLD, "utf8"));
const world = raw.world ?? raw;
const taskById = Object.fromEntries(world.tasks.map((task) => [task.task_id, task]));
const verifierById = Object.fromEntries(
  (world.verifiers ?? []).map((verifier) => [verifier.task_id, verifier]),
);

/** Assertions that bind an answer, rather than workflow structure or damage guards. */
const KEY_RE = /(_is_|_equals_|required_documents_read|no_forbidden_|_absent$|_count_is)/;
const STRUCTURAL = new Set([
  "state_changed", "reads_before_writes", "no_shortcut_direct_update",
  "required_workflow_path", "no_offtask_table_changes", "no_rows_destroyed",
  "no_undeclared_rows_created", "audit_logs_append_only", "all_tools_succeeded",
]);
const MODES = ["noop", "text_only", "blind_write", "wrong_value"];
const globalErrors = [];
const assertionManifestDrift = [];

function keyAssertions(taskId) {
  const verifier = verifierById[taskId];
  if (!verifier || typeof verifier.vcode !== "string") {
    globalErrors.push(`verifier ${taskId} is missing executable VCode`);
    return [];
  }
  const declared = Array.isArray(verifier.assertions) ? verifier.assertions : [];
  // V16+ generated verifiers carry the source check grammar. It is a more
  // precise answer-key declaration than naming heuristics: required reads are
  // workflow/evidence guards, while direct/payload pins, grounded anchors and
  // forbidden values bind the answer content. The compiler has already
  // regenerated the complete assertion manifest from this grammar.
  if (verifier.check_grammar?.schema === "lawfirm.check-grammar.v1") {
    const grammar = verifier.check_grammar;
    const keys = [];
    for (const [index, row] of (grammar.rows ?? []).entries()) {
      for (const field of Object.keys(row.direct_pins ?? {})) {
        keys.push(`effect_${index}_direct_${field}`);
      }
      for (const field of Object.keys(row.payload_pins ?? {})) {
        keys.push(`effect_${index}_payload_${field}`);
      }
      for (const groundedIndex of (row.grounded ?? []).keys()) {
        keys.push(`effect_${index}_grounded_${groundedIndex}`);
        keys.push(`effect_${index}_no_unsupported_${groundedIndex}`);
      }
    }
    for (const index of (grammar.forbidden ?? []).keys()) {
      keys.push(`forbidden_${index}`);
    }
    const missing = keys.filter((name) => !declared.includes(name));
    if (missing.length) {
      assertionManifestDrift.push({ task: taskId, missing: missing.slice(0, 12) });
    }
    return [...new Set(keys)];
  }
  // V15's assertion metadata predates several verifier templates and is
  // incomplete for 149 tasks. The executed VCode is authoritative. Every chk
  // call in the shipped world uses a JSON string literal, so extract those
  // names and fail closed if a future dynamic call cannot be accounted for.
  const executed = [...verifier.vcode.matchAll(/chk\(\s*("(?:\\.|[^"\\])*")/g)]
    .map((match) => JSON.parse(match[1]));
  const callCount = (verifier.vcode.match(/\bchk\s*\(/g) ?? []).length - 1;
  if (executed.length !== callCount) {
    globalErrors.push(
      `verifier ${taskId} has ${callCount} chk calls but ${executed.length} literal assertion names`,
    );
  }
  const missing = [...new Set(executed)].filter((name) => !declared.includes(name));
  if (missing.length) {
    assertionManifestDrift.push({ task: taskId, missing: missing.slice(0, 12) });
  }
  return [...new Set([...declared, ...executed])]
    .filter((name) => typeof name === "string")
    .filter((name) => !STRUCTURAL.has(name) && !/^rows_inserted_into_/.test(name))
    .filter((name) => KEY_RE.test(name));
}

const rawRows = Array.isArray(sweep.rows) ? sweep.rows : [];
const sweepRowsById = new Map();
for (const row of rawRows) {
  if (!row || typeof row.task_id !== "string") {
    globalErrors.push("sweep contains a row without task_id");
    continue;
  }
  if (sweepRowsById.has(row.task_id)) {
    globalErrors.push(`sweep contains duplicate row for ${row.task_id}`);
  }
  if (!taskById[row.task_id]) {
    globalErrors.push(`sweep contains unknown task ${row.task_id}`);
  }
  sweepRowsById.set(row.task_id, row);
}
if (rawRows.length !== world.tasks.length) {
  globalErrors.push(`sweep row count ${rawRows.length} != world task count ${world.tasks.length}`);
}
if (sweep.summary?.tasks !== rawRows.length) {
  globalErrors.push(`sweep summary count ${sweep.summary?.tasks} != row count ${rawRows.length}`);
}
for (const error of sweep.summary?.harness_errors ?? []) {
  globalErrors.push(
    `raw harness error: ${error.task_id ?? "unknown"}/${error.mode ?? "unknown"}: ${error.error ?? "unknown"}`,
  );
}

const rows = world.tasks.map((task) => {
  const rawRow = sweepRowsById.get(task.task_id);
  const keys = keyAssertions(task.task_id);
  const anchor = (task.provenance?.source_workflow ?? "").split(":")[0] || "graph-walk";
  if (!rawRow) {
    return {
      task: task.task_id, anchor, verdict: "HARNESS-ERROR", keys: keys.length,
      accepted: [], keyNames: keys.slice(0, 4), errors: ["missing sweep row"],
    };
  }

  const errors = MODES.flatMap((mode) => {
    const episode = rawRow[mode];
    if (!episode || typeof episode.passed !== "boolean") {
      return [`${mode}: ${episode?.error ?? "missing or malformed episode"}`];
    }
    return [];
  });
  const accepted = MODES.filter((mode) => rawRow[mode]?.passed === true);
  const wrongValue = rawRow.wrong_value ?? {};
  let verdict = "discriminating";
  if (errors.length) verdict = "HARNESS-ERROR";
  else if (accepted.some((mode) => mode !== "wrong_value")) verdict = "BROKEN-GUARD";
  else if (wrongValue.passed && keys.length) verdict = "BROKEN-KEY";
  else if (wrongValue.passed) verdict = "no-answer-key";
  else if (wrongValue.write_errored) verdict = "key-inconclusive";
  return {
    task: task.task_id, anchor, verdict, keys: keys.length, accepted,
    keyNames: keys.slice(0, 4), ...(errors.length ? { errors } : {}),
  };
});

const VERDICTS = [
  "discriminating", "no-answer-key", "key-inconclusive",
  "BROKEN-KEY", "BROKEN-GUARD", "HARNESS-ERROR",
];
const by = (verdict) => rows.filter((row) => row.verdict === verdict);
const counts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, by(verdict).length]));

const anchorRoll = {};
for (const row of rows) {
  const anchor = (anchorRoll[row.anchor] ??= { n: 0, weak: 0 });
  anchor.n++;
  if (row.verdict === "no-answer-key") anchor.weak++;
}

const out = [];
out.push("# Discrimination audit — does each task reject wrong behavior?");
out.push("");
out.push("The oracle proves a task is *satisfiable*: its reference walk executes and passes. That is");
out.push("half of admission. A task that ALSO passes when the agent does nothing, reads without");
out.push("writing, or writes the wrong value grades nothing — and measuring a model on it spends");
out.push("money to learn noise.");
out.push("");
out.push("`world/local/discriminate.py` drives four adversarial episodes per task against the live");
out.push("world. This classifier distinguishes an unenforced claimed key from a task that declares");
out.push("no determinate content key:");
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
out.push(`| discriminating | ${counts["discriminating"]} | rejects all four modes |`);
out.push(`| no-answer-key | ${counts["no-answer-key"]} | rejects behavioral modes; declares no pinned content assertion, so corrupted prose is not mechanically rejected |`);
out.push(`| key-inconclusive | ${counts["key-inconclusive"]} | the corrupted write was rejected by the tool itself, so the verifier key was not exercised |`);
out.push(`| **BROKEN-KEY** | ${counts["BROKEN-KEY"]} | claims an answer key, yet a corrupted write still passes — a defect |`);
out.push(`| **BROKEN-GUARD** | ${counts["BROKEN-GUARD"]} | accepts no-op, text-only, or blind-write — a defect |`);
out.push(`| **HARNESS-ERROR** | ${counts["HARNESS-ERROR"]} | an episode is missing or malformed — no task verdict may be inferred |`);
out.push("");
out.push(`Assertion-manifest diagnostic: ${assertionManifestDrift.length} verifier(s) omit one or more`);
out.push("declared key assertions from metadata. Classification uses the explicit check grammar when");
out.push("present and executed VCode for legacy verifiers; any drift is an admission defect.");
out.push("");

if (counts["BROKEN-KEY"] || counts["BROKEN-GUARD"] || counts["HARNESS-ERROR"] || globalErrors.length) {
  out.push("### Admission blockers");
  out.push("");
  out.push("| Task | Verdict | Accepted modes / error | Key assertions |");
  out.push("|---|---|---|---|");
  for (const row of [...by("BROKEN-GUARD"), ...by("BROKEN-KEY"), ...by("HARNESS-ERROR")]) {
    const detail = row.errors?.join("; ") || row.accepted.join(", ");
    out.push(`| ${row.task} | ${row.verdict} | ${detail || "—"} | ${row.keyNames.join(", ") || "—"} |`);
  }
  for (const error of globalErrors) {
    out.push(`| *(global)* | HARNESS-ERROR | ${error} | — |`);
  }
  out.push("");
}

out.push("### What `no-answer-key` means for measurement");
out.push("");
out.push("These tasks still grade real behavior — the workflow path, evidence-before-write, the");
out.push("insertion, and anti-hack guards all bind. They do not grade the CONTENT of the deliverable.");
out.push("That is an explicit coverage gap, not a silent pass: grounded assertions introduced in M4");
out.push("must convert these tasks to content-discriminating tasks before the v17 headline set.");
out.push("");
out.push("| Anchor | Tasks | No answer key |");
out.push("|---|---|---|");
for (const [anchor, value] of Object.entries(anchorRoll).sort((a, b) => b[1].n - a[1].n)) {
  out.push(`| ${anchor} | ${value.n} | ${value.weak} |`);
}
out.push("");
out.push(`*Regenerate: serve ${WORLD.slice(ROOT.length + 1)} with \`--v2-contracts mcp/v3/contracts\`, then run*`);
out.push("*`python3 world/local/discriminate.py --report-only` and*");
out.push("*`node world/expansion/discrimination-report.mjs`.*");

const report = {
  world: WORLD.slice(ROOT.length + 1),
  sweep: SWEEP.slice(ROOT.length + 1),
  counts,
  rows,
  anchorRoll,
  globalErrors,
  assertionManifestDrift,
};
writeFileSync(DOC_OUT, `${out.join("\n")}\n`);
writeFileSync(DATA_OUT, JSON.stringify(report, null, 1));

const blockers = counts["BROKEN-KEY"] + counts["BROKEN-GUARD"]
  + counts["HARNESS-ERROR"] + globalErrors.length;
console.log(`discrimination: ${JSON.stringify(counts)} -> ${DOC_OUT}`);
if (blockers) {
  console.error(`discrimination admission failed: ${blockers} blocker(s)`);
  process.exitCode = 1;
}
