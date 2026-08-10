# Failure Report — Flaky Tasks at the Model Boundary

> **2026-08-10 addendum — the dominant mode was substantially a harness
> artifact.** Local re-measurement (see `docs/failure-reports/` and
> `data/leaderboard/`) reproduced the "tool-call emission collapse" signature
> and then explained it: draft tool calls that fail to parse cluster at
> p50 ≈ 21.1KB / p90 ≈ 21.8KB of arguments — precisely the ~4096-token
> completion cap both this repo's original runner and (by configuration) the
> hosted harness imposed. The model was not emitting empty calls; its JSON was
> being truncated mid-string at `max_tokens`, parsed as `{}`, and echoed back
> as "missing 3 required positional arguments". Raising the cap to 8192
> eliminates the parse failures (deliverable bodies observed up to ~23KB fit
> comfortably). Of the local failing episodes, the truncation markers appear
> in a bounded subset (12/138 for deepseek-chat); the remaining failure modes
> below (workflow shortcut, friction non-recovery) and the newly measured
> modes (off-task record creation, deliverable-left-in-chat) survive the
> audit as genuine model behavior. The original push-2 conclusion — "all 12
> failing episodes were emission collapse" — should therefore be read as
> "all 12 failing episodes hit the output-cap truncation", which is a
> statement about the harness, not the model. The flaky-21 task set remains
> valuable (the tasks are exactly the ones whose deliverables approach the
> cap), but the *mechanism* claimed below is corrected by this addendum.

**World**: `sbx_206712ec47f741d3` — synthetic litigation/corporate law firm ("eve"), 82 tables · 117 tools · 156 tasks (146 Harvey-LAB-anchored, 8 LegalAgentBench-anchored, 2 graph-walk).
**Measured model**: `deepseek-v4-flash` (this repo's target policy is qwen — re-run `npm run flake` to reproduce against it).
**Method**: two boundary pushes (frontier_push jobs `job_2dd32f675a8243ef`, `job_77eef350b369400d`). Each wave generates 10 candidate tasks on the frozen world, runs every admitted task **3 episodes — same model, same prompt** — and classifies per task: *flaky* (own runs mix outcomes), *too easy* (3/3), *too hard* (0/3). Materials escalate per tier (counterparty markups → unannounced distractor files → disclosure schedules → superseded-instruction correspondence). All tasks are kept and labeled; nothing is deleted.

## The definition that matters

A task is **at the model's limit** only when *its own repeated runs mix outcomes*. Aggregate pass rates cannot prove a boundary: 40% failure can be 60% too-easy plus 40% too-hard with zero tasks in between. Every task in the table below has direct mixed-outcome proof.

## Proven-flaky tasks (21)

| Task | Pass rate | Push | Failure mode (when it fails) |
|---|---|---|---|
| task_018 | 2/3 | 1 | tool-call emission collapse (doom loop) |
| task_020 | 2/3 | 1 | tool-call emission collapse (doom loop) |
| task_022 | 2/3 | 1 | tool-call emission collapse (doom loop) |
| task_031 | 2/3 | 1 | workflow shortcut (`required_workflow_path`) |
| task_043 | 2/3 | 1 | injected friction (`stale_reference`) + shortcut |
| task_047 | 2/3 | 1 | workflow shortcut |
| task_051 | 2/3 | 1 | workflow shortcut |
| task_052 | 2/3 | 1 | workflow shortcut |
| task_086 | 2/3 | 1 | (added wave 7; mode not individually audited) |
| task_095 | 1/3 | 1 | (added wave 8; mode not individually audited) |
| task_098 | 2/3 | 2 | tool-call emission collapse |
| task_099 | 1/3 | 2 | tool-call emission collapse |
| task_101 | 2/3 | 2 | tool-call emission collapse |
| task_104 | 2/3 | 2 | tool-call emission collapse |
| task_112 | 1/3 | 2 | tool-call emission collapse |
| task_126 | 1/3 | 2 | tool-call emission collapse |
| task_127 | 2/3 | 2 | tool-call emission collapse |
| task_133 | 2/3 | 2 | tool-call emission collapse |
| task_137 | 2/3 | 2 | tool-call emission collapse |
| task_144 | 2/3 | 2 | tool-call emission collapse |
| task_151 | 2/3 | 2 | tool-call emission collapse |

Also at the hard edge (kept, labeled `too_hard`): task_021, task_075, task_076, task_106, task_132 — 0/3 across all runs.

Full episode traces for every flaky task (tool calls with exact arguments, model thoughts, per-assertion verifier verdicts): [`data/flake/flaky-trajectories.json`](../data/flake/flaky-trajectories.json).

## Failure mode 1 — large-payload tool-call emission collapse (dominant)

The model navigates perfectly — finds the right matter documents, reads them in the required order — then must emit `draft_matter_document(title, doc_type, body)` where `body` is a full legal memo. **It emits the call with empty arguments**, receives `TypeError: draft_matter_document() missing 3 required positional arguments`, and repeats the *identical* empty call while its thinking claims to be fixing the parameter structure:

```
step 3: draft_matter_document({})  → missing 3 required positional arguments
        thought: "I have the source materials. Now I'll draft the memo…"
step 4: draft_matter_document({})  → same error
        thought: "I need to pass the parameters correctly. Let me retry with the proper structure."
step 5: draft_matter_document({})  → same error
        thought: "I need to pass the parameters directly as top-level arguments, not nested…"
```

This is a genuine doom loop under the strict definition: identical tool, identical arguments, stuck reasoning. In push #2 **all 12 failing episodes across the 11 flaky tasks were this one mode**. The raw production envelopes (captured per episode) confirm the model itself emits the empty call — this is not harness argument-parsing loss (a nested-`arguments` wrapper unwrap is already in place upstream).

## Failure mode 2 — workflow shortcut

All tool calls succeed, the deliverable gets drafted, but the verifier fails `required_workflow_path`: the model drafted from `query_matter_documents` **search previews** instead of performing the required ordered `read_matter_document → read_matter_document → draft_matter_document` evidence chain. It sometimes even asserts "I've completed all required checkpoints" while having skipped them — a miscalibrated self-report. Same prompt, same model: some runs follow the evidence procedure, some shortcut it.

## Failure mode 3 — injected-friction non-recovery

The world injects realistic API friction (`rate_limited`, `stale_reference`). The model usually recovers by retrying with different arguments (deliberately *not* counted as doom-looping); occasionally the recovery consumes its focus and the run ends incomplete.

## The observation: why the same model passes and fails the same task

**The boundary is not knowledge or navigation — it is reliability of one hard emission under load.** The clearest evidence is task_127, three runs, byte-identical first three steps:

- **Pass run A**: `query → read → read → draft({})` *fails once* → the model **recovers**, re-emits with the full memo body → verifier passes.
- **Pass run B**: `query → read → read → draft(full body)` — clean on the first try.
- **Fail run**: `query → read → read → draft({}) → draft({}) → draft({})` — never recovers.

The entire pass/fail difference is whether the model successfully serializes one large (multi-thousand-token) string argument into a tool call — and, when it fumbles, whether it *actually changes* its next emission or only believes it did. That stochastic recovery-vs-loop split is what makes these tasks flaky rather than hard: the capability is present (it passes 2/3), but it is not reliable at this payload size. Secondary contributors push runs across the line: longer required read chains (tier ≥4 materials) increase context pressure before the emission, and withheld input titles (tier ≥3) add an investigation phase that occasionally tempts the shortcut mode instead.

For training, this is the useful kind of failure: dense, reproducible, verifier-attributed, and concentrated on two trainable behaviors — large-argument emission robustness and procedure adherence under ambiguity.

## Boundary-push history (how the flaky set was produced)

Push #1 (`job_2dd32f675a8243ef`, 8 waves, 240 episodes, wave-cap stop): pass rates by tier 80 / 96.7 / 96.7 / 90 / **100** / 80 / 96.7 / 93.3 — materials-only escalation saturated; 10 flaky.

Push #2 (`job_77eef350b369400d`, after the escalation fix — withheld titles, unannounced distractors, real new input documents deepening required reads to 3–4): 73.3 / 93.3 / 93.3 / **83.3** / 93.3 — tier 3 dropped 13 points vs push #1's tier 3 with 2× the flaky yield; 11 flaky in 5 decided waves. (Push #2 halted at wave 6's decide step for an infrastructure reason unrelated to the model: the world document had grown past 500 MB of accumulated episode traces and the worker could no longer load it. Wave 6's 30 episodes are recorded in the ledger.)

Stop standard: 20+ flaky tasks with ≥3 distinct failure modes. The set shipped here: **21 flaky across both pushes, 3 distinct modes** — with the caveat, stated honestly, that push #2's contribution is a single-mode monoculture (emission collapse), so the per-mode diversity comes from push #1's cohort.
