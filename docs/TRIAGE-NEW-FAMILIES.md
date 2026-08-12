# Triage — new families measured on deepseek-chat

56 tasks · 223 episodes · $18.74

| Family | Tasks | Episodes passed | too-hard | **FLAKY** | too-easy |
|---|---|---|---|---|---|
| lab-employment-compensation-escalation | 4 | 10/27 (37) | 0 | **3** | 1 |
| posture-dependent-chronology | 4 | 11/17 (65) | 0 | **1** | 3 |
| hsr-merger-notification | 6 | 27/28 (96) | 0 | **1** | 5 |
| bankruptcy-claim-classification | 8 | 28/29 (97) | 0 | **1** | 7 |
| arbitration-clause-review | 6 | 23/23 (100) | 0 | **0** | 6 |
| banking-finance-covenants | 10 | 30/30 (100) | 0 | **0** | 10 |
| multi-hop-damages | 8 | 34/34 (100) | 0 | **0** | 8 |
| production-gap-disclosure | 3 | 9/9 (100) | 0 | **0** | 3 |
| ethical-wall-screening | 3 | 9/9 (100) | 0 | **0** | 3 |
| async-privilege-screen | 2 | 6/6 (100) | 0 | **0** | 2 |
| covenant-portfolio-sweep | 2 | 11/11 (100) | 0 | **0** | 2 |

## The flaky band — the boundary

| Task | Family | Passed | Avg calls | Failure conditions |
|---|---|---|---|---|
| task_310 | lab-employment-compensation-escalation | 1/8 | 71 | no_offtask_table_changes (7), no_undeclared_rows_created (7), no_new_legal_matters_remediations_row_with_owner_role_board-secretary (1) |
| task_312 | lab-employment-compensation-escalation | 2/8 | 38 | no_offtask_table_changes (6), no_undeclared_rows_created (6) |
| task_320 | posture-dependent-chronology | 2/8 | 19 | legal_matters_evidence_records_new_row_0_content_digest_is_EV-05 (6) |
| task_309 | lab-employment-compensation-escalation | 4/8 | 39 | no_offtask_table_changes (4), no_undeclared_rows_created (4) |
| task_287 | bankruptcy-claim-classification | 7/8 | 16 | no_offtask_table_changes (1), no_undeclared_rows_created (1) |
| task_296 | hsr-merger-notification | 7/8 | 30 | no_offtask_table_changes (1), no_undeclared_rows_created (1) |

## Too hard (0/3) — keep, they still yield failure modes

*None.*

## Too easy (3/3) — grow these

- `task_271` (arbitration-clause-review, 20 calls)
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
- `task_297` (hsr-merger-notification, 28 calls)
- `task_298` (hsr-merger-notification, 23 calls)
- `task_299` (hsr-merger-notification, 20 calls)
- `task_300` (hsr-merger-notification, 23 calls)
- `task_301` (multi-hop-damages, 10 calls)
- `task_302` (multi-hop-damages, 19 calls)
- `task_303` (multi-hop-damages, 16 calls)
- `task_304` (multi-hop-damages, 17 calls)
- `task_305` (multi-hop-damages, 18 calls)
- `task_306` (multi-hop-damages, 21 calls)
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
- `task_325` (covenant-portfolio-sweep, 28 calls)
- `task_326` (covenant-portfolio-sweep, 28 calls)

## Failure conditions across every miss

| Condition | Episodes |
|---|---|
| `no_offtask_table_changes` | 19 |
| `no_undeclared_rows_created` | 19 |
| `legal_matters_evidence_records_new_row_0_content_digest_is_EV-05` | 6 |
| `no_new_legal_matters_remediations_row_with_owner_role_board-secretary` | 1 |
