# Triage — new families measured on deepseek-chat

54 tasks · 162 episodes · $8.80

| Family | Tasks | Episodes passed | too-hard | **FLAKY** | too-easy |
|---|---|---|---|---|---|
| lab-employment-compensation-escalation | 4 | 6/12 (50) | 1 | **2** | 1 |
| posture-dependent-chronology | 4 | 10/12 (83) | 0 | **1** | 3 |
| hsr-merger-notification | 6 | 16/18 (89) | 0 | **2** | 4 |
| multi-hop-damages | 8 | 22/24 (92) | 0 | **2** | 6 |
| arbitration-clause-review | 6 | 17/18 (94) | 0 | **1** | 5 |
| bankruptcy-claim-classification | 8 | 23/24 (96) | 0 | **1** | 7 |
| banking-finance-covenants | 10 | 30/30 (100) | 0 | **0** | 10 |
| production-gap-disclosure | 3 | 9/9 (100) | 0 | **0** | 3 |
| ethical-wall-screening | 3 | 9/9 (100) | 0 | **0** | 3 |
| async-privilege-screen | 2 | 6/6 (100) | 0 | **0** | 2 |

## The flaky band — the boundary

| Task | Family | Passed | Avg calls | Failure conditions |
|---|---|---|---|---|
| task_309 | lab-employment-compensation-escalation | 1/3 | 29 | no_offtask_table_changes (2), no_undeclared_rows_created (2) |
| task_320 | posture-dependent-chronology | 1/3 | 9 | legal_matters_evidence_records_new_row_0_content_digest_is_EV-05 (2), no_new_legal_matters_evidence_records_row_with_content_digest_EV-03 (2) |
| task_271 | arbitration-clause-review | 2/3 | 21 | no_offtask_table_changes (1), no_undeclared_rows_created (1) |
| task_287 | bankruptcy-claim-classification | 2/3 | 14 | no_offtask_table_changes (1), no_undeclared_rows_created (1) |
| task_296 | hsr-merger-notification | 2/3 | 26 | no_offtask_table_changes (1), no_undeclared_rows_created (1) |
| task_297 | hsr-merger-notification | 2/3 | 28 | no_offtask_table_changes (1), no_undeclared_rows_created (1) |
| task_303 | multi-hop-damages | 2/3 | 17 | litigation_cases_amount_history_new_row_0_claimed_amount_is_6389216.44 (1) |
| task_306 | multi-hop-damages | 2/3 | 14 | litigation_cases_amount_history_new_row_0_claimed_amount_is_4156679.45 (1) |
| task_312 | lab-employment-compensation-escalation | 2/3 | 21 | no_offtask_table_changes (1), no_undeclared_rows_created (1) |

## Too hard (0/3) — keep, they still yield failure modes

| Task | Family | Avg calls | Failure conditions |
|---|---|---|---|
| task_310 | lab-employment-compensation-escalation | 67 | no_offtask_table_changes (3), no_undeclared_rows_created (3) |

## Too easy (3/3) — grow these

- `task_272` (arbitration-clause-review, 12 calls)
- `task_273` (arbitration-clause-review, 16 calls)
- `task_274` (arbitration-clause-review, 16 calls)
- `task_275` (arbitration-clause-review, 11 calls)
- `task_276` (arbitration-clause-review, 13 calls)
- `task_277` (banking-finance-covenants, 9 calls)
- `task_278` (banking-finance-covenants, 13 calls)
- `task_279` (banking-finance-covenants, 9 calls)
- `task_280` (banking-finance-covenants, 9 calls)
- `task_281` (banking-finance-covenants, 10 calls)
- `task_282` (banking-finance-covenants, 9 calls)
- `task_283` (banking-finance-covenants, 12 calls)
- `task_284` (banking-finance-covenants, 9 calls)
- `task_285` (banking-finance-covenants, 11 calls)
- `task_286` (banking-finance-covenants, 9 calls)
- `task_288` (bankruptcy-claim-classification, 10 calls)
- `task_289` (bankruptcy-claim-classification, 11 calls)
- `task_290` (bankruptcy-claim-classification, 13 calls)
- `task_291` (bankruptcy-claim-classification, 12 calls)
- `task_292` (bankruptcy-claim-classification, 12 calls)
- `task_293` (bankruptcy-claim-classification, 11 calls)
- `task_294` (bankruptcy-claim-classification, 15 calls)
- `task_295` (hsr-merger-notification, 24 calls)
- `task_298` (hsr-merger-notification, 23 calls)
- `task_299` (hsr-merger-notification, 20 calls)
- `task_300` (hsr-merger-notification, 23 calls)
- `task_301` (multi-hop-damages, 10 calls)
- `task_302` (multi-hop-damages, 19 calls)
- `task_304` (multi-hop-damages, 17 calls)
- `task_305` (multi-hop-damages, 18 calls)
- `task_307` (multi-hop-damages, 16 calls)
- `task_308` (multi-hop-damages, 13 calls)
- `task_311` (lab-employment-compensation-escalation, 23 calls)
- `task_313` (production-gap-disclosure, 15 calls)
- `task_314` (production-gap-disclosure, 10 calls)
- `task_315` (production-gap-disclosure, 13 calls)
- `task_316` (ethical-wall-screening, 14 calls)
- `task_317` (ethical-wall-screening, 13 calls)
- `task_318` (ethical-wall-screening, 8 calls)
- `task_319` (posture-dependent-chronology, 12 calls)
- `task_321` (posture-dependent-chronology, 7 calls)
- `task_322` (posture-dependent-chronology, 13 calls)
- `task_323` (async-privilege-screen, 14 calls)
- `task_324` (async-privilege-screen, 12 calls)

## Failure conditions across every miss

| Condition | Episodes |
|---|---|
| `no_offtask_table_changes` | 10 |
| `no_undeclared_rows_created` | 10 |
| `legal_matters_evidence_records_new_row_0_content_digest_is_EV-05` | 2 |
| `no_new_legal_matters_evidence_records_row_with_content_digest_EV-03` | 2 |
| `litigation_cases_amount_history_new_row_0_claimed_amount_is_6389216.44` | 1 |
| `litigation_cases_amount_history_new_row_0_claimed_amount_is_4156679.45` | 1 |
