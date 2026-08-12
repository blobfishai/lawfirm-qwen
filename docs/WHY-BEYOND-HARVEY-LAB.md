# How lawfirm-qwen relates to Harvey LAB — and what it adds

> The short answer: **lawfirm-qwen is not a competing rubric benchmark — it is the
> missing other half of one.** Harvey LAB grades *what an agent wrote* with an LLM
> judge; lawfirm-qwen makes the same task shapes *execute* inside a live world and
> grades *what the agent actually did* with deterministic verifiers. One measures
> work-product quality, the other measures operational reliability — and only the
> second can be re-run bit-identically, attributed per step, and used to prove
> where a model's capability boundary is.

This document is grounded in a full read of the vendored Harvey LAB clone
(1,760 `task.json`, 111,814 rubric criteria) and a 29-benchmark survey of the
legal-eval field (`data/research/legal-eval-inventory.md`).

## 1. What Harvey LAB is

- ~1,660–1,760 tasks (badge: 1,671) across 24+ practice areas and 5 work types:
  analyze (488), draft (444), review (306), research (24), contracting (498
  across 14 deal domains).
- Each task: partner-style instructions + synthetic matter documents + an
  expert-written rubric (~63.5 criteria/task, ~101K–112K total).
- Harness: Podman sandbox with six filesystem tools (bash, read, write, edit,
  glob, grep); the deliverable is files (memos, redlines).
- Grading: an LLM judge (default claude-sonnet-4-6 @ temp 0) evaluates each
  criterion pass/fail; **all-pass scoring** — one missed criterion of up to
  1,114 zeroes the task.

It is a serious, expert-built benchmark — the strongest public rubric corpus in
legal AI. Nothing below diminishes that.

## 2. What a rubric benchmark structurally cannot measure

These are properties of the *format*, not quality defects:

1. **No executable environment.** There is no database an agent can change, no
   tools with real semantics, no state. An agent that writes "I filed the
   record" into a memo and one that actually files a record are
   indistinguishable to a file-grading judge. (Our measured runs show this is
   the single most common failure of a frontier-adjacent model on these task
   shapes — the deliverable lands in chat, not in the system of record.)
2. **Nondeterministic grading.** The same deliverable can grade differently
   across judge models and harnesses. This is measurable at benchmark scale:
   the *same LAB family* produces top all-pass scores of **26.7%** on
   Artificial Analysis (120-task subset, single Gemini judge), **~7–12%** on
   Harvey's held-out set (multi-judge averaging), and **~13.3%** on Vals' HLAB
   hosting. Three harnesses, three absolute numbers.
3. **No repeatability protocol.** LAB has no concept of running a task N times
   and classifying stability. Aggregate pass rates cannot distinguish "60% of
   tasks trivially easy + 40% impossible" from "most tasks at the model's
   boundary" — the distributions look identical in a single pass.
4. **No per-step attribution.** When a task fails, the rubric tells you which
   *criteria* the text missed — not which *tool call* went wrong, with what
   arguments, after which observation.
5. **No behavioral guards.** A judge grades the artifact, not the process: it
   cannot veto a right-looking answer produced by skipping the required
   evidence chain, nor detect off-task collateral damage, nor test recovery
   from injected API friction.

## 3. What lawfirm-qwen adds (same task shapes, executable world)

146 of the world's original 156 tasks carry `harvey_lab` provenance — the
prompts are LAB-style engagement instructions ("Review the attached deal
materials … prepare an antitrust risk assessment and HSR filing strategy
memo. Output: antitrust-risk-memo.docx"). The difference is the envelope:

| Property | Harvey LAB | lawfirm-qwen world |
|---|---|---|
| Environment | files in a sandbox | 47-table canonical world, 2,767 seeded rows, 91 agent-visible product tools across nine systems |
| Input materials | documents in a folder | seeded `matter_documents` rows the agent must *find* (query → read-in-full chain enforced), with distractors, markups, disclosure schedules, superseded instructions |
| Grading | LLM judge, all-pass | deterministic VCode verifiers: per-assertion verdicts, graded reward, anti-hack vetoes (shortcut/fabrication/collateral-damage), advisory vs structural conditions |
| Repeatability | judge-dependent | bit-identical re-runs (seeded world, deterministic clock, seeded friction schedule) |
| Difficulty evidence | none | **21 tasks with 3-episode mixed-outcome proof** at a model boundary + full traces (`docs/FAILURE-REPORT.md`) |
| Failure attribution | missed rubric criteria | exact tool call, arguments, observation, and thought of every failing step |
| Operational stress | none | seeded friction: 3% injected `rate_limited`/`stale_reference` failures, 15% ambiguous write-acks, per-session write cap |
| Vendor dependency | Podman + judge API | **none** — `world/local/server.py` is stdlib Python; the entire benchmark runs offline (the original hosted world no longer exists; this repo resurrects it, proven by a 156/156 oracle fidelity pass) |
| Model measurement | one pass, judge-scored | N-episode leaderboard (`sim/run-leaderboard.mjs`) with per-episode step traces and per-model failure-mode reports (`sim/build-failure-report.mjs`) |

The deepest difference is the last row of the first table's spirit: **the
boundary proof**. A task is at a model's limit only when *its own repeated
runs mix outcomes* (2/3, 1/3). LAB cannot produce this evidence class at all;
here it is the headline artifact, with every failing run's tool calls and
thoughts on disk.

## 4. What Harvey LAB has that this world does not (read before quoting scores)

- **~101K expert-written rubric criteria.** Our verifiers are generated and
  execution-grounded, but nobody with a bar card reviewed them one by one.
- **Prose-quality judgment.** A deterministic verifier can check that a memo
  was filed, grounded in the required reads, with the pinned determinations —
  it cannot judge whether the memo's *argument* is good. LLM-judge rubrics can.
  The two graders measure different halves of "did the associate do good work."
- **Breadth.** ~1,660 tasks / 24 practice areas vs our 156 + expansion. We
  anchor to every LAB *family* and practice-area shape, not to every task.
- **Human data provenance.** LAB's documents were human-guided; ours are
  synthetic (blobfish-generated + eval-anchored expansion packs).

## 5. Where this sits in the wider field

From the 29-benchmark survey (`data/research/legal-eval-inventory.md`): the
agentic-legal-eval field splits into (a) rubric all-pass benchmarks (Harvey
LAB, Vals HLAB/Legal Research Bench — LLM-judged, not deterministic), (b)
private industrial suites (Thomson Reuters CoCoBench/Scorecard), (c) academic
interactive environments (J1Bench, LegalWorld — China-law procedural sims),
and (d) static datasets (LegalBench, CUAD, MAUD, LexGLUE, TaxCalcBench …) with
deterministic grading but no environment.

**No published benchmark combines: an executable law-firm world + deterministic
per-assertion grading + seeded repeatability + fault injection + boundary-proven
flaky tasks.** The nearest methodological neighbor is OccuBench (simulated
professional tool environments with fault injection) — which has no legal
domain. lawfirm-qwen occupies exactly that empty cell, while borrowing its task
shapes from the strongest rubric corpus (LAB) and its answer keys from the
strongest deterministic datasets (CUAD, MAUD, LegalBench, TaxCalcBench — see
the expansion packs in `world/expansion/`).

## 6. Eval-anchor coverage matrix

| Anchored benchmark | Family hosted in this world | Where |
|---|---|---|
| Harvey LAB | analyze / draft / review workflows, tier-escalated materials (markups, distractors, disclosure schedules, superseded instructions) | 146 original tasks + `deep-drafting` pack |
| Harvey BigLaw Bench | SPA deal-point extraction (Workflows), retrieval-over-corpus (Retrieval) | `spa-deal-extraction`, `discovery-retrieval` packs |
| LegalBench | rule-application / rule-conclusion doctrines (hearsay, personal jurisdiction, UCC v. common law, successor liability, Abercrombie …) | `legalbench-rule-application` pack |
| CUAD | 41-category clause identification with absent-clause negatives | `cuad-clause-extraction` pack |
| MAUD | deal-point determinations over merger agreements (termination fees, MAE carveouts, no-shop/fiduciary out) | `maud-deal-points` pack |
| LegalAgentBench | multi-hop cross-table lookup chains | 8 original tasks |
| TaxCalcBench / ConvFinQA | deterministic multi-step computation (damages, interest, fee true-ups) with exact numeric answer keys | `damages-computation` pack |
| Stanford HAI hallucination audits | absent-answer traps: abstention + escalation is the *only* passing behavior; fabricated determinations are veto-failed | `hallucination-traps` pack |
| GC AI / VLAIR shapes | document extraction, review-and-determine, structured research output | distributed across packs |

Every expansion task is admitted the same way the original 156 were: its
reference walk must execute against the live world and pass its verifier
(`world/local/oracle.py`), and fabricated-answer traps must fail probe rollouts.

## 7. The one-line answer to "how is this better than Harvey LAB?"

It isn't "better" — it is *executable*. Harvey LAB tells you how good a
model's legal writing looks to a judge, once. lawfirm-qwen tells you whether
the same model, given the same matter three times, actually finds the
documents, follows the required evidence chain, files the deliverable into the
system of record, extracts the right numbers, refuses to fabricate when the
record is silent, recovers from API friction — and *how it fails when it
fails*, with the exact tool call on disk. If you are training or shipping a
legal agent rather than admiring one, the second set of questions is the one
that pages you at 2 a.m.
