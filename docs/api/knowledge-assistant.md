# Cortex Notes (SIMULATED knowledge/memory assistant) — mock API documentation

Firm memory, knowledge base, playbooks, and scheduled runs.

Served by `node mcp/serve-system.mjs --system knowledge-assistant` (stdio MCP) over the world runtime
(`world/local/server.py`). Every call executes against a per-session SQLite copy of the
world database; task-aware sessions overlay the task's seed bundle. Deterministic friction
applies (3% injected rate_limited/stale_reference, 15% ambiguous write-acks, write cap).

## `save_memory`

Save a durable memory entry the agent can rely on in later sessions.

| Param | Type | Required |
|---|---|---|
| `content` | TEXT | yes |

**Input:** {"content": "customer prefers chunked imports of 50 rows"}
**Output:** {"status": "saved", "id": ...}
**Example:** `save_memory(content="weekly import completed for Q3")`

**SQL backing:** `agent_memories` (2 rows) — SQLite, per-session copy.
**Executor:** `_insert / structured ack (see server.py dispatch)`
**Anchoring:** *none — execution-tested only*

## `search_memory`

Search or list durable memory entries before saving a new operating preference.

| Param | Type | Required |
|---|---|---|
| `query` | TEXT | no |
| `limit` | INTEGER | no |

**Input:** {"query": "ambiguous acknowledgment", "limit": 20}
**Output:** {"query": ..., "count": ..., "rows": [...]}
**Example:** `search_memory(query="ambiguous acknowledgment")`

**SQL backing:** `agent_memories` (2 rows) — SQLite, per-session copy.
**Executor:** `_search (LIKE across text columns)`
**Anchoring:** *none — execution-tested only*

## `add_to_knowledge`

Add an entry to the shared knowledge base.

| Param | Type | Required |
|---|---|---|
| `content` | TEXT | yes |
| `source` | TEXT | yes |

**Input:** {"content": "escalations route to the ops queue", "source": "runbook"}
**Output:** {"status": "saved", "id": ...}
**Example:** `add_to_knowledge(content="status flow: open -> in_review -> closed")`

**SQL backing:** `agent_knowledge` (2 rows) — SQLite, per-session copy.
**Executor:** `_insert / structured ack (see server.py dispatch)`
**Anchoring:** *none — execution-tested only*

## `search_knowledge`

Search or list shared knowledge by content or source before adding another entry.

| Param | Type | Required |
|---|---|---|
| `query` | TEXT | no |
| `limit` | INTEGER | no |

**Input:** {"query": "lifecycle", "limit": 20}
**Output:** {"query": ..., "count": ..., "rows": [...]}
**Example:** `search_knowledge(query="lifecycle")`

**SQL backing:** `agent_knowledge` (2 rows) — SQLite, per-session copy.
**Executor:** `_search (LIKE across text columns)`
**Anchoring:** *none — execution-tested only*

## `create_playbook`

Create a reusable automation playbook (named step list).

| Param | Type | Required |
|---|---|---|
| `name` | TEXT | yes |
| `steps` | TEXT | yes |

**Input:** {"name": "Weekly import", "steps": "1. read_file...\n2. sheet_agent..."}
**Output:** {"status": "saved", "id": ...}
**Example:** `create_playbook(name="Weekly import", steps="1. read_file\n2. delegate rows in chunks")`

**SQL backing:** `agent_playbooks` (2 rows) — SQLite, per-session copy.
**Executor:** `_insert / structured ack (see server.py dispatch)`
**Anchoring:** *none — execution-tested only*

## `list_playbooks`

List the saved automation playbooks.

| Param | Type | Required |
|---|---|---|
| `limit` | INTEGER | no |

**Input:** {"limit": 20}
**Output:** {"count": ..., "rows": [...]}
**Example:** `list_playbooks(limit=20)`

**SQL backing:** `agent_playbooks` (2 rows) — SQLite, per-session copy.
**Executor:** `_insert / structured ack (see server.py dispatch)`
**Anchoring:** *none — execution-tested only*

## `create_scheduled_run`

Schedule a recurring automation run (re-enters as a new task episode).

| Param | Type | Required |
|---|---|---|
| `name` | TEXT | yes |
| `schedule` | TEXT | yes |
| `playbook_name` | TEXT | yes |

**Input:** {"name": "Weekly import", "schedule": "every monday 09:00"}
**Output:** {"status": "saved", "id": ...}
**Example:** `create_scheduled_run(name="Weekly import", schedule="every monday 09:00")`

**SQL backing:** `agent_scheduled_runs` (2 rows) — SQLite, per-session copy.
**Executor:** `_insert / structured ack (see server.py dispatch)`
**Anchoring:** *none — execution-tested only*

## `list_scheduled_runs`

List the scheduled automation runs.

| Param | Type | Required |
|---|---|---|
| `limit` | INTEGER | no |

**Input:** {"limit": 20}
**Output:** {"count": ..., "rows": [...]}
**Example:** `list_scheduled_runs(limit=20)`

**SQL backing:** `agent_scheduled_runs` (2 rows) — SQLite, per-session copy.
**Executor:** `_insert / structured ack (see server.py dispatch)`
**Anchoring:** *none — execution-tested only*

