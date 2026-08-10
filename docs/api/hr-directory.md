# StaffDesk (SIMULATED HR / staffing directory) — mock API documentation

Employees, departments, work assignments, and the org-records assistants.

Served by `node mcp/serve-system.mjs --system hr-directory` (stdio MCP) over the world runtime
(`world/local/server.py`). Every call executes against a per-session SQLite copy of the
world database; task-aware sessions overlay the task's seed bundle. Deterministic friction
applies (3% injected rate_limited/stale_reference, 15% ambiguous write-acks, write cap).

## `query_employees`

Query legal matter records with lifecycle filtering, returning matching rows for review, remediation, and engagement decisions. Use this to resolve a human name, title, external code, or other business handle to the exact employees primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | no |
| `casesid` | TEXT | no |
| `role` | TEXT | no |
| `email` | TEXT | no |
| `phone` | TEXT | no |
| `warehouse_id` | INTEGER | no |
| `hire_date` | TEXT | no |
| `active` | INTEGER | no |
| `certifications` | TEXT | no |
| `limit` | INTEGER | no |

**Input:** {"id":1,"casesid":"value","role":"value"}
**Output:** {"count": ..., "employees": [...]}
**Example:** `query_employees(id, casesid)`

**SQL backing:** `employees` (5 rows) — SQLite, per-session copy.
**Executor:** `_query (column filters; LIKE for text; long text → previews)`
**Anchoring:** *none — execution-tested only*

## `query_departments`

Query legal matter evidence records by evidence type, source URI, owner role, or status, returning matching rows for litigation matter evidence tracking. Use this to resolve a human name, title, external code, or other business handle to the exact departments primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | no |
| `department_code` | TEXT | no |
| `casesreviewer_role` | TEXT | no |
| `focus` | TEXT | no |
| `headcount` | INTEGER | no |
| `annual_budget` | REAL | no |
| `limit` | INTEGER | no |

**Input:** {"id":1,"department_code":"value","casesreviewer_role":"value"}
**Output:** {"count": ..., "departments": [...]}
**Example:** `query_departments(id, department_code)`

**SQL backing:** `departments` (5 rows) — SQLite, per-session copy.
**Executor:** `_query (column filters; LIKE for text; long text → previews)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `query_employee_work_assignments`

Search and filter employee_work_assignments. Returns matching rows. Declared lifecycle: employee_work_assignments.status: assigned → in_progress → (completed \| cancelled). Use this to resolve a human name, title, external code, or other business handle to the exact employee_work_assignments primary key required by item tools.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | no |
| `employee_id` | INTEGER | no |
| `reviewer_employee_id` | INTEGER | no |
| `department_id` | INTEGER | no |
| `service` | TEXT | no |
| `work_item_ref` | TEXT | no |
| `assignment_role` | TEXT | no |
| `status` | TEXT | no |
| `business_ref` | TEXT | no |
| `limit` | INTEGER | no |

**Input:** {"id":1,"employee_id":1,"reviewer_employee_id":1}
**Output:** {"count": ..., "employee_work_assignments": [...]}
**Example:** `query_employee_work_assignments(id, employee_id)`

**SQL backing:** `employee_work_assignments` (12 rows) — SQLite, per-session copy.
**Executor:** `_query (column filters; LIKE for text; long text → previews)`
**Anchoring:** *none — execution-tested only*

## `lookup_employee_work_assignment_with_employees`

Look up a legal matter evidence record with its parent legal matter data joined, supporting evidence lifecycle review in litigation workflows. The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with query_employee_work_assignments and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | no |

**Input:** {"id":1}
**Output:** {"count": ..., "employee_work_assignments": [...]}
**Example:** `lookup_employee_work_assignment_with_employees(id)`

**SQL backing:** `employee_work_assignments` (12 rows), `employees` (5 rows) — SQLite, per-session copy.
**Executor:** `_lookup_join (pk SELECT + FK join)`
**Anchoring:** *none — execution-tested only*

## `update_employee_work_assignments_status`

Update status of a employee work assignments record. Valid statuses: assigned, in_progress, completed, cancelled. Declared lifecycle: employee_work_assignments.status: assigned → in_progress → (completed \| cancelled). The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with query_employee_work_assignments and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | yes |
| `new_status` | TEXT | yes |

**Input:** {"id":1,"new_status":"value"}
**Output:** {"success": ..., "employee_work_assignments": [...]}
**Example:** `update_employee_work_assignments_status(id, new_status)`

**SQL backing:** `employee_work_assignments` (12 rows) — SQLite, per-session copy.
**Executor:** `_update (single-row UPDATE by pk)`
**Anchoring:** *none — execution-tested only*

## `update_employees_active`

Update the status of a legal matter record to reflect its current lifecycle stage (e.g., Engaged, Declined) based on review outcomes. The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with query_employees and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | yes |
| `active` | INTEGER | yes |

**Input:** {"id":1,"active":1}
**Output:** {"success": ..., "employees": [...]}
**Example:** `update_employees_active(id, active)`

**SQL backing:** `employees` (5 rows) — SQLite, per-session copy.
**Executor:** `_update (single-row UPDATE by pk)`
**Anchoring:** *none — execution-tested only*

## `update_departments_department_code`

Update the status of a conflict case record to reflect its current lifecycle stage (e.g., open, under review, resolved) in the law firm's conflict management workflow. The id argument is the exact opaque primary key, not a human name, title, external code, or numeric code suffix. When only a business handle is known, resolve it with query_departments and pass the returned id; when the exact id is already known, call this tool directly.

| Param | Type | Required |
|---|---|---|
| `id` | INTEGER | yes |
| `department_code` | TEXT | yes |

**Input:** {"id":1,"department_code":"value"}
**Output:** {"success": ..., "departments": [...]}
**Example:** `update_departments_department_code(id, department_code)`

**SQL backing:** `departments` (5 rows) — SQLite, per-session copy.
**Executor:** `_update (single-row UPDATE by pk)`
**Anchoring:** blobfish service-forge catalog (internal archetype schema `law_firm_core`)

## `organization_records_agent`

Delegate organization record lookup to Law Firm Company's read-only records sub-agent using a natural-language request. Prefer this over raw get/query tools when the user supplies a business handle. It resolves a unique business handle or exact readable attribute inside the tool, returns declared lifecycle order plus the next valid value, and rejects missing or ambiguous matches. Use only when the target appears in this owned table/handle scope: employee_work_assignments[work_item_ref\|business_ref]. Request grammar: in table <table>, find <business_field> "<value>" and return the complete record.

| Param | Type | Required |
|---|---|---|
| `request` | TEXT | no |

**Input:** {"request":"In table employee_work_assignments, find work_item_ref \"salesforce:work-item:0001\" and return the complete record. Resolve the unique business handle inside the records workflow without 
**Output:** {"status": "found", "business_handle": {...}, "record": {...}, "declared_lifecycles": {...}, "next_valid_values": {...}}
**Example:** `organization_records_agent(request="In table employee_work_assignments, find work_item_ref \"salesforce:work-item:0001\" and return the complete record. Resolve`

**SQL backing:** `employee_work_assignments` (12 rows) — SQLite, per-session copy.
**Executor:** `_records_agent (keyword scan across target tables, previews)`
**Anchoring:** *none — execution-tested only*

## `organization_workflow_agent`

Delegate organization record work to Law Firm Company's workflow sub-agent using a natural-language request. Prefer this over raw update tools when the user supplies a business handle. It resolves a unique business handle or exact non-lifecycle attribute inside the tool, applies one scoped update, returns the before/after record, and rejects missing, ambiguous, or out-of-lifecycle values. Use only when the target appears in this owned table/handle scope: employee_work_assignments[work_item_ref\|business_ref]. Request grammar: in table <table>, find <business_field> "<value>" and either set <field> to "<value>" or set <field> to the next declared lifecycle stage.

| Param | Type | Required |
|---|---|---|
| `request` | TEXT | yes |

**Input:** {"request":"In table employee_work_assignments, find work_item_ref \"salesforce:work-item:0001\" and set service to \"verified\". Resolve the business handle inside the delegated workflow and leave ev
**Output:** {"status": "updated", "business_handle": {...}, "before": ..., "after": ..., "record": {...}}
**Example:** `organization_workflow_agent(request="In table employee_work_assignments, find work_item_ref \"salesforce:work-item:0001\" and set service to \"verified\". Resol`

**SQL backing:** `employee_work_assignments` (12 rows) — SQLite, per-session copy.
**Executor:** `acknowledgment surface (no mutation)`
**Anchoring:** *none — execution-tested only*

