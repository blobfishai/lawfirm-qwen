# lawfirm-qwen — Eve Litigation Law Firm (SIMULATED) Simulation World

> **Simulation only.** Every matter, client, document, attorney, and figure in
> this repo is synthetic test data. "Harvey-LAB-anchored" names a task-shape
> lineage (the benchmark's task shapes), not any affiliation with Harvey or any
> law firm.

An executable law-firm simulation world (matter intake → conflicts → research →
file → docket → discovery → deadlines → hearing → billing, plus
document review-and-draft deliverable work) with **deterministic VCode
verifiers**, **per-product MCP servers mirroring real vendor APIs** (Clio,
CourtListener, iManage, Relativity, LEDES, Google Workspace dialects — see
`docs/MCP-JUSTIFICATION.md`), a **multi-model leaderboard**, and **per-model
failure-mode reports**. Originally generated via [blobfish.ai](https://blobfish.ai/studio);
now **fully self-hosting** — the entire world runs offline from this repo.

Three things live here:

1. **The world** — canonical `world-v13.json`: **288 tasks**, **352 seeded
   matter documents**, 70 tables + 38 product tables, **183 tools** across two
   generations (95 legacy incl. the async analysis queue + 88 v3 mirroring real vendor APIs), one verifier
   per task, **288/288 oracle-proven**, 0 domain-lint flags. Every runnable
   eval and workflow in the 101-item domain registry is hosted — **zero
   hostable gaps remain** ([`docs/COVERAGE.md`](docs/COVERAGE.md)).

   Admission takes two proofs, not one. The oracle proves each task is
   *satisfiable*; a **discrimination sweep** proves it *rejects wrong
   behavior* — four adversarial episodes per task (no-op, text-only,
   blind-write, and the reference walk with a corrupted payload). **All
   288 reject the three behavioral modes; 169 also reject a wrong answer**,
   and of the 119 that cannot, 110 are prose deliverables where no exact
   string exists to pin. Zero broken keys, zero broken guards — every
   verifier that claims an answer key enforces it
   ([`docs/DISCRIMINATION.md`](docs/DISCRIMINATION.md)). That sweep retired 38
   tasks whose prompt named its own tool walk and whose verifier pinned
   nothing — replaced one-for-one by `packs-v4`, which grades a covenant
   breach, a claim's priority, a damages computation, an HSR fee tier and an
   arbitral institution against documents that carry the facts.

   **Harvey LAB tasks run here.** `world/expansion/packs-lab/` hosts LAB task
   content directly: the documents are extracted **verbatim** from the real
   `.docx`/`.xlsx`/`.eml` bytes by `research/lab_extract.py` (10/10 parsed,
   ~193k characters), and the questions are re-cut to the determinate
   decisions the source rubric already asserts, so they grade without an LLM
   judge. What is lost is prose quality; what is gained is a checkable answer
   key — all four LAB-derived tasks pass the oracle and reject all four
   adversarial modes. Provenance (repo, commit, source task, license) travels
   in the pack.

   The domain corpus that grounds this is **46 cloned repos** under
   `research/repos/` (manifest: `research/repos-manifest.tsv`), with the
   question-driven research in [`research/QUESTIONS.md`](research/QUESTIONS.md)
   and the framing in [`research/THESIS.md`](research/THESIS.md).

2. **The boundary proof** — 21 tasks with direct mixed-outcome evidence (same
   model, same prompt, 3 episodes, sometimes passes / sometimes fails) and a
   per-episode trace corpus explaining *why*. See
   [`docs/FAILURE-REPORT.md`](docs/FAILURE-REPORT.md).
3. **Audited model measurements** — models measured as agents in the world,
   3 episodes/task, deterministic scoring, failure-mode classification per
   model, and an adversarial audit that hunted harness bugs before trusting
   any number (three found, quantified, fixed — see
   [`docs/AUDIT.md`](docs/AUDIT.md)). Reports in
   [`reports/`](reports/); coverage proof in
   [`docs/COVERAGE.md`](docs/COVERAGE.md).

## Architecture

```
  any OpenAI-compatible      ┌────────────────────────────────────────────────┐
  model (config/world.       │  sim/run-simulation.mjs   one episode          │
  config.json registry:   ◄──┤  sim/run-leaderboard.mjs  models × tasks × N   │
  deepseek, claude, qwen…)   │  sim/build-failure-report.mjs  mode classifier │
                             └───────────────┬────────────────────────────────┘
                                             │ MCP (stdio, JSON-RPC)
                                             ▼
                             ┌───────────────────────────────────────────────┐
                             │ mcp/ — the firm stack as MCP servers          │
                             │  8 per-system servers (practice mgmt, docket, │
                             │  DMS, billing, discovery, office, HR, know-   │
                             │  ledge) via serve-system.mjs + systems.json,  │
                             │  or the legacy single bridge (measurement     │
                             │  default; --mcp multi switches per run)       │
                             └───────────────┬───────────────────────────────┘
                                             │ sessions · /mcp · /verify
                                             ▼
                             ┌───────────────────────────────────────────────┐
                             │ world/local/server.py — local world runtime   │
                             │ hydrates world/blobfish/world*.json → SQLite  │
                             │ 102 synthesized tools · VCode verifiers ·     │
                             │ seeded friction (rate_limited/stale_reference,│
                             │ ambiguous acks, write cap) — all deterministic│
                             └───────────────────────────────────────────────┘
```

The original hosted world (`sbx_206712ec47f741d3`) no longer resolves on
blobfish.ai. `world/local/server.py` resurrects it from the complete world
document shipped in this repo; fidelity is proven by
`world/local/oracle.py` — **231/231 tasks execute their reference walks and
pass their shipped verifiers** (`world/local/oracle-expanded-full.json`).

## The world

| | |
|---|---|
| World doc | canonical chain: `world.json` (original 156) → `world-expanded.json` (231, eval packs) → `world-lawnative.json` (230, ERP purge) → **`world-v3.json` (245, + v3 workflow tasks — the canonical world)** |
| Tables | 74 (matters, dockets, conflicts, evidence records, billing, **matter_documents** with 211 seeded files: deal materials, counterparty markups, contracts, merger agreements, SPAs, discovery corpora, rule memos, computation exhibits, distractors) |
| Tools | 102 executable (read/query/create/update/draft families; behavior synthesized deterministically from tool specs; admitted iff the reference walk passes the verifier) |
| Tasks | 231 — 146 Harvey-LAB-anchored, 8 LegalAgentBench, 2 graph-walk, 75 eval-anchored expansion |
| Verifiers | 231 VCode programs: per-assertion verdicts, graded reward, anti-hack vetoes (workflow shortcut, fabrication, collateral damage), advisory tool-health |
| Friction | seeded + deterministic: 3% injected `rate_limited`/`stale_reference`, 15% ambiguous write-acks, per-session write cap |
| Boundary evidence | 21 proven-flaky tasks, 57 shipped episode traces, 2 push ledgers |
| Quarantine | `task_016` (prompt/verifier drift) — runnable, excluded from headline scores |

### Eval-anchored expansion (75 tasks, 81 documents)

Each expansion pack ports a public benchmark's *answer-key discipline* into the
executable world — the prompt states the output vocabulary; the answer comes
only from reading the seeded documents; the verifier pins it:

| Pack | Anchor | What it grades |
|---|---|---|
| `cuad-clause-extraction` (10) | CUAD | per-category clause identification over executed contracts (30 real CUAD category slugs); absent-category fabrication traps |
| `maud-deal-points` (10) | MAUD | deal-point determinations over merger agreements; exact termination-fee amounts pinned; absent-deal-point trap |
| `spa-deal-extraction` (7) | BigLaw Bench Workflows | SPA price/escrow/cap/basket extraction; superseded-draft distractor traps |
| `legalbench-rule-application` (14) | LegalBench | hearsay, personal jurisdiction, diversity, UCC v. common law, Abercrombie — rule applied to fact patterns, outcome pinned |
| `discovery-retrieval` (8) | BigLaw Bench Retrieval | find the smoking-gun documents among near-miss distractors; required reads enforced from the trace |
| `hallucination-traps` (7) | Stanford HAI audits | the record does **not** contain the answer; only escalation passes; fabricated determinations are veto-failed |
| `damages-computation` (7) | TaxCalcBench / ConvFinQA | multi-step arithmetic (interest, allocations, caps) with the exact result pinned |
| `deadline-computation` (6) | court-rule calendaring | SRCP-6-style deadline computation from trigger documents: service vs filing triggers, mail-day ordering, weekend/holiday rollover, chained briefing deadlines, no-trigger abstention — dates pinned exactly |
| `deep-drafting` (6) | Harvey LAB tier-4 | 4–5 required reads incl. markups, playbooks, disclosure schedules, and a superseding instruction letter |

Packs live in `world/expansion/packs/`; `world/expansion/assemble.mjs` compiles
them (append-only) into `world-expanded.json`, generating each verifier from
the same check grammar as the originals. Admission = oracle pass.

## Run

```bash
# 1. Serve the world locally (no API keys needed)
npm run world:serve                      # original 156-task world on :8971
python3 world/local/server.py --port 8972 --world world/blobfish/world-expanded.json

# 2. Prove fidelity (reference walks vs shipped verifiers)
npm run oracle                           # expect 156/156
python3 world/local/oracle.py --base http://127.0.0.1:8972 \
  --world world/blobfish/world-expanded.json          # expect 231/231

# 3. One episode with a real model (.env: DEEPSEEK_API_KEY / ANTHROPIC_API_KEY / QWEN_*)
node sim/run-simulation.mjs --task task_127 --engine deepseek-chat

# 4. The leaderboard (N episodes × tasks × models; resumable)
node sim/run-leaderboard.mjs --engines deepseek-chat,claude-haiku-4-5 \
  --tasks scored --episodes 3 --resume

# 5. Failure-mode reports + the leaderboard page
node sim/build-failure-report.mjs --all
node docs/leaderboard/build-page.mjs
```

Engines resolve from the `models` registry in `config/world.config.json` —
adding a model is one JSON entry (any OpenAI-compatible endpoint; qwen3-8b is
the repo's target policy via `QWEN_BASE_URL`).

## Why this is more than Harvey LAB's world

Harvey LAB grades *what an agent wrote* with an LLM judge — the strongest
rubric corpus in legal AI (~1,660 tasks, ~101K expert criteria), and
structurally unable to measure what this repo measures: whether the work
*actually happened* in a system of record, whether it happens *reliably*
across repeated runs, and *which step* breaks when it doesn't. The full
argument, grounded in a 29-benchmark survey of the legal-eval field, is in
[`docs/WHY-BEYOND-HARVEY-LAB.md`](docs/WHY-BEYOND-HARVEY-LAB.md); the survey
itself is [`data/research/legal-eval-inventory.md`](data/research/legal-eval-inventory.md).

| | Harvey LAB | lawfirm-qwen world |
|---|---|---|
| Environment | file sandbox, no state | 74-table live SQLite, 102 executable tools |
| Grading | LLM judge, all-pass rubric | deterministic VCode, per-assertion, anti-hack vetoes |
| Repeatability | judge-dependent (same family scores 26.7% / ~7–12% / ~13.3% top all-pass under three harnesses) | bit-identical re-runs, seeded friction |
| Difficulty evidence | none | 21 boundary-proven flaky tasks with full traces |
| Failure attribution | missed rubric criteria | exact tool call, arguments, observation per failing step |
| Answer keys | rubric prose | CUAD/MAUD/LegalBench/TaxCalcBench-anchored pinned values |
| Runs offline | no (judge API) | yes (stdlib Python + Node) |

And the honest converse: LAB has expert-written rubrics, human-guided
documents, prose-quality judgment, and ~8× our task count. The two measure
different halves of "did the associate do good work."

## Leaderboard & failure modes

`docs/leaderboard/index.html` is the AA-style leaderboard
(cf. [artificialanalysis.ai/evaluations/harvey-lab-aa](https://artificialanalysis.ai/evaluations/harvey-lab-aa)):
task pass rate, pass^3 (the reliability metric), flaky-21 boundary scores,
per-family jagged-intelligence heat maps, per-model failure-mode stacks, cost
per episode. Every number traces to episode JSONs under `data/leaderboard/`.

Per-model reports in `reports/` classify every failing episode
from its step trace into the world's failure-mode taxonomy (emission collapse,
workflow shortcut, deliverable-left-in-chat, wrong graded value, evidence gap,
fabrication, friction non-recovery, …) — the "what does this model actually
get wrong" report the leaderboard number summarizes.

## Layout

```
config/world.config.json          engine + model registry · world paths · quarantine · flake data
mcp/blobfish-lawfirm-bridge.mjs   stdio ⇄ world-server bridge + harness tools
world/local/server.py             local world runtime (sessions, tools, verifiers, friction)
world/local/oracle.py             reference-walk fidelity prover
world/blobfish/world.json         original world document (complete: tables, rows, tools, tasks, verifiers)
world/blobfish/world-expanded.json  + 75 eval-anchored tasks, 81 documents
world/expansion/packs/*.json      content packs (documents + answer-keyed task specs)
world/expansion/assemble.mjs      pack compiler (tasks + generated verifiers, append-only)
sim/run-simulation.mjs            one episode (any registry engine)
sim/run-leaderboard.mjs           models × tasks × episodes, aggregates
sim/build-failure-report.mjs      failure-mode classifier + per-model reports
docs/leaderboard/                 build-page.mjs + index.html (the leaderboard)
reports/             per-model failure-mode reports
docs/FAILURE-REPORT.md            the original boundary analysis (deepseek-v4-flash)
docs/WHY-BEYOND-HARVEY-LAB.md     differentiation report
data/research/                    29-benchmark legal-eval inventory + AA leaderboard reference
data/flake/                       flaky trajectories + push ledgers (boundary evidence)
data/leaderboard/                 episodes/ results/ failure-modes/ (measurement data)
```
