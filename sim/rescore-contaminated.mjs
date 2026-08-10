#!/usr/bin/env node
/**
 * Contamination rescorer.
 *
 * Incident (2026-08-10): the original-world server (:8971) and the
 * expanded-world server (:8972) shared world/local/state/seed.db. Starting
 * the expanded server rebuilt the shared seed with +75 matter_documents rows
 * (ids 131+), so later sessions on :8971 began with 205 documents while the
 * verifier baseline had 130 — tripping `no_offtask_table_changes` and
 * `no_undeclared_rows_created` on every non-drafting task, through no fault
 * of the model. (Fixed in server.py by per-world state dirs.)
 *
 * This script rescoines every episode EXACTLY as the verifier would have on
 * an uncontaminated world: it strips the matter_documents component (row
 * growth from 130 baseline, new ids >= 131) out of the two guard assertions,
 * then recomputes passed / reward / failed_conditions with the verifier's own
 * aggregation semantics. Episodes are rewritten in place with the original
 * verdict preserved under `preRescore`.
 *
 * Usage: node sim/rescore-contaminated.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EP_ROOT = join(ROOT, "data", "leaderboard", "episodes");
const DRY = process.argv.includes("--dry");

// verifier aggregation sets (mirrors the vcode template semantics)
const BEHAVIORAL = new Set(["state_changed", "reads_before_writes", "no_shortcut_direct_update",
  "required_workflow_path", "required_documents_read", "all_tools_succeeded"]);
const ANTI_HACK = new Set(["reads_before_writes", "no_shortcut_direct_update",
  "required_workflow_path", "required_documents_read"]);
const ADVISORY = new Set(["all_tools_succeeded"]);
const GUARD_FIXED = new Set(["no_offtask_table_changes", "no_rows_destroyed",
  "no_undeclared_rows_created", "audit_logs_append_only"]);
const isGuard = (n) => GUARD_FIXED.has(n) || n.startsWith("no_new_") || n.startsWith("no_collateral") || /_was_/.test(n);

/** Strip the matter_documents contamination from one failing guard assertion.
 *  Returns true if the assertion passes once contamination is removed. */
function decontaminate(a) {
  if (a.passed) return { passed: true, changed: false };
  const d = String(a.details ?? "");
  if (!/matter_documents/.test(d)) return { passed: false, changed: false };
  if (a.name === "no_offtask_table_changes") {
    // detail: OFF-TASK DAMAGE: tables ['a', 'b'] changed ...
    const m = /tables \[([^\]]*)\]/.exec(d);
    if (!m) return { passed: false, changed: false };
    const tables = m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
    const rest = tables.filter((t) => t !== "matter_documents");
    return { passed: rest.length === 0, changed: true, rest };
  }
  if (a.name === "no_undeclared_rows_created") {
    // detail: UNDECLARED RECORD CREATION: {'matter_documents': "130 -> 205 rows, new ids ['131',…]", 'x': …}
    // contamination signature: baseline 130 growing only by expansion ids ≥ 131
    const entries = [...d.matchAll(/'([a-z_]+)':\s*["']([^"']*)["']/g)].map((m2) => ({ table: m2[1], info: m2[2] }));
    if (!entries.length) return { passed: false, changed: false };
    const md = entries.find((e) => e.table === "matter_documents");
    const mdIsContamination = md && /^130 ->/.test(md.info);
    const rest = entries.filter((e) => e.table !== "matter_documents");
    if (!mdIsContamination) return { passed: false, changed: false };
    return { passed: rest.length === 0, changed: true, rest: rest.map((e) => e.table) };
  }
  return { passed: false, changed: false };
}

function rescoreEpisode(ep) {
  if (!Array.isArray(ep.assertions) || !ep.assertions.length) return null;
  let touched = false;
  const assertions = ep.assertions.map((a) => {
    if ((a.name === "no_offtask_table_changes" || a.name === "no_undeclared_rows_created") && !a.passed) {
      const r = decontaminate(a);
      if (r.changed) {
        touched = true;
        return { ...a, passed: r.passed,
          details: r.passed
            ? `${a.name}: passes after removing seed-contamination (matter_documents expansion rows); original: ${a.details}`
            : `${a.name}: still failing on ${JSON.stringify(r.rest)} after removing seed-contamination; original: ${a.details}` };
      }
    }
    return a;
  });
  if (!touched) return null;

  const failed = assertions.filter((a) => !a.passed).map((a) => a.name);
  const structuralFailed = failed.filter((n) => !ADVISORY.has(n));
  const effect = assertions.filter((a) => !BEHAVIORAL.has(a.name));
  const core = effect.filter((a) => !isGuard(a.name));
  const coreFailed = core.filter((a) => !a.passed);
  const guardFailed = effect.filter((a) => isGuard(a.name) && !a.passed);
  const antiHackFailed = assertions.filter((a) => ANTI_HACK.has(a.name) && !a.passed);
  let reward;
  if (guardFailed.length || antiHackFailed.length) reward = 0;
  else if (core.length) reward = (core.length - coreFailed.length) / core.length;
  else reward = structuralFailed.length ? 0 : 1;

  return {
    passed: structuralFailed.length === 0,
    reward: +reward.toFixed(4),
    failedConditions: structuralFailed,
    assertions,
  };
}

for (const engine of readdirSync(EP_ROOT)) {
  const dir = join(EP_ROOT, engine);
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { continue; }
  let contaminated = 0, flipped = 0;
  for (const f of files) {
    let ep;
    try { ep = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
    if (ep.preRescore) continue; // already rescored
    const r = rescoreEpisode(ep);
    if (!r) continue;
    contaminated++;
    if (r.passed !== ep.passed) flipped++;
    if (!DRY) {
      const next = {
        ...ep,
        passed: r.passed,
        reward: r.reward,
        failedConditions: r.failedConditions,
        assertions: r.assertions,
        preRescore: { passed: ep.passed, reward: ep.reward, failedConditions: ep.failedConditions },
        rescoredAt: new Date().toISOString(),
        rescoreReason: "seed-contamination: shared state dir put expansion matter_documents rows into original-world sessions",
      };
      writeFileSync(join(dir, f), JSON.stringify(next, null, 2));
    }
  }
  console.log(`${engine}: ${contaminated} contaminated episodes, ${flipped} verdicts flipped${DRY ? " (dry run)" : ""}`);
}
