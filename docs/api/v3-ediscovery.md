# DiscoParse (SIMULATED) — API surface mirrors Relativity REST (Object Manager + productions)

**Dialect:** `relativity` · **Provenance:** https://platform.relativity.com/ (Object Manager query, documents, productions, holds)

**Response envelopes** (what every tool of this product returns):

| Op | Envelope |
|---|---|
| list/search | `{"Objects": [{"ArtifactID": id, ...}], "TotalCount": N, "CurrentStartIndex": 0}` |
| get | `{"ArtifactID": id, ...}` |
| create/update | `{...}` |

**Tables (SQLite):** `ed_workspaces`, `ed_documents`, `ed_productions`, `ed_privilege_log`, `ed_holds`

## `review_workspaces_list`

*Mirrors:* Object Manager query on Workspace objects

List review workspaces.

**Who uses it & why:** The lit-support manager lists active review workspaces for capacity planning.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `status` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `ed_workspaces`

## `documents_query`

*Mirrors:* POST /Relativity.ObjectManager/.../query (Document)

Query documents by custodian, responsiveness, privilege, or date range.

**Who uses it & why:** A review attorney queries unreviewed documents from the key custodian for her batch.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `workspace_id` | integer | no | same |
| `custodian` | string | no | same |
| `responsive` | string | no | same |
| `privileged` | string | no | same |
| `reviewed_by` | string | no | same |
| `date_from` | string | no | same |
| `date_to` | string | no | same |
| `length` | integer | no | `limit` |

**Op:** `list` on `ed_documents`

## `review_documents_get`

*Mirrors:* GET document with extracted text

Fetch one document with full extracted text.

**Who uses it & why:** The reviewer opens the document's full extracted text to make the privilege call.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Op:** `get` on `ed_documents`

## `review_documents_search`

*Mirrors:* dtSearch/keyword search

Keyword search across subject and extracted text.

**Who uses it & why:** Second-level review searches for the codeword the deponent mentioned.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `query` | string | no | same |
| `length` | integer | no | `limit` |

**Op:** `search` on `ed_documents`

## `documents_code`

*Mirrors:* PATCH document coding fields

Code a document (responsive/privileged) as a named reviewer.

**Who uses it & why:** The reviewer codes the document responsive, not privileged, under her name.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `responsive` | string | no | same |
| `privileged` | string | no | same |
| `reviewed_by` | string | no | same |

**Op:** `update` on `ed_documents`

## `productions_list`

*Mirrors:* GET productions

List productions with status.

**Who uses it & why:** The senior associate checks which productions have gone out before the meet-and-confer.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `workspace_id` | integer | no | same |
| `status` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `ed_productions`

## `productions_create`

*Mirrors:* POST production set

Stage a production set with a Bates prefix. Production jobs run ASYNC: poll jobs_get until status is completed before relying on the result.

**Who uses it & why:** Lit support stages Production 003 with the DEF Bates prefix for Friday.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `workspace_id` | integer | yes | same |
| `name` | string | yes | same |
| `bates_prefix` | string | yes | same |
| `doc_count` | integer | no | same |

**Op:** `create` on `ed_productions`

## `privilege_log_list`

*Mirrors:* privilege log export

List privilege-log entries.

**Who uses it & why:** Opposing counsel challenged the log; the team pulls all attorney-client entries.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `workspace_id` | integer | no | same |
| `basis` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `ed_privilege_log`

## `privilege_log_create`

*Mirrors:* add privilege log entry

Log a privileged document with basis and description.

**Who uses it & why:** The reviewer logs the withheld strategy memo with its privilege basis.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `workspace_id` | integer | yes | same |
| `document_id` | integer | yes | same |
| `basis` | string | yes | same |
| `description` | string | yes | same |

**Op:** `create` on `ed_privilege_log`

## `holds_list`

*Mirrors:* legal holds

List legal holds and acknowledgment state.

**Who uses it & why:** Before the custodian interview, counsel checks who has acknowledged the hold.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `workspace_id` | integer | no | same |
| `custodian` | string | no | same |
| `acknowledged` | integer | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `ed_holds`

## `holds_create`

*Mirrors:* issue legal hold

Issue a litigation hold to a custodian.

**Who uses it & why:** New complaint filed — counsel issues litigation holds to the five key custodians.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `workspace_id` | integer | yes | same |
| `custodian` | string | yes | same |
| `issued_at` | string | yes | same |

**Op:** `create` on `ed_holds`

## `jobs_get`

*Mirrors:* GET /Relativity.REST/api/relativity-infrastructure/v1/workspaces/{id}/jobs — long-running job status (Relativity jobs are asynchronous)

Poll a production job. Status advances staged -> running -> completed; results are reliable only once completed.

**Who uses it & why:** Lit support polls the Friday production until it completes before serving.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |

**Op:** `job_poll` on `ed_productions`

