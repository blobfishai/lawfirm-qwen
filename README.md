# lawfirm-qwen — Eve Litigation Law Firm (SIMULATED) Simulation World

> **Simulation only.** Every matter, client, document, attorney, and figure in
> this repo is synthetic test data. "Harvey-LAB-anchored" names a task-shape
> lineage (the benchmark's task shapes), not any affiliation with Harvey or any
> law firm.

A Harvey-LAB-anchored simulation world for a litigation/corporate law firm
(matter intake → conflicts → open matter → research → file → docket →
discovery → deadlines → hearing → billing, plus document review-and-draft
deliverable work), generated **via [blobfish.ai](https://blobfish.ai/api-docs)**,
exposed over **MCP**, and intended to be driven/evaluated with a **qwen** agent
(`qwen3-8b` by default; any OpenAI-compatible endpoint via env).

The headline of this repo is not the world — it is the **boundary proof**: 21
tasks with direct mixed-outcome evidence (same model, same prompt, 3 episodes,
sometimes passes / sometimes fails) and a per-episode trace corpus explaining
*why* the model fails when it fails. See
[`docs/FAILURE-REPORT.md`](docs/FAILURE-REPORT.md).

## Architecture

```
  qwen (OpenAI-compatible   ┌────────────────────────────────────────────────┐
  endpoint via env)      ◄──┤                sim/run-simulation.mjs          │
                            │  agent loop · context guard · task selection   │
                            └───────────────┬────────────────────────────────┘
                                            │ MCP (stdio, JSON-RPC)
                                            ▼
                            ┌───────────────────────────────────────────────┐
                            │ mcp/blobfish-lawfirm-bridge.mjs               │
                            │ stdio ⇄ MCP-over-HTTP proxy                   │
                            │ + verify_task / reset_session harness tools   │
                            └───────────────┬───────────────────────────────┘
                                            │ Mcp-Session-Id
                                            ▼
                            ┌───────────────────────────────────────────────┐
                            │ blobfish.ai hosted world sbx_206712ec47f741d3 │
                            │ 82 tables · 117 tools · 156 tasks ·           │
                            │ VCode verifiers · seeded matter documents     │
                            └───────────────────────────────────────────────┘
```

## The world

| | |
|---|---|
| World id | `sbx_206712ec47f741d3` (hosted; snapshot in `world/blobfish/world.json`) |
| Tables | 82 (matters, dockets, conflicts, evidence records, trust ledger, **matter_documents** with 78 seeded input files: deal materials, counterparty markups, distractor correspondence, disclosure schedules, deal-email threads) |
| Tools | 117 executable (every tool admitted iff it executes against the live SQLite) |
| Tasks | 156 — 146 anchored to Harvey LAB task shapes, 8 to LegalAgentBench, 2 graph-walk |
| Task labels | 36 at-limit · 105 too-easy · 5 too-hard · 10 unlabeled (all kept, none deleted) |
| Boundary evidence | 21 proven-flaky tasks, 57 shipped episode traces, 2 push ledgers |

Tasks are **blobfish-generated from the benchmark's own task shapes**: the
pack's example instruction is the visible prompt skeleton ("Review the attached
deal materials … prepare an antitrust risk assessment and HSR filing strategy
memo. Output: antitrust-risk-memo.docx"), and blobfish generates the executable
envelope — seeded input documents, tools, ordered-workflow verifiers — so the
same task shape the benchmark grades with rubrics runs and grades
deterministically here.

## Layout

```
config/world.config.json       engine (qwen via env) · world id · flake data map
mcp/blobfish-lawfirm-bridge.mjs   stdio ⇄ hosted-world MCP proxy + harness tools
sim/run-simulation.mjs         agent loop against the MCP surface
sim/run-flake-scan.mjs         N-trial flake scan per task (reproduce the boundary)
world/blobfish/world.json      world snapshot (trajectories stripped for size)
world/blobfish/quality.json    scorecard + label distribution + flaky list
data/flake/flaky-trajectories.json   all episodes for every flaky task (tool calls,
                                     exact arguments, thoughts, verifier verdicts)
data/flake/push1-ledger.json   boundary push #1 wave ledger (8 waves, 240 episodes)
data/flake/push2-ledger.json   boundary push #2 wave ledger (escalation-fix run)
docs/FAILURE-REPORT.md         the analysis: modes, pass-vs-fail diff, observation
```

## Run

```bash
# 1. Hosted world over MCP (needs a blobfish API key)
BLOBFISH_API_KEY=... npm run mcp

# 2. Drive the agent (any OpenAI-compatible qwen endpoint)
QWEN_BASE_URL=... QWEN_API_KEY=... npm run sim

# 3. Reproduce the boundary: 3 trials per flaky task
QWEN_BASE_URL=... QWEN_API_KEY=... npm run flake -- --tasks task_127,task_099
```

The shipped failure report was measured against `deepseek-v4-flash`; the flake
scan reproduces the same protocol against qwen (or any endpoint you point it
at) so the boundary can be compared across policies.
