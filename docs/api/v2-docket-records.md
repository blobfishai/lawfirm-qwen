# CourtDock Records (SIMULATED) — API surface mirrors CourtListener REST API v4

Provenance: https://www.courtlistener.com/help/api/rest/ (endpoints: /courts/, /dockets/, /docket-entries/, /recap-documents/, /search/, /opinions/, /parties/, /attorneys/, /citation-lookup/, /alerts/)

Tables: `cl_courts`, `cl_dockets`, `cl_docket_entries`, `cl_recap_documents`, `cl_opinions`, `cl_parties`, `cl_docket_alerts`

## `courts_list`

*Mirrors:* GET /api/rest/v4/courts/ — courtlistener.com/help/api/rest/

List courts with jurisdiction filters.

**Who uses it & why:** The docketing clerk confirms the right court slug before setting up docket tracking.

**Params:** `jurisdiction:string, in_use:integer, limit:integer` · **Op:** list on `cl_courts`

## `dockets_list`

*Mirrors:* GET /api/rest/v4/dockets/?court=&date_filed__gte=

List dockets filtered by court, nature of suit, and filing-date range.

**Who uses it & why:** A litigation partner surveys new antitrust filings in the district this quarter.

**Params:** `court_id:string, nature_of_suit:string, assigned_to:string, date_filed_after:string, date_filed_before:string, limit:integer` · **Op:** list on `cl_dockets`

## `dockets_get`

*Mirrors:* GET /api/rest/v4/dockets/{id}/

Fetch one docket with its metadata.

**Who uses it & why:** An associate pulls the docket to check the assigned judge before drafting.

**Params:** `id:integer` · **Op:** get on `cl_dockets`

## `dockets_search`

*Mirrors:* GET /api/rest/v4/search/?type=r&q=

Free-text docket search (case name, docket number, cause).

**Who uses it & why:** The client asked about 'the Talvern case' — the paralegal finds the docket by name.

**Params:** `query:string, limit:integer` · **Op:** search on `cl_dockets`

## `docket_entries_list`

*Mirrors:* GET /api/rest/v4/docket-entries/?docket=

List a docket's entries in filing order.

**Who uses it & why:** Before the status conference, the associate reads every entry since the last order.

**Params:** `docket_id:integer, entry_number:integer, filed_after:string, filed_before:string, limit:integer` · **Op:** list on `cl_docket_entries`

## `recap_documents_get`

*Mirrors:* GET /api/rest/v4/recap-documents/{id}/

Fetch a filed document's metadata and plain text (sealed documents return no text).

**Who uses it & why:** An associate reads the opposition brief's full text to draft the reply.

**Params:** `id:integer` · **Op:** get on `cl_recap_documents`

## `recap_documents_list`

*Mirrors:* GET /api/rest/v4/recap-documents/?docket_entry=

List documents attached to a docket entry.

**Who uses it & why:** The team lists the documents attached to yesterday's motion entry.

**Params:** `docket_entry_id:integer, is_sealed:integer, limit:integer` · **Op:** list on `cl_recap_documents`

## `opinions_search`

*Mirrors:* GET /api/rest/v4/search/?type=o&q=

Full-text opinion search returning snippets and citations.

**Who uses it & why:** Researching the motion, the associate searches opinions on limitation-of-liability clauses.

**Params:** `query:string, limit:integer` · **Op:** search on `cl_opinions`

## `opinions_get`

*Mirrors:* GET /api/rest/v4/opinions/{id}/

Fetch one opinion with full text.

**Who uses it & why:** The associate reads the controlling opinion in full before citing it.

**Params:** `id:integer` · **Op:** get on `cl_opinions`

## `citation_lookup`

*Mirrors:* POST /api/rest/v4/citation-lookup/ (Eyecite-backed)

Resolve a citation string to an opinion. Unknown citations return no match — never fabricate.

**Who uses it & why:** Cite-checking the brief, the paralegal verifies every citation resolves to a real opinion — anything unresolved gets flagged, never guessed.

**Params:** `citation:string` · **Op:** search on `cl_opinions`

## `parties_list`

*Mirrors:* GET /api/rest/v4/parties/?docket=

List parties on a docket with representation.

**Who uses it & why:** The conflicts analyst lists all parties on the new matter's docket.

**Params:** `docket_id:integer, party_type:string, limit:integer` · **Op:** list on `cl_parties`

## `docket_alerts_create`

*Mirrors:* POST /api/rest/v4/docket-alerts/

Subscribe an alert on a docket (new-entry or termination).

**Who uses it & why:** The docketing clerk subscribes alerts on the appeal so nothing is missed.

**Params:** `docket_id:integer, alert_type:string, recipient:string` · **Op:** create on `cl_docket_alerts`

## `docket_alerts_list`

*Mirrors:* GET /api/rest/v4/docket-alerts/

List active docket alerts.

**Who uses it & why:** The clerk audits which dockets still have active alerts after the case settled.

**Params:** `docket_id:integer, alert_type:string, limit:integer` · **Op:** list on `cl_docket_alerts`
