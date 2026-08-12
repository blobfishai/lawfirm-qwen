# Harvey LAB deterministic import — world-v17

This report is generated from the committed compiler artifact and world build report.
An LLM may propose text while authoring future manifests, but no LLM judges an episode:
only source-validated assertions, state transitions, traces, and file contracts affect the
deterministic score. Criteria that cannot be compiled are dropped and counted below.

## Acceptance summary

| Measure | Result |
|---|---:|
| LAB tasks hosted | 2,009 / 2,010 (99.95%) |
| Practice source tasks accounted for | 1,760 / 1,760 |
| Practice criteria determinized | 65,596 / 111,814 (58.7%) |
| Compiled assertions | 109,832 |
| Compiler headline-eligible practice sources | 1,760 / 1,760 |
| Runtime-hosted headline practice sources | 1,759 / 1,760 |
| Thin-grading tasks, hosted but headline-excluded | 0 |
| Quarantined practice tasks | 1 |

## Criteria coverage by family

| Family | Tasks | Determinate criteria | Total criteria | Coverage | Assertions |
|---|---:|---:|---:|---:|---:|
| contracts | 498 | 18,523 | 30,779 | 60.2% | 31,115 |
| standard | 1,262 | 47,073 | 81,035 | 58.1% | 78,717 |

## Criteria coverage by work type

| Work type | Tasks | Determinate criteria | Total criteria | Coverage |
|---|---:|---:|---:|---:|
| analyze | 488 | 16,083 | 27,623 | 58.2% |
| contracting | 498 | 18,523 | 30,779 | 60.2% |
| draft | 444 | 17,310 | 30,753 | 56.3% |
| research | 24 | 727 | 1,324 | 54.9% |
| review | 306 | 12,953 | 21,335 | 60.7% |

## Dropped criteria, by mechanical reason

| Reason | Criteria |
|---|---:|
| no mechanically typed or named PASS-clause anchor found in task evidence | 35,109 |
| unsupported range or comparison logic | 11,087 |
| compiled assertion failed local oracle/discrimination | 22 |

## Quarantine bank

Nothing is silently discarded. A quarantined source remains in the accounting manifest
and is excluded from hosted and headline scores.

| Source task | Reason | Detail |
|---|---|---|
| `contracts/commercial-vendor-customer/vendor-services-agreement-term-negotiation/scenario-03` | `missing_output_contract` | — |

## Interpretation and limits

- **Hosted is not the same as fully judged.** Thin tasks retain deterministic read → file →
  DMS-state contracts but are excluded from the headline determinate score.
- **Dropped prose is not guessed.** Style, persuasion, and open-ended synthesis criteria do
  not receive a score unless they can be converted into source-grounded mechanical checks.
- **Public-task contamination remains possible.** Verbatim LAB tasks are reported separately
  from future manifest-resampled variants.
- **The two delivery lanes never average together.** File-lane and system-of-record outcomes
  remain separate, with divergence exposed as `lane_split`.

Compiler: `7` · source index `821fa7920bef5ea1cb837e7c00a733d4b08e977416c8f5db60e1c66dda04ca2f` · output `99ec889a1c238d9d9ecdc3f3d487821e59009f161682e2c3c44d9177fa2c1715`

Regenerate with `python3 tools/report_lab_determinization.py`.
