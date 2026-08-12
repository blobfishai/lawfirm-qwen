# v16 boundary migration report

The canonical 21-task boundary set was re-run for three episodes on the v16
product-only surface. Historical and candidate episodes live in separate
directories. The local columns use the same `deepseek-chat` registry alias;
the original hosted proof is shown separately because it used
`deepseek-v4-flash`.

> Causal limit: The provider alias is not a pinned model digest, and the pre-v16 episode records do not carry a world version. The candidate run is v16, but tool surface and sampling date both changed, so class shifts are observations, not causal estimates.

## Summary

- Stable class: **16/21**
- Changed class: **5/21**
- Pre-v16 local: {"pass":15,"FLAKY":5,"fail":1}
- v16: {"pass":16,"FLAKY":4,"fail":1}

## Every task

| Task | Pre-v16 local | v16 | Original hosted proof | Observed evidence |
|---|---:|---:|---:|---|
| task_018 | 3/3 pass | 3/3 pass | 2/3 FLAKY | class stable |
| task_020 | 2/3 FLAKY | 3/3 pass | 2/3 FLAKY | more passes; mean calls +21 |
| task_022 | 3/3 pass | 3/3 pass | 2/3 FLAKY | class stable |
| task_031 | 3/3 pass | 3/3 pass | 2/3 FLAKY | class stable |
| task_043 | 3/3 pass | 2/3 FLAKY | 2/3 FLAKY | fewer passes; mean calls +11.4; leading v16 failure: required_documents_read |
| task_047 | 3/3 pass | 3/3 pass | 2/3 FLAKY | class stable |
| task_051 | 3/3 pass | 2/3 FLAKY | 2/3 FLAKY | fewer passes; mean calls +13.7; leading v16 failure: required_documents_read |
| task_052 | 3/3 pass | 3/3 pass | 2/3 FLAKY | class stable |
| task_086 | 0/3 fail | 0/3 fail | 2/3 FLAKY | class stable |
| task_095 | 2/3 FLAKY | 2/3 FLAKY | 1/3 FLAKY | class stable |
| task_098 | 2/3 FLAKY | 2/3 FLAKY | 2/3 FLAKY | class stable |
| task_099 | 3/3 pass | 3/3 pass | 1/3 FLAKY | class stable |
| task_101 | 3/3 pass | 3/3 pass | 2/3 FLAKY | class stable |
| task_104 | 3/3 pass | 3/3 pass | 2/3 FLAKY | class stable |
| task_112 | 3/3 pass | 3/3 pass | 1/3 FLAKY | class stable |
| task_126 | 2/3 FLAKY | 3/3 pass | 1/3 FLAKY | more passes; mean calls +7.3 |
| task_127 | 3/3 pass | 3/3 pass | 2/3 FLAKY | class stable |
| task_133 | 3/3 pass | 3/3 pass | 2/3 FLAKY | class stable |
| task_137 | 2/3 FLAKY | 3/3 pass | 2/3 FLAKY | more passes; mean calls +41.6 |
| task_144 | 3/3 pass | 3/3 pass | — | class stable |
| task_151 | 3/3 pass | 3/3 pass | — | class stable |

## Changed tasks

- **task_020:** FLAKY → pass; more passes; mean calls +21.
- **task_043:** pass → FLAKY; fewer passes; mean calls +11.4; leading v16 failure: required_documents_read.
- **task_051:** pass → FLAKY; fewer passes; mean calls +13.7; leading v16 failure: required_documents_read.
- **task_126:** FLAKY → pass; more passes; mean calls +7.3.
- **task_137:** FLAKY → pass; more passes; mean calls +41.6.

The machine-readable report preserves per-lane failure-condition counts, tool
sets, call averages, and measurement timestamps for every task.
