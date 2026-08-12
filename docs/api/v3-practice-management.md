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
| `billing_method` | string | no | same |
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
| `display_name` | string | yes | same |
| `client_id` | integer | yes | same |
| `practice_area_id` | integer | yes | same |
| `responsible_attorney_id` | integer | yes | same |
| `billing_method` | string | no | same |
| `description` | string | no | same |
| `number` | string | no | same |
| `open_date` | string | no | same |

**Op:** `create` on `pm_matters`

## `matters_update`

*Mirrors:* PATCH /api/v4/matters/{id}.json

Update matter fields (status transitions, staffing, description).

**Who uses it & why:** The responsible partner closes a settled matter and hands staffing to a new associate.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `status` | string | no | same |
| `responsible_attorney_id` | integer | no | same |
| `description` | string | no | same |
| `close_date` | string | no | same |
| `billing_method` | string | no | same |

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
| `is_client` | integer | no | same |
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
| `type` | string | yes | same |
| `name` | string | yes | same |
| `primary_email` | string | no | same |
| `primary_phone` | string | no | same |
| `title` | string | no | same |
| `company_name` | string | no | same |
| `is_client` | integer | no | same |

**Op:** `create` on `pm_contacts`

## `contacts_update`

*Mirrors:* PATCH /api/v4/contacts/{id}.json

Update contact fields.

**Who uses it & why:** A secretary updates a contact's phone and title after a client-side promotion.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `primary_email` | string | no | same |
| `primary_phone` | string | no | same |
| `title` | string | no | same |
| `company_name` | string | no | same |
| `is_client` | integer | no | same |
| `name` | string | no | same |

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
| `billable` | integer | no | same |
| `billed` | integer | no | same |
| `utbms_task_code` | string | no | same |
| `date_from` | string | no | same |
| `date_to` | string | no | same |
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
| `matter_id` | integer | yes | same |
| `user_id` | integer | yes | same |
| `date` | string | yes | same |
| `quantity_hours` | number | yes | same |
| `rate` | number | no | same |
| `description` | string | yes | same |
| `utbms_task_code` | string | no | same |
| `billable` | integer | no | same |

**Op:** `create` on `pm_time_entries` · computed: total

## `time_entries_update`

*Mirrors:* PATCH /api/v4/activities/{id}.json

Correct a time entry (narrative, hours, code) before billing.

**Who uses it & why:** The billing partner rewrites a vague narrative and fixes the task code before the bill goes out.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `quantity_hours` | number | no | same |
| `rate` | number | no | same |
| `description` | string | no | same |
| `utbms_task_code` | string | no | same |
| `billable` | integer | no | same |
| `date` | string | no | same |

**Op:** `update` on `pm_time_entries` · computed: total

## `expense_entries_list`

*Mirrors:* GET /api/v4/activities.json?type=ExpenseEntry

List expense entries with filters.

**Who uses it & why:** Accounting reviews court-fee expenses across matters for the quarterly true-up.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `user_id` | integer | no | same |
| `billable` | integer | no | same |
| `utbms_expense_code` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_expense_entries`

## `expense_entries_create`

*Mirrors:* POST /api/v4/activities.json (ExpenseEntry)

Record a matter expense with a UTBMS expense code.

**Who uses it & why:** A paralegal records the filing fee paid to the clerk this morning.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | yes | same |
| `user_id` | integer | yes | same |
| `date` | string | yes | same |
| `amount` | number | yes | same |
| `description` | string | yes | same |
| `utbms_expense_code` | string | no | same |
| `billable` | integer | no | same |

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

## `bills_create`

*Mirrors:* POST /api/v4/bills.json

Generate a draft bill (prebill) for a matter.

**Who uses it & why:** The billing clerk cuts a draft bill from June's unbilled time on the matter.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | yes | same |
| `client_id` | integer | yes | same |
| `subtotal` | number | yes | same |
| `issue_date` | string | no | same |
| `due_date` | string | no | same |
| `number` | string | no | same |

**Op:** `create` on `pm_bills` · computed: total, balance

## `bills_update`

*Mirrors:* PATCH /api/v4/bills/{id}.json

Move a bill through its lifecycle (draft → awaiting_approval → approved → issued → paid | void) or adjust dates/balance.

**Who uses it & why:** After partner sign-off, the clerk moves the bill from awaiting_approval to issued.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `state` | string | no | same |
| `issue_date` | string | no | same |
| `due_date` | string | no | same |
| `balance` | number | no | same |

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
| `client_id` | integer | no | same |
| `kind` | string | no | same |
| `cleared` | integer | no | same |
| `date_from` | string | no | same |
| `date_to` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_trust_transactions`

## `trust_transactions_create`

*Mirrors:* Clio trust accounting (trust deposit/disbursement)

Post a trust transaction. Deposits positive; disbursements and earned-fee transfers negative.

**Who uses it & why:** Reception posts the client's retainer check into the trust ledger.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | yes | same |
| `client_id` | integer | yes | same |
| `kind` | string | yes | same |
| `amount` | number | yes | same |
| `date` | string | yes | same |
| `memo` | string | yes | same |

**Op:** `create` on `pm_trust_transactions`

## `trust_balance_get`

*Mirrors:* derived: Clio trust balance report

Current trust balance for a matter or client (sum of ledger).

**Who uses it & why:** Before filing, the paralegal confirms the trust balance covers the court fees.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `client_id` | integer | no | same |

**Op:** `aggregate` on `pm_trust_transactions`

## `calendar_entries_list`

*Mirrors:* GET /api/v4/calendar_entries.json — #tag/Calendar-entries

List calendar entries (hearings, depositions, deadlines) with filters and date range.

**Who uses it & why:** The docketing clerk reviews next week's hearings across all matters every Friday.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `kind` | string | no | same |
| `start_from` | string | no | same |
| `start_to` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_calendar_entries`

## `calendar_entries_create`

*Mirrors:* POST /api/v4/calendar_entries.json

Create a calendar entry for a matter.

**Who uses it & why:** An associate calendars the deposition the parties just agreed to.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | yes | same |
| `summary` | string | yes | same |
| `start_at` | string | yes | same |
| `end_at` | string | no | same |
| `location` | string | no | same |
| `kind` | string | yes | same |
| `attendee_user_ids` | string | no | same |

**Op:** `create` on `pm_calendar_entries`

## `calendar_entries_update`

*Mirrors:* PATCH /api/v4/calendar_entries/{id}.json

Reschedule or edit a calendar entry.

**Who uses it & why:** Court moved the status conference; the clerk reschedules the entry.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `summary` | string | no | same |
| `start_at` | string | no | same |
| `end_at` | string | no | same |
| `location` | string | no | same |
| `kind` | string | no | same |

**Op:** `update` on `pm_calendar_entries`

## `tasks_list`

*Mirrors:* GET /api/v4/tasks.json — #tag/Tasks

List matter tasks with filters.

**Who uses it & why:** A supervising attorney checks which of her associates' tasks are overdue.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `assignee_user_id` | integer | no | same |
| `status` | string | no | same |
| `priority` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_tasks`

## `tasks_create`

*Mirrors:* POST /api/v4/tasks.json

Assign a task on a matter.

**Who uses it & why:** The partner assigns 'draft privilege log' to the second-year with a Friday due date.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | yes | same |
| `assignee_user_id` | integer | yes | same |
| `name` | string | yes | same |
| `due_at` | string | yes | same |
| `priority` | string | no | same |

**Op:** `create` on `pm_tasks`

## `tasks_update`

*Mirrors:* PATCH /api/v4/tasks/{id}.json

Progress or complete a task.

**Who uses it & why:** The associate marks the cite-check complete before leaving.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `status` | string | no | same |
| `due_at` | string | no | same |
| `priority` | string | no | same |
| `assignee_user_id` | integer | no | same |

**Op:** `update` on `pm_tasks`

## `notes_list`

*Mirrors:* GET /api/v4/notes.json — #tag/Notes

List matter notes.

**Who uses it & why:** New counsel reads the matter's notes to get up to speed after the handoff.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | no | same |
| `author_user_id` | integer | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_notes`

## `notes_create`

*Mirrors:* POST /api/v4/notes.json

Attach a note to a matter.

**Who uses it & why:** After the client call, the partner writes the strategy note into the matter.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `matter_id` | integer | yes | same |
| `author_user_id` | integer | yes | same |
| `subject` | string | yes | same |
| `detail` | string | yes | same |

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
| `matter_id` | integer | yes | same |
| `type` | string | yes | same |
| `subject` | string | yes | same |
| `body` | string | no | same |
| `senders` | string | no | same |
| `receivers` | string | no | same |
| `received_at` | string | no | same |

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
| `category` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_practice_areas`

## `audit_events_list`

*Mirrors:* internal audit feed — NO public Clio equivalent (Clio exposes no audit-log API); fidelity ceiling documented, kept because controlled-change verifiers pin these rows

List controlled-change audit events for a record.

**Who uses it & why:** A partner reviews who changed the invoice amount and why.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `record_table` | string | no | same |
| `record_id` | integer | no | same |
| `actor_role` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `pm_audit_events`

