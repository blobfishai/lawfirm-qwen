# Discrimination audit — does each task reject wrong behavior?

The oracle proves a task is *satisfiable*: its reference walk executes and passes. That is
half of admission. A task that ALSO passes when the agent does nothing, reads without
writing, or writes the wrong value grades nothing — and measuring a model on it spends
money to learn noise.

`world/local/discriminate.py` drives four adversarial episodes per task against the live
world. This classifier distinguishes an unenforced claimed key from a task that declares
no determinate content key:

| Mode | What the fake agent does |
|---|---|
| `noop` | no calls at all |
| `text_only` | every read checkpoint, no writes — the deliverable-in-chat mode |
| `blind_write` | every write checkpoint, no reads — the shortcut mode |
| `wrong_value` | the full reference walk, terminal write payload corrupted (ids preserved) |

## Result over 2289 tasks

| Verdict | Tasks | Meaning |
|---|---|---|
| discriminating | 2284 | rejects all four modes |
| no-answer-key | 0 | rejects behavioral modes; declares no pinned content assertion, so corrupted prose is not mechanically rejected |
| key-inconclusive | 5 | the corrupted write was rejected by the tool itself, so the verifier key was not exercised |
| **BROKEN-KEY** | 0 | claims an answer key, yet a corrupted write still passes — a defect |
| **BROKEN-GUARD** | 0 | accepts no-op, text-only, or blind-write — a defect |
| **HARNESS-ERROR** | 0 | an episode is missing or malformed — no task verdict may be inferred |

Assertion-manifest diagnostic: 0 verifier(s) omit one or more
declared key assertions from metadata. Classification uses the explicit check grammar when
present and executed VCode for legacy verifiers; any drift is an admission defect.

### What `no-answer-key` means for measurement

These tasks still grade real behavior — the workflow path, evidence-before-write, the
insertion, and anti-hack guards all bind. They do not grade the CONTENT of the deliverable.
That is an explicit coverage gap, not a silent pass: grounded assertions introduced in M4
must convert these tasks to content-discriminating tasks before the v17 headline set.

| Anchor | Tasks | No answer key |
|---|---|---|
| harvey_lab | 2144 | 0 |
| workflow_research | 27 | 0 |
| graph-walk | 16 | 0 |
| biglaw_bench | 15 | 0 |
| legalbench | 14 | 0 |
| cuad | 10 | 0 |
| maud | 10 | 0 |
| legalagentbench | 8 | 0 |
| taxcalcbench | 7 | 0 |
| stanford_hai_hallucination | 7 | 0 |
| court_rules_calendaring | 6 | 0 |
| acord | 4 | 0 |
| lawflow | 3 | 0 |
| obliqa_regnlp | 3 | 0 |
| deposition_workflow | 2 | 0 |
| engagement_workflow | 2 | 0 |
| frcp_26a2_workflow | 2 | 0 |
| kyc_aml_workflow | 2 | 0 |
| settlement_workflow | 2 | 0 |
| annocaselaw_ildc | 1 | 0 |
| legalcitebench | 1 | 0 |
| closing_workflow | 1 | 0 |
| cmecf_workflow | 1 | 0 |
| legallens | 1 | 0 |

*Regenerate: serve world/blobfish/world-v18.json with `--v2-contracts mcp/v3/contracts`, then run*
*`python3 world/local/discriminate.py --report-only` and*
*`node world/expansion/discrimination-report.mjs`.*
