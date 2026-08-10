# CourtDock (SIMULATED litigation docketing/CMS) — mock API documentation

Cases, court filings, docket entries, hearings, courts, and computed deadlines — with audit trails and amount-history/evidence/remediation/review workflows per entity.

Served by `node mcp/serve-system.mjs --system litigation-docketing` (stdio MCP) over the world runtime
(`world/local/server.py`). Every call executes against a per-session SQLite copy of the
world database; task-aware sessions overlay the task's seed bundle. Deterministic friction
applies (3% injected rate_limited/stale_reference, 15% ambiguous write-acks, write cap).

## `litigation_cases_list`

List litigation case records with lifecycle filtering. (GET /api/v1/litigation_cases) Declared lifecycle: cases.status: Filed → Answered → Discovery → Trial Ready → Disposed. Use this to resolve a human name, title, external code, or other business handle to the exact cases primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `status` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_cases_list(db_path, ...)`

**SQL backing:** `cases` (24 rows) — SQLite, per-session copy.
**Executor:** `_entity_list (SELECT w/ status filter + preview clipping)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_cases_get`

Get one litigation case record by id. (GET /api/v1/litigation_cases/{id}). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with litigation_cases_list and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | string | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_cases_get(db_path, ...)`

**SQL backing:** `cases` (24 rows) — SQLite, per-session copy.
**Executor:** `_entity_get (SELECT by pk)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_cases_audit_list`

List the append-only audit history for litigation case. (GET /api/v1/litigation_cases/audit-events)

| Param | Type | Required |
|---|---|---|
| `litigation_cases_id` | string | no |
| `event_type` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_cases_audit_list(db_path, ...)`

**SQL backing:** `litigation_cases_audit_events` (9 rows) — SQLite, per-session copy.
**Executor:** `_audit_list (filtered SELECT)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_cases_amount_history_create`

Append a controlled claimed_amount change for litigation case. (POST /api/v1/litigation_cases/amount-history)

| Param | Type | Required |
|---|---|---|
| `litigation_cases_id` | string | yes |
| `claimed_amount` | number | yes |
| `changed_by_role` | string | yes |
| `change_reason` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_cases_amount_history_create(db_path, ...)`

**SQL backing:** `litigation_cases_amount_history` (8 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_cases_evidence_create`

Attach provenance-preserving evidence to a litigation case decision. (POST /api/v1/litigation_cases/evidence) Declared lifecycle: litigation_cases_evidence_records.status: collected → validated → retained.

| Param | Type | Required |
|---|---|---|
| `litigation_cases_id` | string | yes |
| `evidence_type` | string | yes |
| `source_uri` | string | yes |
| `content_digest` | string | yes |
| `owner_role` | string | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_cases_evidence_create(db_path, ...)`

**SQL backing:** `litigation_cases_evidence_records` (14 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_cases_remediation_create`

Create a tracked remediation plan for a litigation case exception. (POST /api/v1/litigation_cases/remediation) Declared lifecycle: litigation_cases_remediations.status: open → in_progress → completed.

| Param | Type | Required |
|---|---|---|
| `litigation_cases_id` | string | yes |
| `owner_role` | string | yes |
| `action_required` | string | yes |
| `due_at` | timestamp | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_cases_remediation_create(db_path, ...)`

**SQL backing:** `litigation_cases_remediations` (20 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_cases_review_create`

Record an independent review of a litigation case decision. (POST /api/v1/litigation_cases/review)

| Param | Type | Required |
|---|---|---|
| `litigation_cases_id` | string | yes |
| `reviewer_role` | string | yes |
| `outcome` | string | yes |
| `rationale` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_cases_review_create(db_path, ...)`

**SQL backing:** `litigation_cases_reviews` (19 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_filings_list`

List court filing records with lifecycle filtering. (GET /api/v1/litigation_filings) Declared lifecycle: court_filings.status: Drafted → Prepared → Attorney Review → Filed → Withdrawn. Use this to resolve a human name, title, external code, or other business handle to the exact court_filings primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `status` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_filings_list(db_path, ...)`

**SQL backing:** `court_filings` (17 rows) — SQLite, per-session copy.
**Executor:** `_entity_list (SELECT w/ status filter + preview clipping)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_filings_get`

Get one court filing record by id. (GET /api/v1/litigation_filings/{id}). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with litigation_filings_list and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | string | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_filings_get(db_path, ...)`

**SQL backing:** `court_filings` (17 rows) — SQLite, per-session copy.
**Executor:** `_entity_get (SELECT by pk)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_filings_audit_list`

List the append-only audit history for court filing. (GET /api/v1/litigation_filings/audit-events)

| Param | Type | Required |
|---|---|---|
| `litigation_filings_id` | string | no |
| `event_type` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_filings_audit_list(db_path, ...)`

**SQL backing:** `litigation_filings_audit_events` (15 rows) — SQLite, per-session copy.
**Executor:** `_audit_list (filtered SELECT)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_filings_amount_history_create`

Append a controlled filing_cost change for court filing. (POST /api/v1/litigation_filings/amount-history)

| Param | Type | Required |
|---|---|---|
| `litigation_filings_id` | string | yes |
| `filing_cost` | number | yes |
| `changed_by_role` | string | yes |
| `change_reason` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_filings_amount_history_create(db_path, ...)`

**SQL backing:** `litigation_filings_amount_history` (18 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_filings_evidence_create`

Attach provenance-preserving evidence to a court filing decision. (POST /api/v1/litigation_filings/evidence) Declared lifecycle: litigation_filings_evidence_records.status: collected → validated → retained.

| Param | Type | Required |
|---|---|---|
| `litigation_filings_id` | string | yes |
| `evidence_type` | string | yes |
| `source_uri` | string | yes |
| `content_digest` | string | yes |
| `owner_role` | string | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_filings_evidence_create(db_path, ...)`

**SQL backing:** `litigation_filings_evidence_records` (9 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_filings_remediation_create`

Create a tracked remediation plan for a court filing exception. (POST /api/v1/litigation_filings/remediation) Declared lifecycle: litigation_filings_remediations.status: open → in_progress → completed.

| Param | Type | Required |
|---|---|---|
| `litigation_filings_id` | string | yes |
| `owner_role` | string | yes |
| `action_required` | string | yes |
| `due_at` | timestamp | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_filings_remediation_create(db_path, ...)`

**SQL backing:** `litigation_filings_remediations` (9 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_filings_review_create`

Record an independent review of a court filing decision. (POST /api/v1/litigation_filings/review)

| Param | Type | Required |
|---|---|---|
| `litigation_filings_id` | string | yes |
| `reviewer_role` | string | yes |
| `outcome` | string | yes |
| `rationale` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_filings_review_create(db_path, ...)`

**SQL backing:** `litigation_filings_reviews` (19 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_dockets_list`

List litigation docket entry records with lifecycle filtering. (GET /api/v1/litigation_dockets) Declared lifecycle: docket_entries.status: Opened → Calendaring → Clerk Review → Active → Closed. Use this to resolve a human name, title, external code, or other business handle to the exact docket_entries primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `status` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_dockets_list(db_path, ...)`

**SQL backing:** `docket_entries` (14 rows) — SQLite, per-session copy.
**Executor:** `_entity_list (SELECT w/ status filter + preview clipping)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_dockets_get`

Get one litigation docket entry record by id. (GET /api/v1/litigation_dockets/{id}). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with litigation_dockets_list and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | string | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_dockets_get(db_path, ...)`

**SQL backing:** `docket_entries` (14 rows) — SQLite, per-session copy.
**Executor:** `_entity_get (SELECT by pk)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_dockets_audit_list`

List the append-only audit history for litigation docket entry. (GET /api/v1/litigation_dockets/audit-events)

| Param | Type | Required |
|---|---|---|
| `litigation_dockets_id` | string | no |
| `event_type` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_dockets_audit_list(db_path, ...)`

**SQL backing:** `litigation_dockets_audit_events` (15 rows) — SQLite, per-session copy.
**Executor:** `_audit_list (filtered SELECT)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_dockets_amount_history_create`

Append a controlled docket_exposure change for litigation docket entry. (POST /api/v1/litigation_dockets/amount-history)

| Param | Type | Required |
|---|---|---|
| `litigation_dockets_id` | string | yes |
| `docket_exposure` | number | yes |
| `changed_by_role` | string | yes |
| `change_reason` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_dockets_amount_history_create(db_path, ...)`

**SQL backing:** `litigation_dockets_amount_history` (16 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_dockets_evidence_create`

Attach provenance-preserving evidence to a litigation docket entry decision. (POST /api/v1/litigation_dockets/evidence) Declared lifecycle: litigation_dockets_evidence_records.status: collected → validated → retained.

| Param | Type | Required |
|---|---|---|
| `litigation_dockets_id` | string | yes |
| `evidence_type` | string | yes |
| `source_uri` | string | yes |
| `content_digest` | string | yes |
| `owner_role` | string | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_dockets_evidence_create(db_path, ...)`

**SQL backing:** `litigation_dockets_evidence_records` (14 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_dockets_remediation_create`

Create a tracked remediation plan for a litigation docket entry exception. (POST /api/v1/litigation_dockets/remediation) Declared lifecycle: litigation_dockets_remediations.status: open → in_progress → completed.

| Param | Type | Required |
|---|---|---|
| `litigation_dockets_id` | string | yes |
| `owner_role` | string | yes |
| `action_required` | string | yes |
| `due_at` | timestamp | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_dockets_remediation_create(db_path, ...)`

**SQL backing:** `litigation_dockets_remediations` (18 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_dockets_review_create`

Record an independent review of a litigation docket entry decision. (POST /api/v1/litigation_dockets/review)

| Param | Type | Required |
|---|---|---|
| `litigation_dockets_id` | string | yes |
| `reviewer_role` | string | yes |
| `outcome` | string | yes |
| `rationale` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_dockets_review_create(db_path, ...)`

**SQL backing:** `litigation_dockets_reviews` (19 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_hearings_list`

List court hearing records with lifecycle filtering. (GET /api/v1/litigation_hearings) Declared lifecycle: hearings.status: Scheduled → Preparing → Counsel Review → Held → Continued. Use this to resolve a human name, title, external code, or other business handle to the exact hearings primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `status` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_hearings_list(db_path, ...)`

**SQL backing:** `hearings` (13 rows) — SQLite, per-session copy.
**Executor:** `_entity_list (SELECT w/ status filter + preview clipping)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_hearings_get`

Get one court hearing record by id. (GET /api/v1/litigation_hearings/{id}). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with litigation_hearings_list and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | string | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_hearings_get(db_path, ...)`

**SQL backing:** `hearings` (13 rows) — SQLite, per-session copy.
**Executor:** `_entity_get (SELECT by pk)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_hearings_audit_list`

List the append-only audit history for court hearing. (GET /api/v1/litigation_hearings/audit-events)

| Param | Type | Required |
|---|---|---|
| `litigation_hearings_id` | string | no |
| `event_type` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_hearings_audit_list(db_path, ...)`

**SQL backing:** `litigation_hearings_audit_events` (17 rows) — SQLite, per-session copy.
**Executor:** `_audit_list (filtered SELECT)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_hearings_amount_history_create`

Append a controlled hearing_cost change for court hearing. (POST /api/v1/litigation_hearings/amount-history)

| Param | Type | Required |
|---|---|---|
| `litigation_hearings_id` | string | yes |
| `hearing_cost` | number | yes |
| `changed_by_role` | string | yes |
| `change_reason` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_hearings_amount_history_create(db_path, ...)`

**SQL backing:** `litigation_hearings_amount_history` (20 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_hearings_evidence_create`

Attach provenance-preserving evidence to a court hearing decision. (POST /api/v1/litigation_hearings/evidence) Declared lifecycle: litigation_hearings_evidence_records.status: collected → validated → retained.

| Param | Type | Required |
|---|---|---|
| `litigation_hearings_id` | string | yes |
| `evidence_type` | string | yes |
| `source_uri` | string | yes |
| `content_digest` | string | yes |
| `owner_role` | string | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_hearings_evidence_create(db_path, ...)`

**SQL backing:** `litigation_hearings_evidence_records` (14 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_hearings_remediation_create`

Create a tracked remediation plan for a court hearing exception. (POST /api/v1/litigation_hearings/remediation) Declared lifecycle: litigation_hearings_remediations.status: open → in_progress → completed.

| Param | Type | Required |
|---|---|---|
| `litigation_hearings_id` | string | yes |
| `owner_role` | string | yes |
| `action_required` | string | yes |
| `due_at` | timestamp | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_hearings_remediation_create(db_path, ...)`

**SQL backing:** `litigation_hearings_remediations` (14 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_hearings_review_create`

Record an independent review of a court hearing decision. (POST /api/v1/litigation_hearings/review)

| Param | Type | Required |
|---|---|---|
| `litigation_hearings_id` | string | yes |
| `reviewer_role` | string | yes |
| `outcome` | string | yes |
| `rationale` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_hearings_review_create(db_path, ...)`

**SQL backing:** `litigation_hearings_reviews` (18 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_courts_list`

List court assignment records with lifecycle filtering. (GET /api/v1/litigation_courts) Declared lifecycle: courts.status: Identified → Verified → Clerk Review → Assigned → Rejected. Use this to resolve a human name, title, external code, or other business handle to the exact courts primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `status` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_courts_list(db_path, ...)`

**SQL backing:** `courts` (20 rows) — SQLite, per-session copy.
**Executor:** `_entity_list (SELECT w/ status filter + preview clipping)`
**Anchoring:** external research: [LegalAgentBench is an open-source agent benchmark for legal, Chinese law, legal knowledge retrieval](https://github.com/CSHaitao/LegalAgentBench)

## `litigation_courts_get`

Get one court assignment record by id. (GET /api/v1/litigation_courts/{id}). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with litigation_courts_list and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | string | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_courts_get(db_path, ...)`

**SQL backing:** `courts` (20 rows) — SQLite, per-session copy.
**Executor:** `_entity_get (SELECT by pk)`
**Anchoring:** external research: [LegalAgentBench is an open-source agent benchmark for legal, Chinese law, legal knowledge retrieval](https://github.com/CSHaitao/LegalAgentBench)

## `litigation_courts_audit_list`

List the append-only audit history for court assignment. (GET /api/v1/litigation_courts/audit-events)

| Param | Type | Required |
|---|---|---|
| `litigation_courts_id` | string | no |
| `event_type` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_courts_audit_list(db_path, ...)`

**SQL backing:** `litigation_courts_audit_events` (13 rows) — SQLite, per-session copy.
**Executor:** `_audit_list (filtered SELECT)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_courts_amount_history_create`

Append a controlled filing_fee_budget change for court assignment. (POST /api/v1/litigation_courts/amount-history)

| Param | Type | Required |
|---|---|---|
| `litigation_courts_id` | string | yes |
| `filing_fee_budget` | number | yes |
| `changed_by_role` | string | yes |
| `change_reason` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_courts_amount_history_create(db_path, ...)`

**SQL backing:** `litigation_courts_amount_history` (13 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_courts_evidence_create`

Attach provenance-preserving evidence to a court assignment decision. (POST /api/v1/litigation_courts/evidence) Declared lifecycle: litigation_courts_evidence_records.status: collected → validated → retained.

| Param | Type | Required |
|---|---|---|
| `litigation_courts_id` | string | yes |
| `evidence_type` | string | yes |
| `source_uri` | string | yes |
| `content_digest` | string | yes |
| `owner_role` | string | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_courts_evidence_create(db_path, ...)`

**SQL backing:** `litigation_courts_evidence_records` (11 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_courts_remediation_create`

Create a tracked remediation plan for a court assignment exception. (POST /api/v1/litigation_courts/remediation) Declared lifecycle: litigation_courts_remediations.status: open → in_progress → completed.

| Param | Type | Required |
|---|---|---|
| `litigation_courts_id` | string | yes |
| `owner_role` | string | yes |
| `action_required` | string | yes |
| `due_at` | timestamp | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_courts_remediation_create(db_path, ...)`

**SQL backing:** `litigation_courts_remediations` (9 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_courts_review_create`

Record an independent review of a court assignment decision. (POST /api/v1/litigation_courts/review)

| Param | Type | Required |
|---|---|---|
| `litigation_courts_id` | string | yes |
| `reviewer_role` | string | yes |
| `outcome` | string | yes |
| `rationale` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_courts_review_create(db_path, ...)`

**SQL backing:** `litigation_courts_reviews` (20 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_deadlines_list`

List litigation deadline records with lifecycle filtering. (GET /api/v1/litigation_deadlines) Declared lifecycle: litigation_deadlines.status: Open → Monitoring → Escalation Review → Satisfied → Missed. Use this to resolve a human name, title, external code, or other business handle to the exact litigation_deadlines primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `status` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_deadlines_list(db_path, ...)`

**SQL backing:** `litigation_deadlines` (19 rows) — SQLite, per-session copy.
**Executor:** `_entity_list (SELECT w/ status filter + preview clipping)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_deadlines_get`

Get one litigation deadline record by id. (GET /api/v1/litigation_deadlines/{id}). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with litigation_deadlines_list and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | string | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_deadlines_get(db_path, ...)`

**SQL backing:** `litigation_deadlines` (19 rows) — SQLite, per-session copy.
**Executor:** `_entity_get (SELECT by pk)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_deadlines_audit_list`

List the append-only audit history for litigation deadline. (GET /api/v1/litigation_deadlines/audit-events)

| Param | Type | Required |
|---|---|---|
| `litigation_deadlines_id` | string | no |
| `event_type` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_deadlines_audit_list(db_path, ...)`

**SQL backing:** `litigation_deadlines_audit_events` (20 rows) — SQLite, per-session copy.
**Executor:** `_audit_list (filtered SELECT)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_deadlines_amount_history_create`

Append a controlled deadline_exposure change for litigation deadline. (POST /api/v1/litigation_deadlines/amount-history)

| Param | Type | Required |
|---|---|---|
| `litigation_deadlines_id` | string | yes |
| `deadline_exposure` | number | yes |
| `changed_by_role` | string | yes |
| `change_reason` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_deadlines_amount_history_create(db_path, ...)`

**SQL backing:** `litigation_deadlines_amount_history` (17 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_deadlines_evidence_create`

Attach provenance-preserving evidence to a litigation deadline decision. (POST /api/v1/litigation_deadlines/evidence) Declared lifecycle: litigation_deadlines_evidence_records.status: collected → validated → retained.

| Param | Type | Required |
|---|---|---|
| `litigation_deadlines_id` | string | yes |
| `evidence_type` | string | yes |
| `source_uri` | string | yes |
| `content_digest` | string | yes |
| `owner_role` | string | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_deadlines_evidence_create(db_path, ...)`

**SQL backing:** `litigation_deadlines_evidence_records` (14 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_deadlines_remediation_create`

Create a tracked remediation plan for a litigation deadline exception. (POST /api/v1/litigation_deadlines/remediation) Declared lifecycle: litigation_deadlines_remediations.status: open → in_progress → completed.

| Param | Type | Required |
|---|---|---|
| `litigation_deadlines_id` | string | yes |
| `owner_role` | string | yes |
| `action_required` | string | yes |
| `due_at` | timestamp | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_deadlines_remediation_create(db_path, ...)`

**SQL backing:** `litigation_deadlines_remediations` (16 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_deadlines_review_create`

Record an independent review of a litigation deadline decision. (POST /api/v1/litigation_deadlines/review)

| Param | Type | Required |
|---|---|---|
| `litigation_deadlines_id` | string | yes |
| `reviewer_role` | string | yes |
| `outcome` | string | yes |
| `rationale` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_deadlines_review_create(db_path, ...)`

**SQL backing:** `litigation_deadlines_reviews` (20 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

