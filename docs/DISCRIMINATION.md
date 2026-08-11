# Discrimination audit — does each task reject wrong behavior?

The oracle proves a task is *satisfiable*: its reference walk executes and passes. That is
half of admission. A task that ALSO passes when the agent does nothing, reads without
writing, writes without reading, or writes the wrong value grades nothing — and measuring a
model on it spends money to learn noise.

`world/local/discriminate.py` drives four adversarial episodes per task against the live
world and records whether the verifier rejects each:

| Mode | What the fake agent does |
|---|---|
| `noop` | no calls at all |
| `text_only` | every read checkpoint, no writes — the deliverable-in-chat mode |
| `blind_write` | every write checkpoint, no reads — the shortcut mode |
| `wrong_value` | the full reference walk, terminal write payload corrupted (ids preserved) |

## Result over 274 tasks

| Verdict | Tasks | Meaning |
|---|---|---|
| discriminating | 155 | rejects all four |
| no-answer-key | 119 | rejects the three behavioral modes; has no pinned-value assertion, so a corrupted payload cannot be caught **by construction** |
| key-inconclusive | 0 | the corrupted write was rejected by the tool itself (enum/constraint), so the episode proves nothing about the key |
| **BROKEN-KEY** | 0 | claims an answer key, yet a corrupted write still passes — a defect |
| **BROKEN-GUARD** | 0 | accepts no-op, text-only or blind-write — a defect |

### What `no-answer-key` means for measurement

These tasks still grade real behavior — the workflow path, evidence-before-write, the
insertion, and the anti-hack guards all bind. What they do not grade is the CONTENT of the
deliverable. For a prose deliverable (a memo, a report) that is unavoidable: there is no
exact string to pin. For a determinate answer (a number, a status, an enum) it is a gap, and
the fix is to pin the value in the verifier rather than to drop the task.

| Anchor | Tasks | No answer key |
|---|---|---|
| harvey_lab | 156 | 116 |
| biglaw_bench | 15 | 0 |
| workflow_research | 15 | 2 |
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
| graph-walk | 1 | 1 |
| annocaselaw_ildc | 1 | 0 |
| legalcitebench | 1 | 0 |
| closing_workflow | 1 | 0 |
| cmecf_workflow | 1 | 0 |
| legallens | 1 | 0 |

*Regenerate: serve the world with `--v2-contracts mcp/v3/contracts`, then*
*`python3 world/local/discriminate.py && node world/expansion/discrimination-report.mjs`.*
