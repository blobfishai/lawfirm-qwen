#!/usr/bin/env node
/**
 * Characterise the boundary — which tasks are genuinely at the capability edge,
 * and which only looked flaky because three episodes is not a measurement.
 *
 * A task called "2/3 flaky" carries a 95% Wilson interval of roughly [0.21,
 * 0.94]. That is compatible with a task the model almost always solves and one
 * it solves half the time. Pooling every episode a task has (the 3-episode
 * triage run plus the 8-episode boundary run) and reporting the interval says
 * which of those it is.
 *
 * Classification, on the pooled interval:
 *   MIXED        at least one pass AND at least one failure — the boundary,
 *                and the only class this sample size can establish positively
 *   NO-FAILURES  every episode passed. NOT "solid": at n=8 a clean sweep still
 *                carries a 95% lower bound near 0.63, so this means "no
 *                evidence of a boundary", not "reliable"
 *   NO-PASSES    every episode failed — past the model; keep for failure modes
 *
 * A threshold like "lower bound >= 0.85" is unreachable at n=8 (8/8 gives
 * [0.68, 1.00]), so classifying on it puts every task in one bucket and says
 * nothing. The interval is still reported per task — it is what tells you how
 * little a clean sweep of 8 actually proves.
 *
 * Also reports, per task, the failure modes behind every miss, because a task
 * that fails 40% of the time on collateral writes is a different instrument
 * from one that fails 40% of the time on a wrong value.
 *
 * Run: node sim/boundary-report.mjs [--engine deepseek-chat] [--min 6]
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ENGINE = opt("--engine", "deepseek-chat");
const MIN_EPS = Number(opt("--min", "6"));

const raw = JSON.parse(readFileSync(join(ROOT, "world/blobfish/world-v13.json"), "utf8"));
const world = raw.world ?? raw;
const TASK = Object.fromEntries(world.tasks.map((t) => [t.task_id, t]));
const familyOf = (t) => (t?.provenance?.source_workflow ?? "").split(":")[1]?.split("/")[0]?.trim()
  || t?.expansion?.family || "(none)";

/** Wilson score interval — the right tool for small-n proportions. */
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** Group the raw failed-condition names into the modes we actually reason about. */
function mode(conds) {
  if (conds.some((c) => /no_offtask_table_changes|no_undeclared_rows_created|no_rows_destroyed/.test(c)))
    return "collateral-write";
  if (conds.some((c) => /^no_new_.*_row_with_/.test(c))) return "forbidden-value";
  if (conds.some((c) => /_is_/.test(c))) return "wrong-value";
  if (conds.some((c) => /required_documents_read/.test(c))) return "evidence-gap";
  if (conds.some((c) => /required_workflow_path/.test(c))) return "workflow-incomplete";
  if (conds.some((c) => /state_changed/.test(c))) return "no-action";
  return conds.length ? "other" : "—";
}

const EP = join(ROOT, "data/leaderboard/episodes", ENGINE);
if (!existsSync(EP)) { console.error(`no episodes for ${ENGINE}`); process.exit(1); }

const byTask = {};
for (const f of readdirSync(EP).filter((x) => x.endsWith(".json"))) {
  let j; try { j = JSON.parse(readFileSync(join(EP, f), "utf8")); } catch { continue; }
  if (!j.taskId) continue;
  (byTask[j.taskId] ??= []).push(j);
}

const rows = Object.entries(byTask)
  .map(([tid, eps]) => {
    const n = eps.length, k = eps.filter((e) => e.passed).length;
    const [lo, hi] = wilson(k, n);
    const modes = {};
    for (const e of eps.filter((x) => !x.passed)) {
      const m = mode(e.failedConditions ?? []);
      modes[m] = (modes[m] ?? 0) + 1;
    }
    const cls = k === 0 ? "NO-PASSES" : k === n ? "NO-FAILURES" : "MIXED";
    return {
      task: tid, family: familyOf(TASK[tid]), n, k, rate: n ? k / n : 0, lo, hi, cls, modes,
      calls: Math.round(eps.reduce((a, e) => a + (e.toolCalls ?? 0), 0) / n),
      cost: eps.reduce((a, e) => a + (e.costUsd ?? 0), 0),
    };
  })
  .filter((r) => r.n >= MIN_EPS)
  .sort((a, b) => a.rate - b.rate);

const out = [];
out.push(`# Boundary characterisation — ${ENGINE}`);
out.push("");
out.push(`Tasks with at least ${MIN_EPS} pooled episodes. Rate is passes/episodes; the interval is `);
out.push("a 95% Wilson score interval, which is what makes \"2/3\" and \"6/11\" different claims.");
out.push("");
out.push(`${rows.length} tasks · ${rows.reduce((a, r) => a + r.n, 0)} episodes · ` +
  `$${rows.reduce((a, r) => a + r.cost, 0).toFixed(2)}`);
out.push("");
const byCls = {};
for (const r of rows) (byCls[r.cls] ??= []).push(r);
out.push("| Class | Tasks | Meaning |");
out.push("|---|---|---|");
out.push(`| **MIXED** | ${(byCls["MIXED"] ?? []).length} | the boundary — same prompt, sometimes passes |`);
out.push(`| NO-FAILURES | ${(byCls["NO-FAILURES"] ?? []).length} | no evidence of a boundary at this n; grow, or measure deeper |`);
out.push(`| NO-PASSES | ${(byCls["NO-PASSES"] ?? []).length} | past the model; keep for the failure mode |`);
out.push("");
out.push("## Every measured task, weakest first");
out.push("");
out.push("| Task | Family | Pass | Rate | 95% interval | Class | Dominant failure | Avg calls |");
out.push("|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  const dom = Object.entries(r.modes).sort((a, b) => b[1] - a[1])[0];
  out.push(`| ${r.task} | ${r.family} | ${r.k}/${r.n} | ${(100 * r.rate).toFixed(0)} | ` +
    `[${(100 * r.lo).toFixed(0)}, ${(100 * r.hi).toFixed(0)}] | ${r.cls} | ` +
    `${dom ? `${dom[0]} (${dom[1]})` : "—"} | ${r.calls} |`);
}
out.push("");
const modeTotals = {};
for (const r of rows) for (const [m, n] of Object.entries(r.modes)) modeTotals[m] = (modeTotals[m] ?? 0) + n;
out.push("## Failure modes across every miss");
out.push("");
out.push("| Mode | Episodes |");
out.push("|---|---|");
for (const [m, n] of Object.entries(modeTotals).sort((a, b) => b[1] - a[1])) out.push(`| ${m} | ${n} |`);

writeFileSync(join(ROOT, "docs", "BOUNDARY.md"), out.join("\n") + "\n");
console.log(`boundary: ${rows.length} tasks (>=${MIN_EPS} episodes)`);
for (const c of ["MIXED", "NO-FAILURES", "NO-PASSES"]) {
  const n = (byCls[c] ?? []).length; if (n) console.log(`  ${c.padEnd(11)} ${n}`);
}
console.log(`  modes: ${JSON.stringify(modeTotals)}`);
console.log("  -> docs/BOUNDARY.md");
