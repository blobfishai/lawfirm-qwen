/**
 * Trace quarantine — detects archived verdicts that are internally inconsistent
 * and must not be counted as evidence.
 *
 * THE BUG (fixed in world/local/server.py; verdicts recorded before the fix are
 * still on disk). Per-task seed bundles are upserted into a session at creation.
 * Before the fix, the verifier's `initial_state` was the BASE world snapshot,
 * taken before that seeding — so rows the seed bundle inserted were attributed
 * to the agent. `state_changed` and `rows_inserted_into_<table>` then passed on
 * work the agent never did. Signature: `matter_documents: 130 -> 205 rows` on an
 * episode whose own `reads_before_writes` assertion reports `writes=0`.
 *
 * Current server captures the baseline AFTER seeding (`baseline_for()` snapshots
 * the session db), so an empty episode now correctly fails `state_changed`
 * ("NO state change — agent did nothing"). Verified empirically on task_038.
 *
 * DETECTION IS ASSUMPTION-FREE: it uses only the verdict's disagreement with
 * itself — the verifier's own reported write count versus its own state-change
 * and insertion claims. No tool-type table, no regex over tool names (both of
 * which mislabel delegation surfaces like operations_records_agent, which is
 * typed `read` but inserts rows).
 *
 * These episodes cannot be re-scored offline: traces record steps and verdicts
 * but not world state. They must be RE-RUN to produce a valid verdict, so until
 * then they are excluded from every headline number rather than silently kept.
 */

const REASON = "stale-baseline: verifier reported writes=0 yet credited a state " +
  "change/row insertion (pre-fix baseline captured before per-task seeding)";

/**
 * @param {object} trace a parsed episode JSON
 * @returns {string|null} quarantine reason, or null if the verdict is self-consistent
 */
export function quarantineReason(trace) {
  const a = trace?.assertions ?? [];
  const rbw = a.find((x) => x.name === "reads_before_writes");
  if (!rbw) return null;
  const m = /writes=(\d+)/.exec(String(rbw.details ?? ""));
  if (!m || Number(m[1]) !== 0) return null; // the verifier saw writes — nothing to check

  const insertion = a.find((x) => /^rows_inserted_into_/.test(x.name) && x.passed);
  const changed = a.find((x) => x.name === "state_changed" && x.passed);
  if (!insertion && !changed) return null; // zero writes AND no credit claimed — consistent

  return `${REASON} [${(insertion ?? changed).name}: ${(insertion ?? changed).details}]`;
}

export const isQuarantined = (trace) => quarantineReason(trace) !== null;

/** Split a trace list into usable evidence and quarantined verdicts. */
export function partition(traces) {
  const clean = [], quarantined = [];
  for (const t of traces) (isQuarantined(t) ? quarantined : clean).push(t);
  return { clean, quarantined };
}
