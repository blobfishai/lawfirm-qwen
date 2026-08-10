# DiscoParse (SIMULATED e-discovery platform; Relativity-class) — mock API documentation

Discovery requests with audit trail and production-cost/evidence/remediation/review workflows.

Served by `node mcp/serve-system.mjs --system discovery-platform` (stdio MCP) over the world runtime
(`world/local/server.py`). Every call executes against a per-session SQLite copy of the
world database; task-aware sessions overlay the task's seed bundle. Deterministic friction
applies (3% injected rate_limited/stale_reference, 15% ambiguous write-acks, write cap).

## `litigation_discovery_list`

List discovery request records with lifecycle filtering. (GET /api/v1/litigation_discovery) Declared lifecycle: discovery_requests.status: Requested → Collecting → Privilege Review → Produced → Withheld. Use this to resolve a human name, title, external code, or other business handle to the exact discovery_requests primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `status` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_discovery_list(db_path, ...)`

**SQL backing:** `discovery_requests` (10 rows) — SQLite, per-session copy.
**Executor:** `_entity_list (SELECT w/ status filter + preview clipping)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_discovery_get`

Get one discovery request record by id. (GET /api/v1/litigation_discovery/{id}). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with litigation_discovery_list and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | string | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_discovery_get(db_path, ...)`

**SQL backing:** `discovery_requests` (10 rows) — SQLite, per-session copy.
**Executor:** `_entity_get (SELECT by pk)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_discovery_audit_list`

List the append-only audit history for discovery request. (GET /api/v1/litigation_discovery/audit-events)

| Param | Type | Required |
|---|---|---|
| `litigation_discovery_id` | string | no |
| `event_type` | string | no |
| `limit` | integer | no |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_discovery_audit_list(db_path, ...)`

**SQL backing:** `litigation_discovery_audit_events` (13 rows) — SQLite, per-session copy.
**Executor:** `_audit_list (filtered SELECT)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_discovery_amount_history_create`

Append a controlled production_cost change for discovery request. (POST /api/v1/litigation_discovery/amount-history)

| Param | Type | Required |
|---|---|---|
| `litigation_discovery_id` | string | yes |
| `production_cost` | number | yes |
| `changed_by_role` | string | yes |
| `change_reason` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_discovery_amount_history_create(db_path, ...)`

**SQL backing:** `litigation_discovery_amount_history` (14 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_discovery_evidence_create`

Attach provenance-preserving evidence to a discovery request decision. (POST /api/v1/litigation_discovery/evidence) Declared lifecycle: litigation_discovery_evidence_records.status: collected → validated → retained.

| Param | Type | Required |
|---|---|---|
| `litigation_discovery_id` | string | yes |
| `evidence_type` | string | yes |
| `source_uri` | string | yes |
| `content_digest` | string | yes |
| `owner_role` | string | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_discovery_evidence_create(db_path, ...)`

**SQL backing:** `litigation_discovery_evidence_records` (20 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_discovery_remediation_create`

Create a tracked remediation plan for a discovery request exception. (POST /api/v1/litigation_discovery/remediation) Declared lifecycle: litigation_discovery_remediations.status: open → in_progress → completed.

| Param | Type | Required |
|---|---|---|
| `litigation_discovery_id` | string | yes |
| `owner_role` | string | yes |
| `action_required` | string | yes |
| `due_at` | timestamp | yes |
| `status` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_discovery_remediation_create(db_path, ...)`

**SQL backing:** `litigation_discovery_remediations` (9 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `litigation_discovery_review_create`

Record an independent review of a discovery request decision. (POST /api/v1/litigation_discovery/review)

| Param | Type | Required |
|---|---|---|
| `litigation_discovery_id` | string | yes |
| `reviewer_role` | string | yes |
| `outcome` | string | yes |
| `rationale` | string | yes |

**Input:** kwargs
**Output:** json dict
**Example:** `litigation_discovery_review_create(db_path, ...)`

**SQL backing:** `litigation_discovery_reviews` (18 rows) — SQLite, per-session copy.
**Executor:** `_insert (id generation + created_at, required-arg enforcement)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

