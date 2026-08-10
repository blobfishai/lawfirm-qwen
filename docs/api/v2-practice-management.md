# LexOperis PM (SIMULATED) — API surface mirrors Clio Manage API v4

Provenance: https://docs.developers.clio.com/api-reference/ (resource groups: Matters, Contacts, Activities, Bills, Calendar entries, Tasks, Notes, Communications, Trust, Users, Practice areas)

Tables: `pm_users`, `pm_practice_areas`, `pm_contacts`, `pm_matters`, `pm_time_entries`, `pm_expense_entries`, `pm_bills`, `pm_bill_line_items`, `pm_trust_transactions`, `pm_calendar_entries`, `pm_tasks`, `pm_notes`, `pm_communications`

## `matters_list`

*Mirrors:* GET /api/v4/matters.json — https://docs.developers.clio.com/api-reference/#tag/Matters

List matters with filters (status, client, responsible attorney, practice area).

**Who uses it & why:** A supervising partner reviews all open matters in her practice area before Monday staffing.

**Params:** `status:string, client_id:integer, responsible_attorney_id:integer, practice_area_id:integer, billing_method:string, limit:integer` · **Op:** list on `pm_matters`

## `matters_get`

*Mirrors:* GET /api/v4/matters/{id}.json

Fetch one matter by id.

**Who uses it & why:** An associate pulls the matter record to confirm billing method and responsible attorney before recording time.

**Params:** `id:integer` · **Op:** get on `pm_matters`

## `matters_create`

*Mirrors:* POST /api/v4/matters.json

Open a new matter.

**Who uses it & why:** Intake coordinator opens a new matter after the engagement letter is signed and conflicts cleared.

**Params:** `display_name:string, client_id:integer, practice_area_id:integer, responsible_attorney_id:integer, billing_method:string, description:string, number:string, open_date:string` · **Op:** create on `pm_matters`

## `matters_update`

*Mirrors:* PATCH /api/v4/matters/{id}.json

Update matter fields (status transitions, staffing, description).

**Who uses it & why:** The responsible partner closes a settled matter and hands staffing to a new associate.

**Params:** `id:integer, status:string, responsible_attorney_id:integer, description:string, close_date:string, billing_method:string` · **Op:** update on `pm_matters`

## `matters_search`

*Mirrors:* GET /api/v4/matters.json?query=

Free-text search over matter number, name, description.

**Who uses it & why:** A paralegal finds the right matter from a client's email that only mentions the deal name.

**Params:** `query:string, limit:integer` · **Op:** search on `pm_matters`

## `contacts_list`

*Mirrors:* GET /api/v4/contacts.json — #tag/Contacts

List contacts (people and companies) with filters.

**Who uses it & why:** The billing clerk lists client companies to reconcile month-end statements.

**Params:** `type:string, is_client:integer, limit:integer` · **Op:** list on `pm_contacts`

## `contacts_get`

*Mirrors:* GET /api/v4/contacts/{id}.json

Fetch one contact.

**Who uses it & why:** An associate confirms the GC's email before sending the draft.

**Params:** `id:integer` · **Op:** get on `pm_contacts`

## `contacts_create`

*Mirrors:* POST /api/v4/contacts.json

Create a person or company contact.

**Who uses it & why:** Intake adds the new client company and its GC after the pitch converts.

**Params:** `type:string, name:string, primary_email:string, primary_phone:string, title:string, company_name:string, is_client:integer` · **Op:** create on `pm_contacts`

## `contacts_update`

*Mirrors:* PATCH /api/v4/contacts/{id}.json

Update contact fields.

**Who uses it & why:** A secretary updates a contact's phone and title after a client-side promotion.

**Params:** `id:integer, primary_email:string, primary_phone:string, title:string, company_name:string, is_client:integer, name:string` · **Op:** update on `pm_contacts`

## `contacts_search`

*Mirrors:* GET /api/v4/contacts.json?query=

Free-text contact search (name, email, company).

**Who uses it & why:** Conflicts analyst searches every contact matching the adverse party's name.

**Params:** `query:string, limit:integer` · **Op:** search on `pm_contacts`

## `time_entries_list`

*Mirrors:* GET /api/v4/activities.json?type=TimeEntry — #tag/Activities

List time entries with filters (matter, user, date range, billed state).

**Who uses it & why:** The billing partner pulls a matter's unbilled time before generating the prebill.

**Params:** `matter_id:integer, user_id:integer, billable:integer, billed:integer, utbms_task_code:string, date_from:string, date_to:string, limit:integer` · **Op:** list on `pm_time_entries`

## `time_entries_get`

*Mirrors:* GET /api/v4/activities/{id}.json

Fetch one time entry.

**Who uses it & why:** A billing clerk inspects one contested entry from the client's audit letter.

**Params:** `id:integer` · **Op:** get on `pm_time_entries`

## `time_entries_create`

*Mirrors:* POST /api/v4/activities.json (TimeEntry)

Record billable/non-billable time against a matter with a UTBMS task code.

**Who uses it & why:** An associate records 2.5 hours drafting the dispositive motion with task code L240.

**Params:** `matter_id:integer, user_id:integer, date:string, quantity_hours:number, rate:number, description:string, utbms_task_code:string, billable:integer` · **Op:** create on `pm_time_entries`

## `time_entries_update`

*Mirrors:* PATCH /api/v4/activities/{id}.json

Correct a time entry (narrative, hours, code) before billing.

**Who uses it & why:** The billing partner rewrites a vague narrative and fixes the task code before the bill goes out.

**Params:** `id:integer, quantity_hours:number, rate:number, description:string, utbms_task_code:string, billable:integer, date:string` · **Op:** update on `pm_time_entries`

## `expense_entries_list`

*Mirrors:* GET /api/v4/activities.json?type=ExpenseEntry

List expense entries with filters.

**Who uses it & why:** Accounting reviews court-fee expenses across matters for the quarterly true-up.

**Params:** `matter_id:integer, user_id:integer, billable:integer, utbms_expense_code:string, limit:integer` · **Op:** list on `pm_expense_entries`

## `expense_entries_create`

*Mirrors:* POST /api/v4/activities.json (ExpenseEntry)

Record a matter expense with a UTBMS expense code.

**Who uses it & why:** A paralegal records the filing fee paid to the clerk this morning.

**Params:** `matter_id:integer, user_id:integer, date:string, amount:number, description:string, utbms_expense_code:string, billable:integer` · **Op:** create on `pm_expense_entries`

## `bills_list`

*Mirrors:* GET /api/v4/bills.json — #tag/Bills

List bills with filters (state, matter, client).

**Who uses it & why:** The finance manager lists every bill awaiting approval before the partner meeting.

**Params:** `state:string, matter_id:integer, client_id:integer, limit:integer` · **Op:** list on `pm_bills`

## `bills_get`

*Mirrors:* GET /api/v4/bills/{id}.json

Fetch one bill with totals and state.

**Who uses it & why:** A partner opens one bill to check balance and due date before calling the client.

**Params:** `id:integer` · **Op:** get on `pm_bills`

## `bills_create`

*Mirrors:* POST /api/v4/bills.json

Generate a draft bill (prebill) for a matter.

**Who uses it & why:** The billing clerk cuts a draft bill from June's unbilled time on the matter.

**Params:** `matter_id:integer, client_id:integer, subtotal:number, issue_date:string, due_date:string, number:string` · **Op:** create on `pm_bills`

## `bills_update`

*Mirrors:* PATCH /api/v4/bills/{id}.json

Move a bill through its lifecycle (draft → awaiting_approval → approved → issued → paid | void) or adjust dates/balance.

**Who uses it & why:** After partner sign-off, the clerk moves the bill from awaiting_approval to issued.

**Params:** `id:integer, state:string, issue_date:string, due_date:string, balance:number` · **Op:** update on `pm_bills`

## `bill_line_items_list`

*Mirrors:* GET /api/v4/line_items.json?bill_id=

List a bill's line items.

**Who uses it & why:** The client questioned the invoice; the clerk lists its line items to answer.

**Params:** `bill_id:integer, kind:string, limit:integer` · **Op:** list on `pm_bill_line_items`

## `trust_transactions_list`

*Mirrors:* Clio trust accounting (allocations/trust line items) — #tag/Allocations

List client trust ledger transactions (deposits, disbursements, earned-fee transfers).

**Who uses it & why:** The trust accountant pulls the matter's ledger for the monthly three-way reconciliation.

**Params:** `matter_id:integer, client_id:integer, kind:string, cleared:integer, date_from:string, date_to:string, limit:integer` · **Op:** list on `pm_trust_transactions`

## `trust_transactions_create`

*Mirrors:* Clio trust accounting (trust deposit/disbursement)

Post a trust transaction. Deposits positive; disbursements and earned-fee transfers negative.

**Who uses it & why:** Reception posts the client's retainer check into the trust ledger.

**Params:** `matter_id:integer, client_id:integer, kind:string, amount:number, date:string, memo:string` · **Op:** create on `pm_trust_transactions`

## `trust_balance_get`

*Mirrors:* derived: Clio trust balance report

Current trust balance for a matter or client (sum of ledger).

**Who uses it & why:** Before filing, the paralegal confirms the trust balance covers the court fees.

**Params:** `matter_id:integer, client_id:integer` · **Op:** aggregate on `pm_trust_transactions`

## `calendar_entries_list`

*Mirrors:* GET /api/v4/calendar_entries.json — #tag/Calendar-entries

List calendar entries (hearings, depositions, deadlines) with filters and date range.

**Who uses it & why:** The docketing clerk reviews next week's hearings across all matters every Friday.

**Params:** `matter_id:integer, kind:string, start_from:string, start_to:string, limit:integer` · **Op:** list on `pm_calendar_entries`

## `calendar_entries_create`

*Mirrors:* POST /api/v4/calendar_entries.json

Create a calendar entry for a matter.

**Who uses it & why:** An associate calendars the deposition the parties just agreed to.

**Params:** `matter_id:integer, summary:string, start_at:string, end_at:string, location:string, kind:string, attendee_user_ids:string` · **Op:** create on `pm_calendar_entries`

## `calendar_entries_update`

*Mirrors:* PATCH /api/v4/calendar_entries/{id}.json

Reschedule or edit a calendar entry.

**Who uses it & why:** Court moved the status conference; the clerk reschedules the entry.

**Params:** `id:integer, summary:string, start_at:string, end_at:string, location:string, kind:string` · **Op:** update on `pm_calendar_entries`

## `tasks_list`

*Mirrors:* GET /api/v4/tasks.json — #tag/Tasks

List matter tasks with filters.

**Who uses it & why:** A supervising attorney checks which of her associates' tasks are overdue.

**Params:** `matter_id:integer, assignee_user_id:integer, status:string, priority:string, limit:integer` · **Op:** list on `pm_tasks`

## `tasks_create`

*Mirrors:* POST /api/v4/tasks.json

Assign a task on a matter.

**Who uses it & why:** The partner assigns 'draft privilege log' to the second-year with a Friday due date.

**Params:** `matter_id:integer, assignee_user_id:integer, name:string, due_at:string, priority:string` · **Op:** create on `pm_tasks`

## `tasks_update`

*Mirrors:* PATCH /api/v4/tasks/{id}.json

Progress or complete a task.

**Who uses it & why:** The associate marks the cite-check complete before leaving.

**Params:** `id:integer, status:string, due_at:string, priority:string, assignee_user_id:integer` · **Op:** update on `pm_tasks`

## `notes_list`

*Mirrors:* GET /api/v4/notes.json — #tag/Notes

List matter notes.

**Who uses it & why:** New counsel reads the matter's notes to get up to speed after the handoff.

**Params:** `matter_id:integer, author_user_id:integer, limit:integer` · **Op:** list on `pm_notes`

## `notes_create`

*Mirrors:* POST /api/v4/notes.json

Attach a note to a matter.

**Who uses it & why:** After the client call, the partner writes the strategy note into the matter.

**Params:** `matter_id:integer, author_user_id:integer, subject:string, detail:string` · **Op:** create on `pm_notes`

## `communications_list`

*Mirrors:* GET /api/v4/communications.json — #tag/Communications

List logged emails/calls on a matter.

**Who uses it & why:** Preparing for the deposition, the team lists all logged calls with the witness.

**Params:** `matter_id:integer, type:string, limit:integer` · **Op:** list on `pm_communications`

## `communications_create`

*Mirrors:* POST /api/v4/communications.json

Log an email or call against a matter.

**Who uses it & why:** The secretary logs today's client call with a summary against the matter.

**Params:** `matter_id:integer, type:string, subject:string, body:string, senders:string, receivers:string, received_at:string` · **Op:** create on `pm_communications`

## `users_list`

*Mirrors:* GET /api/v4/users.json — #tag/Users

List firm users (attorneys, staff) and rates.

**Who uses it & why:** Staffing coordinator lists available associates and their rates for the new deal.

**Params:** `role:string, enabled:integer, limit:integer` · **Op:** list on `pm_users`

## `practice_areas_list`

*Mirrors:* GET /api/v4/practice_areas.json — #tag/Practice-areas

List the firm's practice areas.

**Who uses it & why:** Intake maps the new engagement to the right practice area for conflicts routing.

**Params:** `category:string, limit:integer` · **Op:** list on `pm_practice_areas`
