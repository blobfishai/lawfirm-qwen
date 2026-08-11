#!/usr/bin/env node
/**
 * Which archived verdicts does the corrected path rule supersede?
 *
 * `required_workflow_path` used to grade the reference solution's browsing
 * order (see world/expansion/fix-path-ordering.mjs). The path assertion is a
 * pure function of the trace's tool sequence — no world state — so unlike the
 * seed-baseline quarantine, its outcome CAN be recomputed offline exactly.
 *
 * An archived failure is "superseded" when the corrected rule is satisfied and
 * the path check was its ONLY failed condition: its recorded verdict is wrong
 * under the rule the world now ships.
 *
 * Emits data/path-rule-rescore.json + reports/PATH-RULE-RESCORE.md.
 * Run: node sim/rescore-path-rule.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = (() => { const r = JSON.parse(readFileSync(join(ROOT, "world/blobfish/world-v12.json"), "utf8")); return r.world ?? r; })();
const TYPE = Object.fromEntries(W.tools.map((t) => [t.name, t.type]));
const WRITEISH = /(_create|_update|_submit|_delete|_checkin|_checkout|_upload|_post|_send|_file)$/;
const isWrite = (n) => TYPE[n] ? TYPE[n] === "write" : WRITEISH.test(n);

/** The shipped rule, in JS. Mirrors the emitted Python exactly. */
function satisfied(P, seq) {
  const pos = {};
  seq.forEach((t, i) => (pos[t] ??= []).push(i));
  if (P.some((t) => !pos[t])) return false;
  const wpos = {};
  let cursor = -1;
  for (let i = 0; i < P.length; i++) {
    if (!isWrite(P[i])) continue;
    const nxt = pos[P[i]].find((x) => x > cursor);
    if (nxt === undefined) return false;
    wpos[i] = nxt; cursor = nxt;
  }
  const need = {}, due = {};
  for (let i = 0; i < P.length; i++) {
    if (isWrite(P[i])) continue;
    need[P[i]] = (need[P[i]] ?? 0) + 1;
    let d;
    for (let k = i + 1; k < P.length; k++) if (isWrite(P[k]) && wpos[k] !== undefined) { d = wpos[k]; break; }
    if (d !== undefined) due[P[i]] = due[P[i]] === undefined ? d : Math.min(due[P[i]], d);
  }
  for (const [t, n] of Object.entries(need)) {
    const d = due[t];
    if ((pos[t] ?? []).filter((x) => d === undefined || x < d).length < n) return false;
  }
  return true;
}

function requiredPath(taskId) {
  const p = join(ROOT, "tasks", taskId, "verifier.py");
  if (!existsSync(p)) return null;
  const s = readFileSync(p, "utf8");
  const m = /_required_workflow_path = \[([^\]]*)\]/.exec(s) ?? /_path = \[([^\]]*)\]/.exec(s);
  return m ? m[1].split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : null;
}

const TR = join(ROOT, "traces");
const superseded = [], stillFail = [];
for (const model of readdirSync(TR).filter((d) => statSync(join(TR, d)).isDirectory())) {
  const dir = join(TR, model, "failed");
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const fc = j.failedConditions ?? [];
    if (!fc.includes("required_workflow_path")) continue;
    const P = requiredPath(j.taskId);
    if (!P) continue;
    const seq = (j.steps ?? []).filter((s) => s.tool && s.ok !== false && s.tool !== "_final_answer")
      .map((s) => s.tool);
    const rec = { file: `traces/${model}/failed/${f}`, model, task: j.taskId,
      otherFailures: fc.filter((c) => c !== "required_workflow_path") };
    (satisfied(P, seq) ? superseded : stillFail).push(rec);
  }
}

const flips = superseded.filter((r) => r.otherFailures.length === 0);
mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "path-rule-rescore.json"),
  JSON.stringify({ superseded, flips: flips.map((f) => f.file), stillFail: stillFail.length }, null, 1));

const out = ["# Path-rule rescore — verdicts superseded by the ordering correction", "",
  "`required_workflow_path` no longer grades the ordering of *read* checkpoints against each other;",
  "it grades writes in declared order and every read before the write it justifies",
  "(`world/expansion/fix-path-ordering.mjs`). The assertion is a pure function of the trace's tool",
  "sequence, so unlike the seed-baseline quarantine its outcome is recomputable offline exactly —",
  "these are corrections, not estimates.", "",
  `**${flips.length} archived failures satisfy the corrected rule with no other failed condition** —`,
  "their recorded FAIL is wrong under the rule the world now ships. ",
  `${stillFail.length} path failures stand.`, "",
  "| Episode | Task | Model |", "|---|---|---|"];
for (const r of flips) out.push(`| \`${r.file}\` | ${r.task} | ${r.model} |`);
if (superseded.length > flips.length) {
  out.push("", "### Path now satisfied, but the episode still fails on other conditions", "",
    "| Episode | Task | Still failing |", "|---|---|---|");
  for (const r of superseded.filter((x) => x.otherFailures.length))
    out.push(`| \`${r.file}\` | ${r.task} | ${r.otherFailures.join(", ")} |`);
}
writeFileSync(join(ROOT, "reports", "PATH-RULE-RESCORE.md"), out.join("\n") + "\n");
console.log(`path-rule rescore: ${flips.length} recorded failures superseded (verdict flips to pass), ` +
  `${superseded.length - flips.length} satisfy the path but fail elsewhere, ${stillFail.length} stand`);
