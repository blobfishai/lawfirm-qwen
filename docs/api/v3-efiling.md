# CourtFile ECF (SIMULATED) — workflow semantics mirror CM/ECF NextGen

**Dialect:** `cmecf` · **Provenance:** https://pacer.uscourts.gov/file-case/how-file-case ; https://www.ord.uscourts.gov/index.php/filing-and-forms/cm-ecf/user-manual

**Response envelopes** (what every tool of this product returns):

| Op | Envelope |
|---|---|
| list/search | `{"count", "results", "has_more"}` |
| get | `{"case": {...}}` |
| create/update | `{"filing_id", "docket_entry_id", "nef_notice_id", "status": "filed"}` |

**Tables (SQLite):** `ef_cases`, `ef_filings`, `ef_docket_entries`, `ef_nef_notices`

## `efiling_cases_get`

*Mirrors:* CM/ECF case-selection workflow (documentation fixture; no public common write API)

Get an open CM/ECF case before choosing a filing event.

**Who uses it & why:** 

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `case_id` | integer | yes | same |

**Op:** `efiling_case_get` on `ef_cases`

## `efiling_filings_create`

*Mirrors:* CM/ECF event selection → PDF upload → filing submission → NEF workflow

File one PDF under a supported civil event; atomically creates the filing, docket entry, and NEF.

**Who uses it & why:** 

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `case_id` | integer | yes | same |
| `event_type` | string | yes | same |
| `document_name` | string | yes | same |
| `document_mime_type` | string | yes | same |
| `document_sha256` | string | no | same |
| `description` | string | no | same |
| `filed_at` | string | no | same |

**Op:** `efiling_create` on `ef_filings`

## `efiling_docket_entries_list`

*Mirrors:* CM/ECF docket report after filing (documentation fixture)

List docket entries created on the filing side.

**Who uses it & why:** 

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `case_id` | integer | no | same |
| `filing_id` | integer | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `ef_docket_entries`

## `efiling_nef_notices_list`

*Mirrors:* CM/ECF Notice of Electronic Filing generated at transaction completion

List generated Notices of Electronic Filing and their service status.

**Who uses it & why:** 

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `case_id` | integer | no | same |
| `filing_id` | integer | no | same |
| `status` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `ef_nef_notices`

