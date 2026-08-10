# DiscoParse (SIMULATED) — API surface mirrors Relativity REST (Object Manager + productions)

Provenance: https://platform.relativity.com/ (Object Manager query, documents, productions, holds)

Tables: `ed_workspaces`, `ed_documents`, `ed_productions`, `ed_privilege_log`, `ed_holds`

## `review_workspaces_list`

*Mirrors:* Object Manager query on Workspace objects

List review workspaces.

**Who uses it & why:** The lit-support manager lists active review workspaces for capacity planning.

**Params:** `status:string, limit:integer` · **Op:** list on `ed_workspaces`

## `documents_query`

*Mirrors:* POST /Relativity.ObjectManager/.../query (Document)

Query documents by custodian, responsiveness, privilege, or date range.

**Who uses it & why:** A review attorney queries unreviewed documents from the key custodian for her batch.

**Params:** `workspace_id:integer, custodian:string, responsive:string, privileged:string, reviewed_by:string, date_from:string, date_to:string, limit:integer` · **Op:** list on `ed_documents`

## `review_documents_get`

*Mirrors:* GET document with extracted text

Fetch one document with full extracted text.

**Who uses it & why:** The reviewer opens the document's full extracted text to make the privilege call.

**Params:** `id:integer` · **Op:** get on `ed_documents`

## `review_documents_search`

*Mirrors:* dtSearch/keyword search

Keyword search across subject and extracted text.

**Who uses it & why:** Second-level review searches for the codeword the deponent mentioned.

**Params:** `query:string, limit:integer` · **Op:** search on `ed_documents`

## `documents_code`

*Mirrors:* PATCH document coding fields

Code a document (responsive/privileged) as a named reviewer.

**Who uses it & why:** The reviewer codes the document responsive, not privileged, under her name.

**Params:** `id:integer, responsive:string, privileged:string, reviewed_by:string` · **Op:** update on `ed_documents`

## `productions_list`

*Mirrors:* GET productions

List productions with status.

**Who uses it & why:** The senior associate checks which productions have gone out before the meet-and-confer.

**Params:** `workspace_id:integer, status:string, limit:integer` · **Op:** list on `ed_productions`

## `productions_create`

*Mirrors:* POST production set

Stage a production set with a Bates prefix.

**Who uses it & why:** Lit support stages Production 003 with the DEF Bates prefix for Friday.

**Params:** `workspace_id:integer, name:string, bates_prefix:string, doc_count:integer` · **Op:** create on `ed_productions`

## `privilege_log_list`

*Mirrors:* privilege log export

List privilege-log entries.

**Who uses it & why:** Opposing counsel challenged the log; the team pulls all attorney-client entries.

**Params:** `workspace_id:integer, basis:string, limit:integer` · **Op:** list on `ed_privilege_log`

## `privilege_log_create`

*Mirrors:* add privilege log entry

Log a privileged document with basis and description.

**Who uses it & why:** The reviewer logs the withheld strategy memo with its privilege basis.

**Params:** `workspace_id:integer, document_id:integer, basis:string, description:string` · **Op:** create on `ed_privilege_log`

## `holds_list`

*Mirrors:* legal holds

List legal holds and acknowledgment state.

**Who uses it & why:** Before the custodian interview, counsel checks who has acknowledged the hold.

**Params:** `workspace_id:integer, custodian:string, acknowledged:integer, limit:integer` · **Op:** list on `ed_holds`

## `holds_create`

*Mirrors:* issue legal hold

Issue a litigation hold to a custodian.

**Who uses it & why:** New complaint filed — counsel issues litigation holds to the five key custodians.

**Params:** `workspace_id:integer, custodian:string, issued_at:string` · **Op:** create on `ed_holds`
