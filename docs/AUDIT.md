# Results Audit — is it the model, or is it a bug?

Every failure cluster in the measured runs was treated as a suspected harness
bug until proven otherwise. Three real defects were found; two materially
changed scores and were fixed + requantified. Everything reported in
`reports/` is post-audit.

## Bug 1 — output-cap truncation masquerading as "emission collapse" (FIXED)

**Symptom:** the classic doom loop — `draft_matter_document({})` →
"missing 3 required positional arguments" → identical retry — the same mode
the original hosted failure report called the dominant boundary behavior.

**Diagnosis:** draft tool calls that failed JSON parsing clustered at
**p50 = 21,131 / p90 = 21,807 bytes** of arguments — the byte-size of exactly
~4,096 tokens, which was `maxCompletionTokens`. The completion was truncated
mid-JSON by the harness, parsed as `{}`, and executed as an empty call. The
model never emitted an empty call.

**Impact:** 172 of 547 DeepSeek draft calls truncated; 12 failed episodes
attributable; the *shipped hosted report's* "emission collapse" mode carries
the same signature and the same 4096 cap and should be read as a harness
artifact (addendum added to `docs/FAILURE-REPORT.md`).

**Fix:** cap raised to 8192 (deliverable bodies observed ≤ ~23KB fit);
`finish_reason` now logged; the 12 tainted episodes re-run. Post-fix parse
errors: zero; emission collapse: zero.

## Bug 2 — shared-seed contamination poisoning guard assertions (FIXED)

**Symptom:** an off-task-damage tsunami: `no_offtask_table_changes` +
`no_undeclared_rows_created` failing together on 135 DeepSeek / 115 Haiku
episodes, always naming `matter_documents` with "130 → 205 rows, new ids
131+".

**Diagnosis:** the original-world server (:8971) and the expanded-world
server (:8972) shared `world/local/state/seed.db`. Starting the expanded
server rebuilt the shared seed with the 75 expansion documents; every later
session on :8971 began with 205 documents against a verifier baseline of 130.
The "damage" was my expansion pack, not the model.

**Impact:** 126 DeepSeek / 114 Haiku episodes contaminated; **106 / 96
verdicts flipped** after exact offline rescoring
(`sim/rescore-contaminated.mjs` — strips only the matter_documents component
with the 130→ baseline signature, then recomputes pass/reward with the
verifier's own aggregation; originals preserved under `preRescore`).
DeepSeek 65.4 → **88.2**; Haiku 35.6 → **60.3**.

**Fix:** per-world state directories in `server.py`. Caveat noted in
methodology: contaminated sessions also *showed* the extra 75 documents to
the agent (marginally more distractors in queries); verdict-level rescoring
corrects the grading, not that second-order exposure.

## Bug 3 — prompt/verifier drift in one shipped task (QUARANTINED)

`task_016`'s prompt names invoice INV-1CU8DF9 (row id 9); its shipped
verifier pins row id 1. A correct agent fails; a wrong one passes. Kept
runnable, excluded from scored sets (`config.scoring.quarantinedTasks`).

## What survived the audit (real model behavior, with evidence)

1. **Side-copy writes (DeepSeek, 34 episodes).** The model files the
   deliverable correctly, then *also* writes a duplicate via
   `document_agent` / notes via `save_memory` into assistant tables —
   undeclared record creation the world's guards veto. Evidence it is not a
   lure of the local runtime: the hosted trajectories show the hosted model
   never touched those write surfaces, and the guard contract is identical.
   Real enterprise-relevant behavior: agents scribbling into side systems.
2. **Deliverable left in chat (Haiku, 36 episodes).** Researches correctly,
   then writes the memo into its final chat message and never calls
   `draft_matter_document`. Zero argument-parse errors and zero missing-arg
   errors across all 110 Haiku draft calls — when it drafts, it drafts
   cleanly — so this is instruction-following, not emission capability.
3. **Checkpoint/order adherence (both; Haiku 108 vs DeepSeek 21 episodes).**
   The world's ordered-playbook contract requires declared checkpoints in
   order (e.g. `list → get → create`, or an `operations_records_agent`
   review step the prompt only implies). Models complete the outcome but
   skip/reorder checkpoints. Strict — the records-research family (0–22%
   scores) is best read as "implicit-checkpoint adherence", not research
   incapacity; both flagged as contract-strict in the reports.
4. **The flaky-21 boundary set** remains discriminative post-fix: DeepSeek
   87.3, Haiku 56.9 — with per-episode traces on disk.

## Residual caveats

- Haiku's row is **partial** (388/465 episodes; its lane was stopped
  mid-run to cap spend) and its contaminated episodes were rescored, not
  re-run.
- `document_agent`/`sheet_agent`/`calendar_agent` semantics are synthesized
  (hosted implementations are lost); their write-through behavior matches the
  hosted tool contract (write-type tools with agent-table targets) but was
  not byte-verified against hosted code.
- All scores are world-specific; absolute numbers are not comparable to any
  other harness (see `docs/WHY-BEYOND-HARVEY-LAB.md` §2).

*Measurement spend: DeepSeek ≈ $50 (465 episodes + re-runs), Haiku ≈ $45
(388 episodes, stopped). No further model spend without explicit go-ahead.*
