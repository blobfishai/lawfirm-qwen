# Fieldstone Workspace (SIMULATED) — API surface mirrors Google Workspace (Sheets/Drive/Gmail/Calendar)

Provenance: https://developers.google.com/sheets/api | drive/api | gmail/api | calendar/api

Tables: `ws_spreadsheets`, `ws_sheet_values`, `ws_files`, `ws_messages`, `ws_events`

## `sheets_values_get`

*Mirrors:* GET /v4/spreadsheets/{id}/values/{range}

Read values from a sheet range.

**Who uses it & why:** The practice manager reads the Q3 billable-hours tab for the compensation meeting.

**Params:** `spreadsheet_id:integer, sheet_name:string, cell_range:string, limit:integer` · **Op:** list on `ws_sheet_values`

## `sheets_values_update`

*Mirrors:* PUT /v4/spreadsheets/{id}/values/{range}

Write a value to a cell/range.

**Who uses it & why:** After the bill issues, the clerk updates the matter-budget tracker cell.

**Params:** `spreadsheet_id:integer, sheet_name:string, cell_range:string, value:string` · **Op:** create on `ws_sheet_values`

## `spreadsheets_list`

*Mirrors:* Drive files.list mimeType=spreadsheet

List spreadsheets.

**Who uses it & why:** The ops manager inventories the firm's tracking spreadsheets during systems cleanup.

**Params:** `owner:string, limit:integer` · **Op:** list on `ws_spreadsheets`

## `drive_files_list`

*Mirrors:* GET /drive/v3/files?q=

List/search Drive files.

**Who uses it & why:** An associate searches the client share for the security questionnaire.

**Params:** `query:string, limit:integer` · **Op:** search on `ws_files`

## `drive_files_get`

*Mirrors:* GET /drive/v3/files/{id}?alt=media

Fetch a file with content.

**Who uses it & why:** She opens the questionnaire to copy the firm's standard answers.

**Params:** `id:integer` · **Op:** get on `ws_files`

## `gmail_messages_list`

*Mirrors:* GET /gmail/v1/users/me/messages?q=

Search mail (subject/body/participants).

**Who uses it & why:** Preparing the chronology, the paralegal searches mail for the settlement thread.

**Params:** `query:string, limit:integer` · **Op:** search on `ws_messages`

## `gmail_messages_get`

*Mirrors:* GET /gmail/v1/users/me/messages/{id}

Fetch one message in full.

**Who uses it & why:** He opens the key message where the client authorized the offer.

**Params:** `id:integer` · **Op:** get on `ws_messages`

## `gmail_messages_send`

*Mirrors:* POST /gmail/v1/users/me/messages/send

Send a message (records to SENT).

**Who uses it & why:** The associate emails the executed agreement to the client with the closing summary.

**Params:** `from_addr:string, to_addr:string, subject:string, body:string, thread_id:integer, sent_at:string` · **Op:** create on `ws_messages`

## `calendar_events_list`

*Mirrors:* GET /calendar/v3/calendars/{id}/events

List events with date range.

**Who uses it & why:** The docketing clerk cross-checks firm calendar events against court deadlines.

**Params:** `calendar:string, status:string, time_min:string, time_max:string, limit:integer` · **Op:** list on `ws_events`

## `calendar_events_insert`

*Mirrors:* POST /calendar/v3/calendars/{id}/events

Create an event.

**Who uses it & why:** The secretary schedules the all-hands closing call for Thursday.

**Params:** `calendar:string, summary:string, start_at:string, end_at:string, attendees:string` · **Op:** create on `ws_events`
