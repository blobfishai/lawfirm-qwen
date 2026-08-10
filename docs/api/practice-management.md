# LexOperis PM (SIMULATED practice-management suite; Clio-class) — mock API documentation

Matter lifecycle and conflicts: matter records, conflict cases, their audit trails, and the amount-history/evidence/remediation/review workflows. Also the firm-ops assistants.

Served by `node mcp/serve-system.mjs --system practice-management` (stdio MCP) over the world runtime
(`world/local/server.py`). Every call executes against a per-session SQLite copy of the
world database; task-aware sessions overlay the task's seed bundle. Deterministic friction
applies (3% injected rate_limited/stale_reference, 15% ambiguous write-acks, write cap).

## `legal_matters_list`

List legal matter records with lifecycle filtering. (GET /api/v1/legal_matters) Declared lifecycle: matters.status: Intake → Active → Partner Review → Engaged → Declined. Use this to resolve a human name, title, external code, or other business handle to the exact matters primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `status` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_matters_list(db_path, ...)`

**SQL backing:** `matters` (28 rows) — SQLite, per-session copy.
**Executor:** `_entity_list (SELECT w/ status filter + preview clipping)`
**Anchoring:** external research: [offshoreproz/agent-company (smithery) exposes 11 tools relevant to eve litigation lawfirm like harvey corporate practice](https://smithery.ai/server/offshoreproz/agent-company); [mcp-dir/astrea-mcp (smithery) exposes 18 tools relevant to eve litigation lawfirm like harvey corporate practice groups ](https://smithery.ai/server/mcp-dir/astrea-mcp)

## `legal_matters_get`

Get one legal matter record by id. (GET /api/v1/legal_matters/{id}). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with legal_matters_list and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | string | no |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_matters_get(db_path, ...)`

**SQL backing:** `matters` (28 rows) — SQLite, per-session copy.
**Executor:** `_entity_get (SELECT by pk)`
**Anchoring:** external research: [offshoreproz/agent-company (smithery) exposes 11 tools relevant to eve litigation lawfirm like harvey corporate practice](https://smithery.ai/server/offshoreproz/agent-company); [mcp-dir/astrea-mcp (smithery) exposes 18 tools relevant to eve litigation lawfirm like harvey corporate practice groups ](https://smithery.ai/server/mcp-dir/astrea-mcp)

## `legal_matters_audit_list`

List the append-only audit history for legal matter. (GET /api/v1/legal_matters/audit-events)

| Param | Type | Required |
|---|---|---|
| `legal_matters_id` | string | no |
| `event_type` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_matters_audit_list(db_path, ...)`

**SQL backing:** `legal_matters_audit_events` (18 rows) — SQLite, per-session copy.
**Executor:** `_audit_list (filtered SELECT)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_matters_amount_history_create`

Append a controlled fee_budget change for legal matter. (POST /api/v1/legal_matters/amount-history)

| Param | Type | Required |
|---|---|---|
| `legal_matters_id` | string | yes |
| `fee_budget` | number | yes |
| `changed_by_role` | string | yes |
| `change_reason` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_matters_amount_history_create(db_path, ...)`

**SQL backing:** `legal_matters_amount_history` (15 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_matters_evidence_create`

Attach provenance-preserving evidence to a legal matter decision. (POST /api/v1/legal_matters/evidence) Declared lifecycle: legal_matters_evidence_records.status: collected → validated → retained.

| Param | Type | Required |
|---|---|---|
| `legal_matters_id` | string | yes |
| `evidence_type` | string | yes |
| `source_uri` | string | yes |
| `content_digest` | string | yes |
| `owner_role` | string | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_matters_evidence_create(db_path, ...)`

**SQL backing:** `legal_matters_evidence_records` (9 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_matters_remediation_create`

Create a tracked remediation plan for a legal matter exception. (POST /api/v1/legal_matters/remediation) Declared lifecycle: legal_matters_remediations.status: open → in_progress → completed.

| Param | Type | Required |
|---|---|---|
| `legal_matters_id` | string | yes |
| `owner_role` | string | yes |
| `action_required` | string | yes |
| `due_at` | timestamp | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_matters_remediation_create(db_path, ...)`

**SQL backing:** `legal_matters_remediations` (8 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_matters_review_create`

Record an independent review of a legal matter decision. (POST /api/v1/legal_matters/review)

| Param | Type | Required |
|---|---|---|
| `legal_matters_id` | string | yes |
| `reviewer_role` | string | yes |
| `outcome` | string | yes |
| `rationale` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_matters_review_create(db_path, ...)`

**SQL backing:** `legal_matters_reviews` (9 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_conflicts_list`

List conflict-of-interest review records with lifecycle filtering. (GET /api/v1/legal_conflicts) Declared lifecycle: conflict_cases.status: Screening → Investigating → Risk Review → Cleared → Blocked. Use this to resolve a human name, title, external code, or other business handle to the exact conflict_cases primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `status` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_conflicts_list(db_path, ...)`

**SQL backing:** `conflict_cases` (13 rows) — SQLite, per-session copy.
**Executor:** `_entity_list (SELECT w/ status filter + preview clipping)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_conflicts_get`

Get one conflict-of-interest review record by id. (GET /api/v1/legal_conflicts/{id}). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with legal_conflicts_list and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | string | no |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_conflicts_get(db_path, ...)`

**SQL backing:** `conflict_cases` (13 rows) — SQLite, per-session copy.
**Executor:** `_entity_get (SELECT by pk)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_conflicts_audit_list`

List the append-only audit history for conflict-of-interest review. (GET /api/v1/legal_conflicts/audit-events)

| Param | Type | Required |
|---|---|---|
| `legal_conflicts_id` | string | no |
| `event_type` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_conflicts_audit_list(db_path, ...)`

**SQL backing:** `legal_conflicts_audit_events` (17 rows) — SQLite, per-session copy.
**Executor:** `_audit_list (filtered SELECT)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_conflicts_amount_history_create`

Append a controlled exposure_amount change for conflict-of-interest review. (POST /api/v1/legal_conflicts/amount-history)

| Param | Type | Required |
|---|---|---|
| `legal_conflicts_id` | string | yes |
| `exposure_amount` | number | yes |
| `changed_by_role` | string | yes |
| `change_reason` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_conflicts_amount_history_create(db_path, ...)`

**SQL backing:** `legal_conflicts_amount_history` (14 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_conflicts_evidence_create`

Attach provenance-preserving evidence to a conflict-of-interest review decision. (POST /api/v1/legal_conflicts/evidence) Declared lifecycle: legal_conflicts_evidence_records.status: collected → validated → retained.

| Param | Type | Required |
|---|---|---|
| `legal_conflicts_id` | string | yes |
| `evidence_type` | string | yes |
| `source_uri` | string | yes |
| `content_digest` | string | yes |
| `owner_role` | string | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_conflicts_evidence_create(db_path, ...)`

**SQL backing:** `legal_conflicts_evidence_records` (12 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_conflicts_remediation_create`

Create a tracked remediation plan for a conflict-of-interest review exception. (POST /api/v1/legal_conflicts/remediation) Declared lifecycle: legal_conflicts_remediations.status: open → in_progress → completed.

| Param | Type | Required |
|---|---|---|
| `legal_conflicts_id` | string | yes |
| `owner_role` | string | yes |
| `action_required` | string | yes |
| `due_at` | timestamp | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_conflicts_remediation_create(db_path, ...)`

**SQL backing:** `legal_conflicts_remediations` (15 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_conflicts_review_create`

Record an independent review of a conflict-of-interest review decision. (POST /api/v1/legal_conflicts/review)

| Param | Type | Required |
|---|---|---|
| `legal_conflicts_id` | string | yes |
| `reviewer_role` | string | yes |
| `outcome` | string | yes |
| `rationale` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_conflicts_review_create(db_path, ...)`

**SQL backing:** `legal_conflicts_reviews` (8 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `operations_records_agent`

Delegate operations record lookup to Law Firm Company's read-only records sub-agent using a natural-language request. Prefer this over raw get/query tools when the user supplies a business handle. It resolves a unique business handle or exact readable attribute inside the tool, returns declared lifecycle order plus the next valid value, and rejects missing or ambiguous matches. Use only when the target appears in this owned table/handle scope: cases[id\|title], conflict_cases[id\|title], court_filings[id\|title], courts[id\|title], departments[department_code], discovery_requests[id\|title], docket_entries[id\|title], employees[email], hearings[id\|title], invoice_reviews[id\|title], invoices[invoice_number], legal_billing_amount_history[id], legal_billing_audit_events[id], legal_billing_evidence_records[id\|source_uri], legal_billing_remediations[id], legal_billing_reviews[id], legal_conflicts_amount_history[id], legal_conflicts_audit_events[id], legal_conflicts_evidence_records[id\|source_uri], legal_conflicts_remediations[id], legal_conflicts_reviews[id], legal_matters_amount_history[id], legal_matters_audit_events[id], legal_matters_evidence_records[id\|source_uri], legal_matters_remediations[id], legal_matters_reviews[id], litigation_cases_amount_history[id], litigation_cases_audit_events[id], litigation_cases_evidence_records[id\|source_uri], litigation_cases_remediations[id], litigation_cases_reviews[id], litigation_courts_amount_history[id], litigation_courts_audit_events[id], litigation_courts_evidence_records[id\|source_uri], litigation_courts_remediations[id], litigation_courts_reviews[id], litigation_deadlines[id\|title], litigation_deadlines_amount_history[id], litigation_deadlines_audit_events[id], litigation_deadlines_evidence_records[id\|source_uri], litigation_deadlines_remediations[id], litigation_deadlines_reviews[id], litigation_discovery_amount_history[id], litigation_discovery_audit_events[id], litigation_discovery_evidence_records[id\|source_uri], litigation_discovery_remediations[id], litigation_discovery_reviews[id], litigation_dockets_amount_history[id], litigation_dockets_audit_events[id], litigation_dockets_evidence_records[id\|source_uri], litigation_dockets_remediations[id], litigation_dockets_reviews[id], litigation_filings_amount_history[id], litigation_filings_audit_events[id], litigation_filings_evidence_records[id\|source_uri], litigation_filings_remediations[id], litigation_filings_reviews[id], litigation_hearings_amount_history[id], litigation_hearings_audit_events[id], litigation_hearings_evidence_records[id\|source_uri], litigation_hearings_remediations[id], litigation_hearings_reviews[id], matter_documents[title], matters[id\|title]. Request grammar: in table <table>, find <business_field> "<value>" and return the complete record.

| Param | Type | Required |
|---|---|---|
| `request` | TEXT | no |

**Input:** {"request":"In table invoices, find invoice_number \"INV-0DVGAPK\" and return the complete record. Resolve the unique business handle inside the records workflow without using a numeric SQLite row id.
**Output:** {"status": "found", "business_handle": {...}, "record": {...}, "declared_lifecycles": {...}, "next_valid_values": {...}}
**Example:** `operations_records_agent(request="In table invoices, find invoice_number \"INV-0DVGAPK\" and return the complete record. Resolve the unique business handle insi`

**SQL backing:** `cases` (24 rows), `conflict_cases` (13 rows), `court_filings` (17 rows), `courts` (20 rows) +60 more — SQLite, per-session copy.
**Executor:** `_records_agent (keyword scan across target tables, previews)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `operations_workflow_agent`

Delegate operations record work to Law Firm Company's workflow sub-agent using a natural-language request. Prefer this over raw update tools when the user supplies a business handle. It resolves a unique business handle or exact non-lifecycle attribute inside the tool, applies one scoped update, returns the before/after record, and rejects missing, ambiguous, or out-of-lifecycle values. Use only when the target appears in this owned table/handle scope: cases[id\|title], conflict_cases[id\|title], court_filings[id\|title], courts[id\|title], departments[department_code], discovery_requests[id\|title], docket_entries[id\|title], employees[email], hearings[id\|title], invoice_reviews[id\|title], invoices[invoice_number], legal_billing_amount_history[id], legal_billing_audit_events[id], legal_billing_evidence_records[id\|source_uri], legal_billing_remediations[id], legal_billing_reviews[id], legal_conflicts_amount_history[id], legal_conflicts_audit_events[id], legal_conflicts_evidence_records[id\|source_uri], legal_conflicts_remediations[id], legal_conflicts_reviews[id], legal_matters_amount_history[id], legal_matters_audit_events[id], legal_matters_evidence_records[id\|source_uri], legal_matters_remediations[id], legal_matters_reviews[id], litigation_cases_amount_history[id], litigation_cases_audit_events[id], litigation_cases_evidence_records[id\|source_uri], litigation_cases_remediations[id], litigation_cases_reviews[id], litigation_courts_amount_history[id], litigation_courts_audit_events[id], litigation_courts_evidence_records[id\|source_uri], litigation_courts_remediations[id], litigation_courts_reviews[id], litigation_deadlines[id\|title], litigation_deadlines_amount_history[id], litigation_deadlines_audit_events[id], litigation_deadlines_evidence_records[id\|source_uri], litigation_deadlines_remediations[id], litigation_deadlines_reviews[id], litigation_discovery_amount_history[id], litigation_discovery_audit_events[id], litigation_discovery_evidence_records[id\|source_uri], litigation_discovery_remediations[id], litigation_discovery_reviews[id], litigation_dockets_amount_history[id], litigation_dockets_audit_events[id], litigation_dockets_evidence_records[id\|source_uri], litigation_dockets_remediations[id], litigation_dockets_reviews[id], litigation_filings_amount_history[id], litigation_filings_audit_events[id], litigation_filings_evidence_records[id\|source_uri], litigation_filings_remediations[id], litigation_filings_reviews[id], litigation_hearings_amount_history[id], litigation_hearings_audit_events[id], litigation_hearings_evidence_records[id\|source_uri], litigation_hearings_remediations[id], litigation_hearings_reviews[id], matter_documents[title], matters[id\|title]. Request grammar: in table <table>, find <business_field> "<value>" and either set <field> to "<value>" or set <field> to the next declared lifecycle stage.

| Param | Type | Required |
|---|---|---|
| `request` | TEXT | yes |

**Input:** {"request":"In table invoices, find invoice_number \"INV-0DVGAPK\" and set invoice_number to \"verified\". Resolve the business handle inside the delegated workflow and leave every other record unchan
**Output:** {"status": "updated", "business_handle": {...}, "before": ..., "after": ..., "record": {...}}
**Example:** `operations_workflow_agent(request="In table invoices, find invoice_number \"INV-0DVGAPK\" and set invoice_number to \"verified\". Resolve the business handle in`

**SQL backing:** `cases` (24 rows), `conflict_cases` (13 rows), `court_filings` (17 rows), `courts` (20 rows) +60 more — SQLite, per-session copy.
**Executor:** `acknowledgment surface (no mutation)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

