/** Failure-mode classifier — shared by build-failure-report.mjs and the
 *  all-failed-traces evidence page. Classifies one episode record (with
 *  failedConditions + steps) into the world's failure-mode taxonomy. */

export const MODE_DESCRIPTIONS = {
  fabrication: "Fabricated determination — wrote an answer row the source materials do not support (hallucination-trap guard tripped)",
  wrong_value: "Wrong graded value — completed the workflow but a pinned field (extraction / computation / determination) was wrong",
  evidence_gap: "Evidence gap — wrote the deliverable without reading the required input documents in full (skipped or wrong documents)",
  workflow_shortcut: "Workflow shortcut — skipped or reordered required checkpoints (e.g. drafted from search previews instead of full reads, or get before list)",
  emission_collapse: "Tool-call emission collapse — repeated an identical (usually empty-argument) tool call in a loop, typically on the large-payload draft step",
  output_cap_truncation: "HARNESS ARTIFACT — the completion cap truncated a large tool call mid-JSON (parse error at ~max_tokens boundary); not a model failure. Episodes with this mode are re-run at a higher cap and should not appear in final results",
  friction_non_recovery: "Injected-friction non-recovery — a rate_limited / stale_reference error derailed the run and the step was never successfully retried",
  deliverable_in_chat: "Deliverable answered in chat — the model researched correctly, then wrote the work product into its final chat message instead of filing it with the required write tool (the record system never changed)",
  no_action: "No effective action — episode ended with no successful state change",
  turn_exhaustion: "Turn exhaustion — spent the entire turn budget without producing the final deliverable",
  off_task_damage: "Off-task damage — modified tables/rows outside the task's declared scope (side-copies, undeclared records)",
  api_error: "Provider/API failure — episode could not run to completion for infrastructure reasons",
  other: "Unclassified failure",
};

export function classify(ep) {
  const failed = new Set(ep.failedConditions ?? []);
  const steps = ep.steps ?? [];
  const worldSteps = steps.filter((s) => s.tool !== "_final_answer");
  const okWrites = worldSteps.filter((s) => s.ok && /create|draft|update|save_|add_to_/.test(s.tool));

  const has = (pred) => [...failed].some(pred);

  let loop = false;
  for (let i = 0; i + 2 < worldSteps.length; i++) {
    const [a, b, c] = [worldSteps[i], worldSteps[i + 1], worldSteps[i + 2]];
    if (!a.ok && !b.ok && !c.ok &&
        a.tool === b.tool && b.tool === c.tool &&
        JSON.stringify(a.args) === JSON.stringify(b.args) &&
        JSON.stringify(b.args) === JSON.stringify(c.args)) { loop = true; break; }
  }
  const emptyDraftFails = worldSteps.filter(
    (s) => !s.ok && /missing \d+ required positional/.test(s.observation ?? "")).length;

  const frictionHits = worldSteps.filter(
    (s) => !s.ok && /(rate_limited|stale_reference)/.test(s.observation ?? ""));
  const frictionUnrecovered = frictionHits.some((h) =>
    !worldSteps.some((s) => s.ok && s.tool === h.tool &&
      worldSteps.indexOf(s) > worldSteps.indexOf(h)));

  if (ep.infraError) return "api_error";
  const truncated = worldSteps.some((s) => s.argParseError &&
    /create|draft|update_/.test(s.tool) && (s.argBytes ?? 0) > 15000);
  if (truncated && (failed.has("state_changed") || has((c) => c.startsWith("rows_inserted"))))
    return "output_cap_truncation";
  if (has((c) => c.startsWith("no_new_"))) return "fabrication";
  if (has((c) => /_is_/.test(c) && !c.startsWith("no_new_"))) return "wrong_value";
  if (failed.has("required_documents_read")) return "evidence_gap";
  if (loop || emptyDraftFails >= 2) return "emission_collapse";
  if (failed.has("required_workflow_path") || failed.has("no_shortcut_direct_update") ||
      failed.has("reads_before_writes")) {
    return okWrites.length ? "workflow_shortcut" : (loop ? "emission_collapse" : "workflow_shortcut");
  }
  if (has((c) => c === "no_offtask_table_changes" || c === "no_rows_destroyed" ||
      c === "no_undeclared_rows_created")) return "off_task_damage";
  if (failed.has("state_changed")) {
    if (frictionUnrecovered) return "friction_non_recovery";
    const finalStep = steps.find((s) => s.tool === "_final_answer");
    const attemptedWrites = worldSteps.filter((s) => /create|draft|update|save_|add_to_/.test(s.tool));
    const successfulReads = worldSteps.filter((s) => s.ok && /^(query_|read_|search_)|_list$|_get$/.test(s.tool));
    if (finalStep && !attemptedWrites.length && successfulReads.length &&
        (finalStep.observation ?? "").length > 200) return "deliverable_in_chat";
    if ((ep.turnsUsed ?? 0) >= (ep.maxTurns ?? 50)) return "turn_exhaustion";
    return "no_action";
  }
  if (frictionUnrecovered) return "friction_non_recovery";
  if ((ep.turnsUsed ?? 0) >= (ep.maxTurns ?? 50)) return "turn_exhaustion";
  return "other";
}
