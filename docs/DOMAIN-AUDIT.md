# Domain-Fidelity Audit — template leakage in the law-firm world

The same disease flagged in the studio's sales world (ERP/GitHub/PagerDuty tools in a
sales domain) checked against THIS world. Lint: `node world/expansion/domain-lint.mjs`
(word-boundary scan of tables, columns, sample values, tools, and task prompts against
an out-of-domain vocabulary for a law firm).

**Flagged: 2 tables · 7 tools · 0 task prompts · 7 tasks touching a leaked surface.**

| Asset | Kind | Foreign terms | Evidence |
|---|---|---|---|
| employees | table | warehouse | description ("…All warehouse and operations staff…") |
| invoices | table | shipment, po_id | description ("…Billing invoices generated after shipment…") |
| lookup_employee_work_assignment_with_employees | tool | targets-leaked-table | target_tables ("…employees…") |
| operations_records_agent | tool | targets-leaked-table | target_tables ("…employees,invoices…") |
| operations_workflow_agent | tool | targets-leaked-table | target_tables ("…employees,invoices…") |
| query_employees | tool | targets-leaked-table | target_tables ("…employees…") |
| query_invoices | tool | po_id | params ("…"id":"INTEGER","invoice_number":"TEXT","po_id":"INTEGER","customer_id":"INTEGER","amount_cents":"INT…") |
| update_employees_active | tool | targets-leaked-table | target_tables ("…employees…") |
| update_invoices_status | tool | targets-leaked-table | target_tables ("…invoices…") |

Affected tasks: task_016, task_075, task_076, task_085, task_086, task_095, task_096

## Handling (verifier-safe)

1. **No retroactive renames.** Re-skinning columns (warehouse_id → office_id) would break
   the shipped verifiers' state snapshots and invalidate 1,000+ measured traces. Renames
   belong to a world-v2 regeneration, not this dataset.
2. **Tagged, not hidden.** Leaked assets are recorded here and in `data/research/domain-lint.json`;
   `config.scoring.domainFidelity` lists the affected tasks so future runs can select
   `--tasks law-native` (scored minus leaked-surface tasks). Published aggregates were
   measured on the pre-audit scored set and are NOT retroactively rewritten — this is a
   disclosed measurement-set caveat, same policy as the task_016 quarantine.
3. **Forward fix by replacement.** The domain-correct law-firm billing/staffing surfaces
   (client trust ledger, time entries, LEDES/UTBMS billing, staffing without warehouses)
   are already-identified hostable gaps in `docs/COVERAGE.md` — new packs replace the
   template surfaces rather than patching them.
4. **Generation gate (playbook Stage 2/3).** Every table/column/tool must justify itself
   against the thesis at creation time; this lint runs in CI for every new world and the
   sales world inherits it with a sales-domain vocabulary.
