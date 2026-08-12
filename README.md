# legal-agent-simulation — Eve Litigation Law Firm (SIMULATED) Simulation World

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

1. **The product-only world** — canonical `world-v16.json`: **291 tasks**,
   **39 product-system tables / 2,754 seeded rows**, **92 contract-defined
   tools**, zero synthesized name-family tools, and one deterministic verifier
   per task. The migration reconciles every legacy row and rewrites every walk
   through committed ID and check-grammar manifests.

   Admission takes two proofs. The oracle proves all **291/291** reference
   executions are satisfiable. The discrimination sweep classifies **174**
   tasks as content-discriminating and **117** as explicitly lacking a
   determinate answer key, with **0 broken keys, 0 broken guards, and 0 harness
   errors** ([v16 report](docs/DISCRIMINATION-v16.md)). Golden fixtures freeze
   five verdicts per task; a six-defect badbank continuously tests the gates.

   “Mirrors a vendor” is deliberately not treated as “exact.” The conformance
   registry covers all 92 tools and publishes unresolved schema, pagination,
   error, and partner-gated gaps; the current measured status is in
   [`docs/CONFORMANCE.md`](docs/CONFORMANCE.md) and
   [`docs/MCP-JUSTIFICATION.md`](docs/MCP-JUSTIFICATION.md).

2. **The evidence and eval supply chain** — task packs, real source documents,
   and a 46-repository legal-domain research corpus under `research/repos/`.
   The v17 work imports Harvey LAB’s documents and task harness into a separate
   file lane while deterministic state/grounding checks remain the headline
   score.
3. **Audited measurements** — deterministic episode traces, pass^k,
   discrimination artifacts, and per-model failure-mode reports. Historical
   v15 boundary results remain available, but absolute model outcomes must be
   re-measured on the migrated v16 tool surface before comparison.

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
                             │  6 per-system servers: Clio, CourtListener,   │
                             │  iManage, Relativity, Google Workspace, and   │
                             │  LEDES via serve-system.mjs + systems.json,   │
                             │  or one bridge exposing the same 92 tools     │
                             └───────────────┬───────────────────────────────┘
                                             │ sessions · /mcp · /verify
                                             ▼
                             ┌───────────────────────────────────────────────┐
                             │ world/local/server.py — local world runtime   │
                             │ hydrates world-v16.json → session SQLite      │
                             │ 92 contract tools · zero synthesized tools ·  │
                             │ VCode verifiers ·                             │
                             │ seeded friction (rate_limited/stale_reference,│
                             │ ambiguous acks, write cap) — all deterministic│
                             └───────────────────────────────────────────────┘
```

The original hosted world (`sbx_206712ec47f741d3`) no longer resolves on
blobfish.ai. `world/local/server.py` runs the migrated local world from the
complete v16 document and six product contracts. Solvability is proved by
`data/oracle-v16.json`; API fidelity is a separate, fail-closed conformance
measurement rather than an inference from oracle success.

## The world

| | |
|---|---|
| World doc | **`world/blobfish/world-v16.json`**; lineage and deterministic compiler artifacts live under `world/migrate/` |
| Tables | 39 product-system tables, 2,754 rows; DMS, practice management, court records, e-discovery, workspace, and e-billing share one private per-session state |
| Tools | 92, all loaded from `mcp/v3/contracts/*.json`; the runtime rejects any world that still embeds Gen-1 tools |
| Tasks | 291 — 117 graph walks, 159 eval-anchored expansions, 15 native product workflows |
| Verifiers | 291 VCode programs regenerated from explicit check grammar where migrated; per-assertion reward plus anti-hack vetoes |
| Friction | seeded + deterministic: 3% injected `rate_limited`/`stale_reference`, 15% ambiguous write-acks, per-session write cap |
| Boundary evidence | 21 proven-flaky tasks, 57 shipped episode traces, 2 push ledgers |
| Admission | 291/291 oracle; 174 discriminating + 117 no-answer-key; 0 broken keys/guards |

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
npm run world:serve                      # canonical v16 world on :8971

# 2. Prove solvability and rejection behavior
npm run oracle                           # expect 291/291
python3 world/local/discriminate.py --base http://127.0.0.1:8971 --report-only

# 3. Check the separately measured API-conformance contract
python3 tools/conformance/run.py --check

# 4. One episode with a real model (.env: DEEPSEEK_API_KEY / ANTHROPIC_API_KEY / QWEN_*)
node sim/run-simulation.mjs --task task_127 --engine deepseek-chat

# 5. The leaderboard (N episodes × tasks × models; resumable)
node sim/run-leaderboard.mjs --engines deepseek-chat,claude-haiku-4-5 \
  --tasks scored --episodes 3 --resume

# 6. Failure-mode reports + the leaderboard page
node sim/build-failure-report.mjs --all
node docs/leaderboard/build-page.mjs

# 7. Harbor format (github.com/harbor-framework/harbor) — one Harbor task per
#    world task, agent/world isolated in separate containers (see harbor/README.md)
python3 harbor/generate.py --build-image
uvx harbor run -p "dist/harbor/tasks/task_005" -a oracle   # reward 1.0
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

| | Harvey LAB | legal-agent-simulation world |
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
world/blobfish/world-v16.json     canonical product-only world (tables, rows, tasks, verifiers)
world/migrate/                    deterministic Gen-1 → product compiler and manifests
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
