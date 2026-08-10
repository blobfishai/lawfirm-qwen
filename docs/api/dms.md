# MatterVault DMS (SIMULATED document management; iManage-class) — mock API documentation

The matter document repository: search (previews), full-document reads, deliverable filing, and title maintenance.

Served by `node mcp/serve-system.mjs --system dms` (stdio MCP) over the world runtime
(`world/local/server.py`). Every call executes against a per-session SQLite copy of the
world database; task-aware sessions overlay the task's seed bundle. Deterministic friction
applies (3% injected rate_limited/stale_reference, 15% ambiguous write-acks, write cap).

## `query_matter_documents`

Queries legal_matters_evidence_records to retrieve evidence records linked to a specific legal matter, filtering by evidence type, source URI, content digest, owner role, or status, and returns matching rows for review and audit. Use this to resolve a human name, title, external code, or other business handle to the exact matter_documents primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | no |
| `title` | TEXT | no |
| `doc_type` | TEXT | no |
| `related_shape` | TEXT | no |
| `body` | TEXT | no |
| `limit` | INTEGER | no |

**Input:** {"id":1,"title":"value","doc_type":"value"}
**Output:** {"count": ..., "matter_documents": [...]}
**Example:** `query_matter_documents(id, title)`

**SQL backing:** `matter_documents` (211 rows) — SQLite, per-session copy.
**Executor:** `_query (column filters; LIKE for text; long text → previews)`
**Anchoring:** external research: [Harvey LABs is an open-source agent benchmark for legal, law firm operations](https://github.com/harveyai/harvey-labs)

## `read_matter_document`

Read one matter document in full, including its body

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | no |

**Input:** json
**Output:** json
**Example:** `{"id":1}`

**SQL backing:** `matter_documents` (211 rows) — SQLite, per-session copy.
**Executor:** `_read_record (full-body SELECT)`
**Anchoring:** external research: [Harvey LABs is an open-source agent benchmark for legal, law firm operations](https://github.com/harveyai/harvey-labs)

## `draft_matter_document`

Draft a new matter document deliverable (memo, analysis, markup response) with full body content

| Param | Type | Required |
|---|---|---|
| `title` | TEXT | yes |
| `doc_type` | TEXT | yes |
| `body` | TEXT | yes |

**Input:** json
**Output:** json
**Example:** `{"title":"antitrust-risk-memo.docx","doc_type":"memo","body":"MEMORANDUM..."}`

**SQL backing:** `matter_documents` (211 rows) — SQLite, per-session copy.
**Executor:** `_insert into matter_documents`
**Anchoring:** external research: [Harvey LABs is an open-source agent benchmark for legal, law firm operations](https://github.com/harveyai/harvey-labs)

## `update_matter_documents_title`

Update the title of a legal matter record in the Law Firm Operational Core Twin, reflecting the current matter name used in client conflict checks, billing logistics, and corporate practice group workflows. The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with query_matter_documents and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | yes |
| `title` | TEXT | yes |

**Input:** {"id":1,"title":"value"}
**Output:** {"success": ..., "matter_documents": [...]}
**Example:** `update_matter_documents_title(id, title)`

**SQL backing:** `matter_documents` (211 rows) — SQLite, per-session copy.
**Executor:** `_update (single-row UPDATE by pk)`
**Anchoring:** external research: [Harvey LABs is an open-source agent benchmark for legal, law firm operations](https://github.com/harveyai/harvey-labs)

