# CourtDock Records (SIMULATED) — API surface mirrors CourtListener REST API v4

**Dialect:** `courtlistener` · **Provenance:** https://www.courtlistener.com/help/api/rest/ (endpoints: /courts/, /dockets/, /docket-entries/, /recap-documents/, /search/, /opinions/, /parties/, /attorneys/, /citation-lookup/, /alerts/)

**Response envelopes** (what every tool of this product returns):

| Op | Envelope |
|---|---|
| list/search | `{"count": N\|count-URL, "next": null, "previous": null, "results": [...]}` |
| get | `{...resource fields...}` |
| create/update | `{...}` |

**Tables (SQLite):** `cl_courts`, `cl_dockets`, `cl_docket_entries`, `cl_recap_documents`, `cl_opinions`, `cl_parties`, `cl_docket_alerts`

## `courts_list`

*Mirrors:* GET /api/rest/v4/courts/ — courtlistener.com/help/api/rest/

List courts with jurisdiction filters.

**Who uses it & why:** The docketing clerk confirms the right court slug before setting up docket tracking.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `jurisdiction` | string | no | same |
| `in_use` | integer | no | same |
| `page` | integer | no | same |

**Op:** `list` on `cl_courts`

## `dockets_list`

*Mirrors:* GET /api/rest/v4/dockets/?court=&date_filed__gte=

List dockets filtered by court, nature of suit, and filing-date range.

**Who uses it & why:** A litigation partner surveys new antitrust filings in the district this quarter.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `court` | string | no | `court_id` |
| `nature_of_suit` | string | no | same |
| `date_filed__gte` | string | no | `date_filed_after` |
| `date_filed__lte` | string | no | `date_filed_before` |
| `page` | integer | no | same |
| `order_by` | string | no | same |

**Op:** `list` on `cl_dockets`

## `dockets_get`

*Mirrors:* GET /api/rest/v4/dockets/{id}/

Fetch one docket with its metadata.

**Who uses it & why:** An associate pulls the docket to check the assigned judge before drafting.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Op:** `get` on `cl_dockets`

## `dockets_search`

*Mirrors:* GET /api/rest/v4/search/?type=r&q=

Free-text docket search (case name, docket number, cause).

**Who uses it & why:** The client asked about 'the Talvern case' — the paralegal finds the docket by name.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `q` | string | no | `query` |
| `cursor` | string | no | same |

**Op:** `search` on `cl_dockets`

## `docket_entries_list`

*Mirrors:* GET /api/rest/v4/docket-entries/?docket=

List a docket's entries in filing order.

**Who uses it & why:** Before the status conference, the associate reads every entry since the last order.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `docket` | integer | no | `docket_id` |
| `entry_number` | integer | no | same |
| `date_filed__gte` | string | no | `filed_after` |
| `date_filed__lte` | string | no | `filed_before` |
| `page` | integer | no | same |
| `order_by` | string | no | same |

**Op:** `list` on `cl_docket_entries`

## `recap_documents_get`

*Mirrors:* GET /api/rest/v4/recap-documents/{id}/

Fetch a filed document's metadata and plain text (sealed documents return no text).

**Who uses it & why:** An associate reads the opposition brief's full text to draft the reply.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Op:** `get` on `cl_recap_documents` · redaction rule applies

## `recap_documents_list`

*Mirrors:* GET /api/rest/v4/recap-documents/?docket_entry=

List documents attached to a docket entry.

**Who uses it & why:** The team lists the documents attached to yesterday's motion entry.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `docket_entry` | integer | no | `docket_entry_id` |
| `is_sealed` | integer | no | same |
| `page` | integer | no | same |
| `order_by` | string | no | same |

**Op:** `list` on `cl_recap_documents`

## `opinions_search`

*Mirrors:* GET /api/rest/v4/search/?type=o&q=

Full-text opinion search returning snippets and citations.

**Who uses it & why:** Researching the motion, the associate searches opinions on limitation-of-liability clauses.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `q` | string | no | `query` |
| `cursor` | string | no | same |

**Op:** `search` on `cl_opinions`

## `opinions_get`

*Mirrors:* GET /api/rest/v4/opinions/{id}/

Fetch one opinion with full text.

**Who uses it & why:** The associate reads the controlling opinion in full before citing it.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Op:** `get` on `cl_opinions`

## `citation_lookup`

*Mirrors:* POST /api/rest/v4/citation-lookup/ (Eyecite-backed)

Resolve a citation string to an opinion. Unknown citations return no match — never fabricate.

**Who uses it & why:** Cite-checking the brief, the paralegal verifies every citation resolves to a real opinion — anything unresolved gets flagged, never guessed.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `text` | string | no | `citation` |

**Op:** `search` on `cl_opinions`

## `parties_list`

*Mirrors:* GET /api/rest/v4/parties/?docket=

List parties on a docket with representation.

**Who uses it & why:** The conflicts analyst lists all parties on the new matter's docket.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `docket` | integer | no | `docket_id` |
| `name` | string | no | same |
| `cursor` | string | no | same |
| `order_by` | string | no | same |

**Op:** `list` on `cl_parties`

## `docket_alerts_create`

*Mirrors:* POST /api/rest/v4/docket-alerts/

Subscribe an alert on a docket (new-entry or termination).

**Who uses it & why:** The docketing clerk subscribes alerts on the appeal so nothing is missed.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `docket` | integer | yes | `docket_id` |
| `alert_type` | integer | no | same |

**Op:** `create` on `cl_docket_alerts`

## `docket_alerts_list`

*Mirrors:* GET /api/rest/v4/docket-alerts/

List active docket alerts.

**Who uses it & why:** The clerk audits which dockets still have active alerts after the case settled.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `docket` | integer | no | `docket_id` |
| `alert_type` | integer | no | same |
| `cursor` | string | no | same |
| `page_size` | integer | no | same |
| `order_by` | string | no | same |

**Op:** `list` on `cl_docket_alerts`

