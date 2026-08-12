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

## Bug 4 — verification baseline captured before per-task seeding (FIXED; 107 archived verdicts quarantined)

Per-task seed bundles are upserted into a session at creation. Before the fix
the verifier's `initial_state` was the **base-world** snapshot, taken before
that seeding — so rows the seed bundle inserted were credited to the agent.
`state_changed` and `rows_inserted_into_<table>` then passed on work no agent
did.

Found by reading traces rather than by a test: `task_098-t1` (Haiku) is
recorded as **passed with reward 1.0** having called only
`query_matter_documents` and `read_matter_document` — it never filed the
deliverable. Its own verdict gives it away, `reads_before_writes` reporting
`writes=0` beside `rows_inserted_into_matter_documents: 130 -> 205 rows`.
That self-contradiction is the detector (`sim/lib/quarantine.mjs`) — it needs
no tool-type table and no name regex, both of which mislabel delegation
surfaces like `operations_records_agent` (declared `read`, inserts rows).

*Fix:* `baseline_for()` snapshots the session database **after** seeding.
*Verified:* an empty episode on `task_038` now fails `state_changed`
("NO state change — agent did nothing") and `rows_inserted_into_matter_documents`
(`267 -> 267 rows`).

*Impact on archived evidence:* 107 verdicts (101 Haiku, 4 DeepSeek, 2
dual-surface), **34 of them recorded as passes**. Traces store steps and
verdicts but not world state, so they cannot be re-scored offline — a valid
verdict requires re-running. Until then they are excluded from every rate and
listed in `reports/QUARANTINE.md`. Excluding them moves Haiku from 60.1 over
388 episodes to **69.3 over the 287 self-consistent ones** — the direction is
up, because most contaminated verdicts failed the workflow-path check anyway;
the honest statement is that Haiku's true rate is unmeasured until a re-run.

## Bug 5 — `required_workflow_path` graded the reference solution's browsing order (FIXED; 9 verdicts corrected)

The check matched the declared checkpoint list as a strictly ordered
subsequence, which enforced ordering among the **read** checkpoints. That
ordering carries no legal or procedural meaning. A path of

    legal_matters_list -> legal_matters_get -> legal_matters_evidence_create

failed an agent that already had the matter id, fetched it directly, then
listed for context: identical evidence, identical write, zero reward. Eight
archived episodes fail on exactly that pattern, and a ninth
(`task_v3_006-t3`) only because seeded rate-limiting threw a 429 and its
successful retry landed after the next read — the world punishing correct
friction recovery.

*Fix* (`world/expansion/fix-path-ordering.mjs`, 217 + 15 verifiers rewritten):
every checkpoint must still succeed, declared repeats still require that many
successful calls, writes must occur in declared relative order, and every read
must occur before the write it justifies. Reads are unordered among themselves.
`reads_before_writes` and `no_shortcut_direct_update` are untouched and carry
the read-then-write discipline independently.

*Verified* three ways: the oracle still admits **270/270**; probes on both
verifier shapes behave correctly — reads in any order pass, write-before-reads
fails, write-without-reads fails, a missing read fails, and 2-of-3 required
writes fails (repeat counting intact); and an offline replay over all 296
archived failures flips exactly the 9 read-ordering artifacts, leaving 145 path
failures standing — including `task_086-t3`, whose delegation ran *after* its
write.

Unlike Bug 4, this one is exactly recomputable: the path assertion is a pure
function of the trace's tool sequence, no world state. The 9 corrections are in
`reports/PATH-RULE-RESCORE.md` and applied in the tasks-and-traces browser.
DeepSeek moves 88.1 → 89.3 on self-consistent verdicts.

## Bug 6 — the assembler allocated task ids by COUNT, not by maximum (FIXED before shipping)

`assemble.mjs` numbered appended tasks `task_${originalTaskCount + n}`. That is
correct only while no task has ever been retired. Retiring the 38 recipe tasks
left the surviving ids scattered — the world still contained `task_233`
through `task_270` — so the next assembly minted `task_233…task_270` a second
time and shipped **38 duplicate ids**.

Nothing crashed. The oracle simply ran `task_246` twice (`[1/2] fail`,
`[2/2] PASS`), the verifier lookup resolved whichever entry came first, and the
run reported 245/270 with failures attributed to innocent pre-existing tasks.
The tell was the oracle's own progress counter printing the same id twice — a
250-line report where the only wrong thing was a bracket.

*Fix:* allocate from `1 + max(existing numeric id)`. Retired ids are never
reused, so archived traces referencing them stay interpretable. New tasks land
at `task_271…task_308`; re-assembled world proves **270/270**.

## Bug 7 — a generated scenario that contradicted its own prompt (CAUGHT PRE-SHIP)

The covenant pack computes which financial covenant a borrower breached and
assigns the remediation owner from that. One generated borrower
(Cedarline Manufacturing, leverage 2.65x against a 3.50x maximum, coverage
3.06x against a 2.75x minimum) breached **neither** — but the branch fell
through to "coverage", so the task would have ordered the agent to open a
remediation while its own prompt said *"Do not open a remediation for a
covenant that is not breached."* Exactly the incoherent-task shape that
produced the `task_251` refusal earlier in this project.

*Fix:* the generator now **throws** rather than emitting a scenario with no
breach, so the defect cannot be reintroduced by editing the figures. This is
the general lesson from `task_251`: an answer key computed from data is safe;
an answer key computed from data with a silent fallback is not.

## Bug 8 — an answer key that contradicted the world, caught by a MODEL (FIXED)

`async-screen-coverage` asked for the number of documents the privilege screen
scanned and pinned **9**, the size of the review set. The runtime computes
coverage by `related_shape`, which is the whole matter folder — the review set
*and* the protocol document beside it — so the job reports **10**.

DeepSeek recorded 10 in three episodes out of three and was right every time.
The task was wrong.

The reason this survived the oracle is structural and worth stating: **the
oracle writes the pinned value; it never reads the job result.** A key that
disagrees with what the world actually returns is invisible to a reference walk
that never asks the world. The discrimination sweep could not see it either —
it perturbs the answer and checks for rejection, which a wrong-but-consistent
key passes.

Only measurement caught it, and only because the model disagreed. That is the
argument for measuring even when a task is oracle- and discrimination-proven:
those two prove the task is *satisfiable* and *bound*, not that it is *correct*.

*Fix:* coverage is derived from the document list (`REVIEW_SET.length + 1`)
rather than asserted, so it cannot drift from what the runtime counts. Re-run
after the fix: 3/3.

## Bug 12 — a third of `structural` is keyed off filenames, and its headline score measures that, not the model (FOUND; NOT YET FIXED)

*Defects 9–11 are described in `HANDOFF.md` but were never written up here; this
keeps their numbering rather than renumbering around the gap.*

`structural` was reported as the hardest generated family by a distance — 13%
recall, 5% precision. It is two families wearing one label.

Its 32 tasks were generated by two different code paths. The generator
originally matched folder names against the *flattened filenames* in
`world/corpus/ch/text/`, which drop the folder path; it was later fixed to read
the `folder` column of `index.sqlite`. Waves 1–16 (**11 tasks**) were frozen
into the bank under the old path, waves 20–23 (**21 tasks**) under the new one.
Five tasks name folders — `Disclosure Schedules`, `Signature Pages` — that do
not appear anywhere in the index, and in three the absent folder is the
*positive* term, so no answer can score above zero.

Do **not** try to tell the two apart by the `computed` field. Every structural
task says `"filename evidence of X without Y"` because that string is
hard-coded in the generator's `add()` call and was never updated when the
derivation changed. It describes the old path, is emitted by the new one, and
is the sort of stale provenance label that makes an audit trail worse than
none. The reliable discriminator is reconstruction: recompute the key from the
index and see whether it reproduces.

Simulating a perfect agent against each key, with no model in the loop:

| | recall | precision | exactly right |
|---|---|---|---|
| waves 20–23, exact top-level reconstruction | 100.0 | 100.0 | **21/21** |
| waves 1–16, same perfect reconstruction | 38.2 | 8.8 | **0/11** |

The modern tasks are perfectly answerable — median **3** tool calls, max 12,
against a 40-turn budget. The legacy ones are unreachable by any strategy,
because the key describes a corpus layout that the index does not have.

Then the sampling: of the four `structural` tasks in the 15-task pilot, **three
were legacy** (waves 16, 2, 2). The 13%/5% line is mostly a measurement of
broken answer keys.

There is a real difficulty underneath, and it should be kept. `corpus_files_list`
filters `folder LIKE '%X%'` while the gold uses the top-level folder, and the
corpus contains `Engagement` alongside `Engagement & Administration`,
`Correspondence` alongside `Correspondence/Client`. An agent that trusts the
filter's membership gets 88.8 recall / 57.3 precision and **0/21 exact**; one
that re-filters on the exact `folder` string the tool already returns in every
row gets 100/100. That is a genuine trap about believing a query's semantics
over its output, and it is worth measuring.

*Fix, applied:* the 11 non-reproducing tasks carry `quarantined: true` and a
reason in `world/blobfish/corpus-wave-tasks.json`, and
`sim/run-firm-knowledge.mjs` skips quarantined tasks by default (`--all` to
include them, for anyone re-checking the keys). They were selected by
reconstruction — recompute the key from the index, quarantine what does not
reproduce — not by the `computed` label, which is wrong for all 32. The
generator's hard-coded label is corrected so new waves describe their real
derivation. `structural` is 21 runnable tasks; the family has **not** been
re-measured, so its difficulty is still unknown and the 13%/5% figure should
not be cited.

*Scope — the other families were checked and are clean.* `conjunction`,
`exclusion` and `client_roll` derive their keys from document bodies, and
`corpus_search` reads those same files with the same lowercased-substring
semantics. Reproducing 9 sampled keys from the tool's semantics returned the
gold set element-for-element, 9 of 9. The index also matches the corpus on
disk exactly — 9,288 files each way, no rows with `chars = 0`, no
`parse_error` — so nothing the generator saw is hidden from the tool.
`superlative` is **unchecked**: its key rests on per-file hit counts rather
than set membership, and that needs its own pass. Structural was the only
family whose key was computed from a source the agent cannot query.

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
