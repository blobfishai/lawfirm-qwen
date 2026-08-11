# lawfirm-qwen — delivery note

An executable law-firm world for evaluating agents, with deterministic grading,
a proven capability boundary, and every claim traceable to something you can
re-run.

> **Simulation only.** Every matter, client, document, attorney and figure is
> synthetic. "Harvey-LAB-anchored" names a task-shape lineage, not an
> affiliation.

---

## What you get

| | |
|---|---|
| World | `world/blobfish/world-v13.json` — 288 tasks, 352 seeded documents, 71 tables + 38 product tables, 183 tools |
| Grading | one deterministic VCode verifier per task; per-assertion verdicts, graded reward, anti-hack vetoes |
| Runtime | `world/local/server.py` — offline, hydrates the world into SQLite, serves MCP over stdio/HTTP |
| Packaging | `dist/harbor` — Harbor format, 288 tasks, 13.0 MB |
| Tool surface | 95 native + 88 mirroring real vendor APIs (Clio, CourtListener, iManage, Relativity, LEDES, Google Workspace) across 8 per-system MCP servers |
| Evidence corpus | 46 cloned domain repos under `research/repos/`, manifest committed |

## Admission takes three proofs, not one

Most benchmarks stop at the first. Each of these caught defects the others
could not.

1. **Satisfiable** — `world/local/oracle.py` executes every task's reference
   walk against the live runtime and requires its shipped verifier to pass.
   **288/288.**
2. **Discriminating** — `world/local/discriminate.py` drives four adversarial
   episodes per task (no-op, text-only, blind-write, and the reference walk
   with the terminal payload corrupted) and requires rejection. **All 288
   reject the three behavioural modes; 169 also reject a wrong answer.** Of the
   119 that cannot, 110 are prose deliverables where no exact string exists to
   pin — a limit of deterministic grading, stated rather than hidden.
3. **Correct** — measured against a model. This is the one people skip, and it
   is the one that found a wrong answer key that both proofs above had passed
   (`docs/AUDIT.md`, Bug 8).

Reproduce all three:

```bash
python3 world/local/server.py --world world/blobfish/world-v13.json \
    --v2-contracts mcp/v3/contracts --port 8791       # NOTE: --v2-contracts is required
python3 world/local/oracle.py       --base http://localhost:8791 --world world/blobfish/world-v13.json
python3 world/local/discriminate.py --base http://localhost:8791 --world world/blobfish/world-v13.json
node world/expansion/domain-lint.mjs
```

## The boundary

Measured on deepseek-chat, single 95-tool surface: 256 triage episodes plus 88
boundary episodes at 8 per task, $22 total. `docs/BOUNDARY.md` carries per-task
rates with 95% Wilson intervals; `docs/TRIAGE-NEW-FAMILIES.md` the family triage.

Of 11 tasks that looked flaky at 3 episodes, **6 are genuinely mixed and 5 were
noise** — which is the whole reason to re-measure rather than trust a fraction:

| Task | Family | Rate at n=8 | Dominant failure |
|---|---|---|---|
| `task_310` | LAB comp escalation | **1/8** (71 calls) | collateral-write ×7 |
| `task_312` | LAB comp escalation | **2/8** | collateral-write ×6 |
| `task_320` | posture chronology | **2/8** | **wrong-value ×6** |
| `task_309` | LAB comp escalation | **4/8** | collateral-write ×4 |
| `task_287` | bankruptcy claims | 7/8 | collateral-write ×1 |
| `task_296` | HSR merger | 7/8 | collateral-write ×1 |

Across every miss: **collateral-write 19, wrong-value 6**. Three quarters of the
failures at the boundary are discipline, not reasoning.

A caution the table itself makes: at n=8 a clean 8/8 still carries a 95% lower
bound near 0.68. "No failures observed" is not "reliable", and the report labels
it that way rather than promoting it.

**The characteristic failure of this model in this world is not a wrong answer
— it is a collateral write.** The required write succeeds and an undeclared one
follows: into `agent_sheets` via a delegation surface, into
`legal_billing_amount_history` alongside the matter ledger, or the same answer
twice into two tables. That mode is invisible to a benchmark that grades a
document, because nothing about the document is wrong.

The second mode is posture: given identical documents, the model records the
opposing party's answer. The posture family ships in pairs where each task
forbids its partner's correct answer, so ignoring the frame fails exactly one
half of every pair — proven by swapping the answers, not asserted.

## What this world measures that a document benchmark cannot

- **Side effects.** Every task declares the tables it may touch; writes outside
  that set veto the reward. `no_offtask_table_changes`,
  `no_undeclared_rows_created`, `no_rows_destroyed`, `audit_logs_append_only`.
- **Evidence chain.** `required_documents_read` is enforced from the trace's own
  arguments, so a right answer reached without reading the source fails.
- **Abstention.** Gap disclosure (name the exhibit that was never delivered),
  unretrieved authority (refuse to describe a statute you could not fetch),
  ethical walls (the runtime returns `ethical_wall`; the index stays visible and
  the body never arrives). In these families the fluent, confident answer is the
  forbidden one.
- **Waiting.** The async analysis queue returns `job_not_complete` until polled
  to completion. Answering early is always available and always wrong.

## What it does not measure, stated plainly

- **Prose quality.** 110 tasks file a drafted deliverable and grade its
  workflow, evidence chain and filing — not its argument. Harvey LAB grades
  exactly this with 114,437 rubric criteria and an LLM judge; we cannot, and
  `research/THESIS.md` sets out the trade honestly.
- **Retrieval at scale.** LAB's diligence rooms run to 4,061 real
  `.docx`/`.xlsx`/`.eml` in nested data-room trees; our largest corpus is 352
  text rows. We host LAB task content verbatim (`world/expansion/packs-lab/`)
  but at one task, not at corpus scale.
- **Multi-turn negotiation.** LAB ships 498 contracting tasks in a six-stage
  lifecycle where the input includes the previous turn's artifact. We have none.
- **Non-English corpora, judged prose, form/interview runtimes** — 60 items in
  the domain registry are structural gaps, enumerated in `docs/COVERAGE.md`.

## Known defects and how they were found

`docs/AUDIT.md` carries eight, each with symptom, diagnosis, fix and quantified
impact. Three are worth reading before trusting any number in any benchmark:

- **Bug 4** — the verification baseline was captured before per-task seeding, so
  seeded rows were credited to the agent. One episode is recorded as *passed
  with reward 1.0* having only queried and read. 107 archived verdicts are
  quarantined and excluded from every rate.
- **Bug 5** — `required_workflow_path` graded the reference solution's *browsing
  order*, failing agents that reached identical evidence by a different route.
- **Bug 8** — an answer key that contradicted what the world actually computes.
  The oracle could not see it (it writes the pinned value, it never reads the
  result) and the discrimination sweep could not either (a wrong-but-consistent
  key rejects perturbation fine). **A model disagreeing found it.**

## Repository map

```
world/blobfish/world-v13.json   the world (canonical)
world/local/                    runtime, oracle, discrimination harness, Harbor export
world/expansion/packs-*/        content packs, each a generator with its answer keys derived
mcp/                            8 per-system MCP servers + v3 vendor-API contracts
tasks/ verifiers/ traces/       browsable catalog, one folder per task
research/                       46-repo corpus, question-driven answers, thesis
docs/                           AUDIT · DISCRIMINATION · BOUNDARY · COVERAGE · THESIS
dist/harbor/                    Harbor package
```
