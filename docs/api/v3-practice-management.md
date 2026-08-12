# LexOperis PM (SIMULATED) — API surface mirrors Clio Manage API v4

**Dialect:** `clio` · **Provenance:** https://docs.developers.clio.com/api-reference/ (resource groups: Matters, Contacts, Activities, Bills, Calendar entries, Tasks, Notes, Communications, Trust, Users, Practice areas)

**Response envelopes** (what every tool of this product returns):

| Op | Envelope |
|---|---|
| list/search | `{"data": [...], "meta": {"paging": {}, "records": N}}` |
| get | `{"data": {...}}` |
| create/update | `{"data": {...}}` |

**Tables (SQLite):** `pm_users`, `pm_practice_areas`, `pm_contacts`, `pm_matters`, `pm_time_entries`, `pm_expense_entries`, `pm_bills`, `pm_bill_line_items`, `pm_trust_transactions`, `pm_calendar_entries`, `pm_tasks`, `pm_notes`, `pm_communications`, `pm_audit_events`

## `matters_list`

*Mirrors:* GET /api/v4/matters.json — https://docs.developers.clio.com/api-reference/#tag/Matters

List matters with filters (status, client, responsible attorney, practice area).

**Who uses it & why:** A supervising partner reviews all open matters in her practice area before Monday staffing.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `status` | string | no | same |
| `client_id` | integer | no | same |
| `responsible_attorney_id` | integer | no | same |
| `practice_area_id` | integer | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_matters`

## `matters_get`

*Mirrors:* GET /api/v4/matters/{id}.json

Fetch one matter by id.

**Who uses it & why:** An associate pulls the matter record to confirm billing method and responsible attorney before recording time.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Op:** `get` on `pm_matters`

## `matters_create`

*Mirrors:* POST /api/v4/matters.json

Open a new matter.

**Who uses it & why:** Intake coordinator opens a new matter after the engagement letter is signed and conflicts cleared.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `create` on `pm_matters`

## `matters_update`

*Mirrors:* PATCH /api/v4/matters/{id}.json

Update matter fields (status transitions, staffing, description).

**Who uses it & why:** The responsible partner closes a settled matter and hands staffing to a new associate.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `body` | object | no | same |

**Op:** `update` on `pm_matters`

## `matters_search`

*Mirrors:* GET /api/v4/matters.json?query=

Free-text search over matter number, name, description.

**Who uses it & why:** A paralegal finds the right matter from a client's email that only mentions the deal name.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `query` | string | no | same |
| `limit` | integer | no | same |

**Op:** `search` on `pm_matters`

## `contacts_list`

*Mirrors:* GET /api/v4/contacts.json — #tag/Contacts

List contacts (people and companies) with filters.

**Who uses it & why:** The billing clerk lists client companies to reconcile month-end statements.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `type` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_contacts`

## `contacts_get`

*Mirrors:* GET /api/v4/contacts/{id}.json

Fetch one contact.

**Who uses it & why:** An associate confirms the GC's email before sending the draft.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Op:** `get` on `pm_contacts`

## `contacts_create`

*Mirrors:* POST /api/v4/contacts.json

Create a person or company contact.

**Who uses it & why:** Intake adds the new client company and its GC after the pitch converts.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `create` on `pm_contacts`

## `contacts_update`

*Mirrors:* PATCH /api/v4/contacts/{id}.json

Update contact fields.

**Who uses it & why:** A secretary updates a contact's phone and title after a client-side promotion.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `body` | object | no | same |

**Op:** `update` on `pm_contacts`

## `contacts_search`

*Mirrors:* GET /api/v4/contacts.json?query=

Free-text contact search (name, email, company).

**Who uses it & why:** Conflicts analyst searches every contact matching the adverse party's name.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `query` | string | no | same |
| `limit` | integer | no | same |

**Op:** `search` on `pm_contacts`

## `time_entries_list`

*Mirrors:* GET /api/v4/activities.json?type=TimeEntry — #tag/Activities

List time entries with filters (matter, user, date range, billed state).

**Who uses it & why:** The billing partner pulls a matter's unbilled time before generating the prebill.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `user_id` | integer | no | same |
| `start_date` | string | no | `date_from` |
| `end_date` | string | no | `date_to` |
| `status` | string | no | same |
| `type` | string | no | same |
| `query` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_time_entries`

## `time_entries_get`

*Mirrors:* GET /api/v4/activities/{id}.json

Fetch one time entry.

**Who uses it & why:** A billing clerk inspects one contested entry from the client's audit letter.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Op:** `get` on `pm_time_entries`

## `time_entries_create`

*Mirrors:* POST /api/v4/activities.json (TimeEntry)

Record billable/non-billable time against a matter with a UTBMS task code.

**Who uses it & why:** An associate records 2.5 hours drafting the dispositive motion with task code L240.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `create` on `pm_time_entries` · computed: total

## `time_entries_update`

*Mirrors:* PATCH /api/v4/activities/{id}.json

Correct a time entry (narrative, hours, code) before billing.

**Who uses it & why:** The billing partner rewrites a vague narrative and fixes the task code before the bill goes out.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `body` | object | no | same |

**Op:** `update` on `pm_time_entries` · computed: total

## `expense_entries_list`

*Mirrors:* GET /api/v4/activities.json?type=ExpenseEntry

List expense entries with filters.

**Who uses it & why:** Accounting reviews court-fee expenses across matters for the quarterly true-up.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `user_id` | integer | no | same |
| `start_date` | string | no | `date_from` |
| `end_date` | string | no | `date_to` |
| `status` | string | no | same |
| `type` | string | no | same |
| `query` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_expense_entries`

## `expense_entries_create`

*Mirrors:* POST /api/v4/activities.json (ExpenseEntry)

Record a matter expense with a UTBMS expense code.

**Who uses it & why:** A paralegal records the filing fee paid to the clerk this morning.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `create` on `pm_expense_entries`

## `bills_list`

*Mirrors:* GET /api/v4/bills.json — #tag/Bills

List bills with filters (state, matter, client).

**Who uses it & why:** The finance manager lists every bill awaiting approval before the partner meeting.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `state` | string | no | same |
| `matter_id` | integer | no | same |
| `client_id` | integer | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_bills`

## `bills_get`

*Mirrors:* GET /api/v4/bills/{id}.json

Fetch one bill with totals and state.

**Who uses it & why:** A partner opens one bill to check balance and due date before calling the client.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Op:** `get` on `pm_bills`

## `bills_update`

*Mirrors:* PATCH /api/v4/bills/{id}.json

Move a bill through its lifecycle (draft → awaiting_approval → approved → issued → paid | void) or adjust dates/balance.

**Who uses it & why:** After partner sign-off, the clerk moves the bill from awaiting_approval to issued.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `body` | object | no | same |

**Op:** `update` on `pm_bills`

## `bill_line_items_list`

*Mirrors:* GET /api/v4/line_items.json?bill_id=

List a bill's line items.

**Who uses it & why:** The client questioned the invoice; the clerk lists its line items to answer.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `bill_id` | integer | no | same |
| `kind` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_bill_line_items`

## `trust_transactions_list`

*Mirrors:* Clio trust accounting (allocations/trust line items) — #tag/Allocations

List client trust ledger transactions (deposits, disbursements, earned-fee transfers).

**Who uses it & why:** The trust accountant pulls the matter's ledger for the monthly three-way reconciliation.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `contact_id` | integer | no | `client_id` |
| `kind` | string | no | same |
| `status` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_trust_transactions`

## `calendar_entries_list`

*Mirrors:* GET /api/v4/calendar_entries.json — #tag/Calendar-entries

List calendar entries (hearings, depositions, deadlines) with filters and date range.

**Who uses it & why:** The docketing clerk reviews next week's hearings across all matters every Friday.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `from` | string | no | `start_from` |
| `to` | string | no | `start_to` |
| `query` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_calendar_entries`

## `calendar_entries_create`

*Mirrors:* POST /api/v4/calendar_entries.json

Create a calendar entry for a matter.

**Who uses it & why:** An associate calendars the deposition the parties just agreed to.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `create` on `pm_calendar_entries`

## `calendar_entries_update`

*Mirrors:* PATCH /api/v4/calendar_entries/{id}.json

Reschedule or edit a calendar entry.

**Who uses it & why:** Court moved the status conference; the clerk reschedules the entry.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `body` | object | no | same |

**Op:** `update` on `pm_calendar_entries`

## `tasks_list`

*Mirrors:* GET /api/v4/tasks.json — #tag/Tasks

List matter tasks with filters.

**Who uses it & why:** A supervising attorney checks which of her associates' tasks are overdue.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `assignee_id` | integer | no | `assignee_user_id` |
| `status` | string | no | same |
| `priority` | string | no | same |
| `query` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_tasks`

## `tasks_create`

*Mirrors:* POST /api/v4/tasks.json

Assign a task on a matter.

**Who uses it & why:** The partner assigns 'draft privilege log' to the second-year with a Friday due date.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `create` on `pm_tasks`

## `tasks_update`

*Mirrors:* PATCH /api/v4/tasks/{id}.json

Progress or complete a task.

**Who uses it & why:** The associate marks the cite-check complete before leaving.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `body` | object | no | same |

**Op:** `update` on `pm_tasks`

## `notes_list`

*Mirrors:* GET /api/v4/notes.json — #tag/Notes

List matter notes.

**Who uses it & why:** New counsel reads the matter's notes to get up to speed after the handoff.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `type` | string | no | same |
| `matter_id` | integer | no | same |
| `query` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_notes`

## `notes_create`

*Mirrors:* POST /api/v4/notes.json

Attach a note to a matter.

**Who uses it & why:** After the client call, the partner writes the strategy note into the matter.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `create` on `pm_notes`

## `communications_list`

*Mirrors:* GET /api/v4/communications.json — #tag/Communications

List logged emails/calls on a matter.

**Who uses it & why:** Preparing for the deposition, the team lists all logged calls with the witness.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `type` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_communications`

## `communications_create`

*Mirrors:* POST /api/v4/communications.json

Log an email or call against a matter.

**Who uses it & why:** The secretary logs today's client call with a summary against the matter.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `create` on `pm_communications`

## `users_list`

*Mirrors:* GET /api/v4/users.json — #tag/Users

List firm users (attorneys, staff) and rates.

**Who uses it & why:** Staffing coordinator lists available associates and their rates for the new deal.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `role` | string | no | same |
| `enabled` | integer | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_users`

## `practice_areas_list`

*Mirrors:* GET /api/v4/practice_areas.json — #tag/Practice-areas

List the firm's practice areas.

**Who uses it & why:** Intake maps the new engagement to the right practice area for conflicts routing.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `limit` | integer | no | same |

**Op:** `list` on `pm_practice_areas`

## Internal simulator boundary

These operations are not published by MCP `tools/list` and cannot be called by an evaluated agent. They actuate deterministic external state or preserve migration-only storage behavior:

- `bills_create`
- `trust_transactions_create`
- `trust_balance_get`
- `audit_events_list`

