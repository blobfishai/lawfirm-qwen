#!/usr/bin/env node
/**
 * Triage the measured tasks by family, on the creation workflow's own rule:
 *
 *   0/3  too hard      — the boundary is past the model; leave it, it still
 *                        yields a failure mode
 *   1-2/3 FLAKY        — the boundary itself. This is the band worth having:
 *                        same model, same prompt, sometimes passes
 *   3/3  too easy      — grow it (more steps, more ambiguity, a harder variant)
 *
 * Groups by the pack family so the verdict is about the FAMILY's calibration,
 * not one task's luck, and reports the failure conditions behind every miss.
 *
 * Run: node sim/triage-new-families.mjs [--engine deepseek-chat]
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const ENGINE = argv.includes("--engine") ? argv[argv.indexOf("--engine") + 1] : "deepseek-chat";

// Canonical product-only world. The migrated task ids retain the family
// identity used by this historical triage view.
const WORLD = argv.includes("--world")
  ? argv[argv.indexOf("--world") + 1] : "world/blobfish/world-v16.json";
const raw = JSON.parse(readFileSync(join(ROOT, WORLD), "utf8"));
const world = raw.world ?? raw;
const familyOf = (t) => (t.provenance?.source_workflow ?? "").split(":")[1]?.split("/")[0]?.trim()
  || t.expansion?.family || "(none)";
const TASK = Object.fromEntries(world.tasks.map((t) => [t.task_id, t]));

const EP = join(ROOT, "data/leaderboard/episodes", ENGINE);
if (!existsSync(EP)) { console.error(`no episodes for ${ENGINE}`); process.exit(1); }

const byTask = {};
for (const f of readdirSync(EP).filter((x) => x.endsWith(".json"))) {
  let j; try { j = JSON.parse(readFileSync(join(EP, f), "utf8")); } catch { continue; }
  const n = Number((j.taskId ?? "").match(/^task_(\d+)$/)?.[1]);
  if (!(n >= 271 && n <= 326)) continue;           // the new families only
  (byTask[j.taskId] ??= []).push(j);
}

const rows = Object.entries(byTask).map(([tid, eps]) => {
  const pass = eps.filter((e) => e.passed).length;
  const verdict = pass === 0 ? "too-hard" : pass === eps.length ? "too-easy" : "FLAKY";
  const conds = {};
  for (const e of eps) for (const c of e.failedConditions ?? []) conds[c] = (conds[c] ?? 0) + 1;
  return {
    task: tid, family: familyOf(TASK[tid] ?? {}), pass, n: eps.length, verdict,
    cost: eps.reduce((a, e) => a + (e.costUsd ?? 0), 0),
    calls: Math.round(eps.reduce((a, e) => a + (e.toolCalls ?? 0), 0) / eps.length),
    conds,
  };
});

const fams = {};
for (const r of rows) {
  const f = (fams[r.family] ??= { tasks: 0, pass: 0, eps: 0, hard: 0, flaky: 0, easy: 0, cost: 0, conds: {} });
  f.tasks++; f.pass += r.pass; f.eps += r.n; f.cost += r.cost;
  f[r.verdict === "too-hard" ? "hard" : r.verdict === "FLAKY" ? "flaky" : "easy"]++;
  for (const [c, n] of Object.entries(r.conds)) f.conds[c] = (f.conds[c] ?? 0) + n;
}

const out = [];
out.push(`# Triage — new families measured on ${ENGINE}`);
out.push("");
out.push(`${rows.length} tasks · ${rows.reduce((a, r) => a + r.n, 0)} episodes · ` +
  `$${rows.reduce((a, r) => a + r.cost, 0).toFixed(2)}`);
out.push("");
out.push("| Family | Tasks | Episodes passed | too-hard | **FLAKY** | too-easy |");
out.push("|---|---|---|---|---|---|");
for (const [f, v] of Object.entries(fams).sort((a, b) => (a[1].pass / a[1].eps) - (b[1].pass / b[1].eps))) {
  out.push(`| ${f} | ${v.tasks} | ${v.pass}/${v.eps} (${(100 * v.pass / v.eps).toFixed(0)}) | ` +
    `${v.hard} | **${v.flaky}** | ${v.easy} |`);
}
out.push("");
out.push("## The flaky band — the boundary");
out.push("");
const flaky = rows.filter((r) => r.verdict === "FLAKY").sort((a, b) => a.pass - b.pass);
if (!flaky.length) out.push("*None — every task is either solved or unsolved. The set is not calibrated to this model.*");
else {
  out.push("| Task | Family | Passed | Avg calls | Failure conditions |");
  out.push("|---|---|---|---|---|");
  for (const r of flaky) {
    out.push(`| ${r.task} | ${r.family} | ${r.pass}/${r.n} | ${r.calls} | ` +
      `${Object.entries(r.conds).map(([c, n]) => `${c} (${n})`).join(", ") || "—"} |`);
  }
}
out.push("");
out.push("## Too hard (0/3) — keep, they still yield failure modes");
out.push("");
const hard = rows.filter((r) => r.verdict === "too-hard");
if (!hard.length) out.push("*None.*");
else {
  out.push("| Task | Family | Avg calls | Failure conditions |");
  out.push("|---|---|---|---|");
  for (const r of hard) {
    out.push(`| ${r.task} | ${r.family} | ${r.calls} | ` +
      `${Object.entries(r.conds).map(([c, n]) => `${c} (${n})`).join(", ")} |`);
  }
}
out.push("");
out.push("## Too easy (3/3) — grow these");
out.push("");
const easy = rows.filter((r) => r.verdict === "too-easy");
out.push(easy.length ? easy.map((r) => `- \`${r.task}\` (${r.family}, ${r.calls} calls)`).join("\n")
  : "*None.*");
out.push("");
const allConds = {};
for (const r of rows) for (const [c, n] of Object.entries(r.conds)) allConds[c] = (allConds[c] ?? 0) + n;
out.push("## Failure conditions across every miss");
out.push("");
out.push("| Condition | Episodes |");
out.push("|---|---|");
for (const [c, n] of Object.entries(allConds).sort((a, b) => b[1] - a[1])) out.push(`| \`${c}\` | ${n} |`);

writeFileSync(join(ROOT, "docs", "TRIAGE-NEW-FAMILIES.md"), out.join("\n") + "\n");
const tot = rows.reduce((a, r) => a + r.n, 0), tp = rows.reduce((a, r) => a + r.pass, 0);
console.log(`triage: ${rows.length} tasks · ${tp}/${tot} episodes passed (${(100 * tp / tot).toFixed(1)})`);
console.log(`  too-hard ${rows.filter((r) => r.verdict === "too-hard").length} · ` +
  `FLAKY ${flaky.length} · too-easy ${easy.length}`);
console.log(`  -> docs/TRIAGE-NEW-FAMILIES.md`);
