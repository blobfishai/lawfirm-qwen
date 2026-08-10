# LedgerBill (SIMULATED legal billing/e-billing) — mock API documentation

Invoice reviews, billing audit trail, invoice-amount workflows, and the raw invoices ledger.

Served by `node mcp/serve-system.mjs --system billing` (stdio MCP) over the world runtime
(`world/local/server.py`). Every call executes against a per-session SQLite copy of the
world database; task-aware sessions overlay the task's seed bundle. Deterministic friction
applies (3% injected rate_limited/stale_reference, 15% ambiguous write-acks, write cap).

## `legal_billing_list`

List legal invoice review records with lifecycle filtering. (GET /api/v1/legal_billing) Declared lifecycle: invoice_reviews.status: Received → Auditing → Billing Review → Released → Disputed. Use this to resolve a human name, title, external code, or other business handle to the exact invoice_reviews primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `status` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_billing_list(db_path, ...)`

**SQL backing:** `invoice_reviews` (13 rows) — SQLite, per-session copy.
**Executor:** `_entity_list (SELECT w/ status filter + preview clipping)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_billing_get`

Get one legal invoice review record by id. (GET /api/v1/legal_billing/{id}). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with legal_billing_list and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | string | no |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_billing_get(db_path, ...)`

**SQL backing:** `invoice_reviews` (13 rows) — SQLite, per-session copy.
**Executor:** `_entity_get (SELECT by pk)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_billing_audit_list`

List the append-only audit history for legal invoice review. (GET /api/v1/legal_billing/audit-events)

| Param | Type | Required |
|---|---|---|
| `legal_billing_id` | string | no |
| `event_type` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_billing_audit_list(db_path, ...)`

**SQL backing:** `legal_billing_audit_events` (19 rows) — SQLite, per-session copy.
**Executor:** `_audit_list (filtered SELECT)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_billing_amount_history_create`

Append a controlled invoice_amount change for legal invoice review. (POST /api/v1/legal_billing/amount-history)

| Param | Type | Required |
|---|---|---|
| `legal_billing_id` | string | yes |
| `invoice_amount` | number | yes |
| `changed_by_role` | string | yes |
| `change_reason` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_billing_amount_history_create(db_path, ...)`

**SQL backing:** `legal_billing_amount_history` (13 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_billing_evidence_create`

Attach provenance-preserving evidence to a legal invoice review decision. (POST /api/v1/legal_billing/evidence) Declared lifecycle: legal_billing_evidence_records.status: collected → validated → retained.

| Param | Type | Required |
|---|---|---|
| `legal_billing_id` | string | yes |
| `evidence_type` | string | yes |
| `source_uri` | string | yes |
| `content_digest` | string | yes |
| `owner_role` | string | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_billing_evidence_create(db_path, ...)`

**SQL backing:** `legal_billing_evidence_records` (19 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_billing_remediation_create`

Create a tracked remediation plan for a legal invoice review exception. (POST /api/v1/legal_billing/remediation) Declared lifecycle: legal_billing_remediations.status: open → in_progress → completed.

| Param | Type | Required |
|---|---|---|
| `legal_billing_id` | string | yes |
| `owner_role` | string | yes |
| `action_required` | string | yes |
| `due_at` | timestamp | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_billing_remediation_create(db_path, ...)`

**SQL backing:** `legal_billing_remediations` (11 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `legal_billing_review_create`

Record an independent review of a legal invoice review decision. (POST /api/v1/legal_billing/review)

| Param | Type | Required |
|---|---|---|
| `legal_billing_id` | string | yes |
| `reviewer_role` | string | yes |
| `outcome` | string | yes |
| `rationale` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `legal_billing_review_create(db_path, ...)`

**SQL backing:** `legal_billing_reviews` (16 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `query_invoices`

Search and filter invoices. Returns matching rows. Declared lifecycle: invoices.status: draft → sent → paid → overdue → cancelled. Use this to resolve a human name, title, external code, or other business handle to the exact invoices primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | no |
| `invoice_number` | TEXT | no |
| `po_id` | INTEGER | no |
| `customer_id` | INTEGER | no |
| `amount_cents` | INTEGER | no |
| `tax_cents` | INTEGER | no |
| `total_cents` | INTEGER | no |
| `status` | TEXT | no |
| `issued_at` | TEXT | no |
| `due_date` | TEXT | no |
| `paid_at` | TEXT | no |
| `invoice_reviewsid` | TEXT | no |
| `invoice_reviewstitle` | TEXT | no |
| `invoice_reviewsstatus` | TEXT | no |
| `invoice_reviewsdepartment` | TEXT | no |
| `invoice_reviewsowner_role` | TEXT | no |
| `invoice_reviewsreviewer_role` | TEXT | no |
| `invoice_reviewsinvoice_amount` | REAL | no |
| `invoice_reviewsevidence_summary` | TEXT | no |
| `invoice_reviewsdecision_reason` | TEXT | no |
| `limit` | INTEGER | no |

**Input:** {"id":1,"invoice_number":"value","po_id":1}
**Output:** {"count": ..., "invoices": [...]}
**Example:** `query_invoices(id, invoice_number)`

**SQL backing:** `invoices` (14 rows) — SQLite, per-session copy.
**Executor:** `_query (column filters; LIKE for text; long text → previews)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `update_invoices_status`

Update status of a invoices record. Valid statuses: draft, sent, paid, overdue, cancelled. Declared lifecycle: invoices.status: draft → sent → paid → overdue → cancelled. The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with query_invoices and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | yes |
| `new_status` | TEXT | yes |

**Input:** {"id":1,"new_status":"value"}
**Output:** {"success": ..., "invoices": [...]}
**Example:** `update_invoices_status(id, new_status)`

**SQL backing:** `invoices` (14 rows) — SQLite, per-session copy.
**Executor:** `_update (single-row UPDATE by pk)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

