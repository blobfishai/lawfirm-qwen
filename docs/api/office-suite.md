# Fieldstone Workspace (SIMULATED office suite) — mock API documentation

Working documents, spreadsheets, calendar, and file shares — the firm's general-productivity layer, separate from the DMS of record.

Served by `node mcp/serve-system.mjs --system office-suite` (stdio MCP) over the world runtime
(`world/local/server.py`). Every call executes against a per-session SQLite copy of the
world database; task-aware sessions overlay the task's seed bundle. Deterministic friction
applies (3% injected rate_limited/stale_reference, 15% ambiguous write-acks, write cap).

## `document_agent`

Delegate document work to Law Firm Company's document sub-agent in free text. Supports: create doc "Title": <body> · append to "Title": <text> · read "Title".

| Param | Type | Required |
|---|---|---|
| `request` | TEXT | yes |

**Input:** {"request": "create doc \"Weekly summary\": totals by status"}
**Output:** {"status": ..., "doc": ...} (may be {"output": null} on ambiguous success)
**Example:** `document_agent(request="append to \"Weekly summary\": 12 records resolved")`

**SQL backing:** `agent_documents` (2 rows) — SQLite, per-session copy.
**Executor:** `_insert / structured ack (see server.py dispatch)`
**Anchoring:** *none — execution-tested only*

## `sheet_agent`

Delegate spreadsheet/records work to Law Firm Company's records sub-agent in free text. Supports: create sheet "Title" with columns: a, b · write rows to "Title": <inline TSV rows> · read "Title" or read <table_name> · update "Title" row N set col = value. Writes at most 50 rows per call and reports the unwritten remainder — send large imports in chunks and VERIFY the written count (acknowledgments can be empty even when the write applied).

| Param | Type | Required |
|---|---|---|
| `request` | TEXT | yes |

**Input:** {"request": "create sheet \"Q3 imports\" with columns: id, name, status"}
**Output:** {"status": ..., "rows_written": ..., "rows_remaining": ...} (may be {"output": null} on ambiguous success)
**Example:** `sheet_agent(request="write rows to \"Q3 imports\" (rows 1-50):\n1\tAcme\topen")`

**SQL backing:** `agent_sheet_rows` (0 rows), `agent_sheets` (0 rows) — SQLite, per-session copy.
**Executor:** `_insert / structured ack (see server.py dispatch)`
**Anchoring:** *none — execution-tested only*

## `calendar_agent`

Delegate scheduling to Law Firm Company's calendar sub-agent in free text. Supports: schedule "Title" on YYYY-MM-DD · read events.

| Param | Type | Required |
|---|---|---|
| `request` | TEXT | yes |

**Input:** {"request": "schedule \"Inventory review\" on 2026-08-14"}
**Output:** {"status": "scheduled", "event": ..., "event_date": ...}
**Example:** `calendar_agent(request="schedule \"Inventory review\" on 2026-08-14")`

**SQL backing:** `agent_events` (2 rows) — SQLite, per-session copy.
**Executor:** `_insert / structured ack (see server.py dispatch)`
**Anchoring:** *none — execution-tested only*

## `query_documents`

Search or list working documents by title or body before drafting or appending.

| Param | Type | Required |
|---|---|---|
| `query` | TEXT | no |
| `limit` | INTEGER | no |

**Input:** {"query": "exception handoff", "limit": 20}
**Output:** {"query": ..., "count": ..., "rows": [...]}
**Example:** `query_documents(query="exception handoff")`

**SQL backing:** `agent_documents` (2 rows) — SQLite, per-session copy.
**Executor:** `_query (column filters; LIKE for text; long text → previews)`
**Anchoring:** *none — execution-tested only*

## `query_calendar_events`

Search or list calendar events by title or date before scheduling another event.

| Param | Type | Required |
|---|---|---|
| `query` | TEXT | no |
| `limit` | INTEGER | no |

**Input:** {"query": "exception review", "limit": 20}
**Output:** {"query": ..., "count": ..., "rows": [...]}
**Example:** `query_calendar_events(query="exception review")`

**SQL backing:** `agent_events` (2 rows) — SQLite, per-session copy.
**Executor:** `_query (column filters; LIKE for text; long text → previews)`
**Anchoring:** *none — execution-tested only*

## `query_files`

Search or list the seeded file registry before reading one exact filename.

| Param | Type | Required |
|---|---|---|
| `query` | TEXT | no |
| `limit` | INTEGER | no |

**Input:** {"query": "orders", "limit": 20}
**Output:** {"query": ..., "count": ..., "rows": [{"filename": ..., "content_type": ...}]}
**Example:** `query_files(query="orders")`

**SQL backing:** `agent_files` (3 rows) — SQLite, per-session copy.
**Executor:** `_query (column filters; LIKE for text; long text → previews)`
**Anchoring:** *none — execution-tested only*

## `read_file`

Read a seeded document fixture (CSV/TSV export) by filename — the ingest side of file→records workflows.

| Param | Type | Required |
|---|---|---|
| `filename` | TEXT | no |

**Input:** {"filename": "orders_import.tsv"}
**Output:** {"filename": ..., "content": "<TSV>", "rows": [...]}
**Example:** `read_file(filename="orders_import.tsv")`

**SQL backing:** `agent_files` (3 rows) — SQLite, per-session copy.
**Executor:** `_read_file (SELECT by filename)`
**Anchoring:** *none — execution-tested only*

