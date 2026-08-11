# Fieldstone Workspace (SIMULATED) — API surface mirrors Google Workspace (Sheets/Drive/Gmail/Calendar)

**Dialect:** `google` · **Provenance:** https://developers.google.com/sheets/api | drive/api | gmail/api | calendar/api

**Response envelopes** (what every tool of this product returns):

| Op | Envelope |
|---|---|
| list/search | `API-native: {"values": [[...]]} · {"kind": "drive#fileList", "files": [...]} · {"messages": [...], "resultSizeEstimate": N} · {"kind": "calendar#events", "items": [...]}` |
| get | `resource objects: drive#file · Gmail message (payload.headers) · calendar#event` |
| create/update | `e.g. {"spreadsheetId", "updatedRange", "updatedCells"}` |

**Tables (SQLite):** `ws_spreadsheets`, `ws_sheet_values`, `ws_files`, `ws_messages`, `ws_events`

## `sheets_values_get`

*Mirrors:* GET /v4/spreadsheets/{id}/values/{range}

Read values from a sheet range.

**Who uses it & why:** The practice manager reads the Q3 billable-hours tab for the compensation meeting.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `spreadsheetId` | integer | no | `spreadsheet_id` |
| `sheet_name` | string | no | same |
| `cell_range` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `ws_sheet_values`

## `sheets_values_update`

*Mirrors:* PUT /v4/spreadsheets/{id}/values/{range}

Write a value to a cell/range.

**Who uses it & why:** After the bill issues, the clerk updates the matter-budget tracker cell.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `spreadsheetId` | integer | yes | `spreadsheet_id` |
| `sheet_name` | string | yes | same |
| `cell_range` | string | yes | same |
| `value` | string | yes | same |

**Op:** `create` on `ws_sheet_values`

## `spreadsheets_list`

*Mirrors:* Drive files.list mimeType=spreadsheet

List spreadsheets.

**Who uses it & why:** The ops manager inventories the firm's tracking spreadsheets during systems cleanup.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `owner` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `ws_spreadsheets`

## `drive_files_list`

*Mirrors:* GET /drive/v3/files?q=

List/search Drive files.

**Who uses it & why:** An associate searches the client share for the security questionnaire.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `q` | string | no | `query` |
| `limit` | integer | no | same |

**Op:** `search` on `ws_files`

## `drive_files_get`

*Mirrors:* GET /drive/v3/files/{id}?alt=media

Fetch a file with content.

**Who uses it & why:** She opens the questionnaire to copy the firm's standard answers.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `fileId` | integer | no | `id` |

**Op:** `get` on `ws_files`

## `gmail_messages_list`

*Mirrors:* GET /gmail/v1/users/me/messages?q=

Search mail (subject/body/participants).

**Who uses it & why:** Preparing the chronology, the paralegal searches mail for the settlement thread.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `q` | string | no | `query` |
| `maxResults` | integer | no | `limit` |

**Op:** `search` on `ws_messages`

## `gmail_messages_get`

*Mirrors:* GET /gmail/v1/users/me/messages/{id}

Fetch one message in full.

**Who uses it & why:** He opens the key message where the client authorized the offer.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Op:** `get` on `ws_messages`

## `gmail_messages_send`

*Mirrors:* POST /gmail/v1/users/me/messages/send

Send a message (records to SENT).

**Who uses it & why:** The associate emails the executed agreement to the client with the closing summary.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `from_addr` | string | yes | same |
| `to_addr` | string | yes | same |
| `subject` | string | yes | same |
| `body` | string | yes | same |
| `thread_id` | integer | no | same |
| `sent_at` | string | no | same |

**Op:** `create` on `ws_messages`

## `calendar_events_list`

*Mirrors:* GET /calendar/v3/calendars/{id}/events

List events with date range.

**Who uses it & why:** The docketing clerk cross-checks firm calendar events against court deadlines.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `calendarId` | string | no | `calendar` |
| `status` | string | no | same |
| `timeMin` | string | no | `time_min` |
| `timeMax` | string | no | `time_max` |
| `maxResults` | integer | no | `limit` |

**Op:** `list` on `ws_events`

## `calendar_events_insert`

*Mirrors:* POST /calendar/v3/calendars/{id}/events

Create an event.

**Who uses it & why:** The secretary schedules the all-hands closing call for Thursday.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `calendarId` | string | yes | `calendar` |
| `summary` | string | yes | same |
| `start_at` | string | yes | same |
| `end_at` | string | no | same |
| `attendees` | string | no | same |

**Op:** `create` on `ws_events`

