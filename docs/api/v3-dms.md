# MatterVault DMS (SIMULATED) — API surface mirrors iManage Work API

**Dialect:** `imanage` · **Provenance:** https://docs.imanage.com/work-api/ (documents, versions, workspaces, folders, search, checkout/checkin)

**Response envelopes** (what every tool of this product returns):

| Op | Envelope |
|---|---|
| list/search | `{"data": {"results": [...], "total": N}}` |
| get | `{"data": {...}}` |
| create/update | `{"data": {...}}` |

**Tables (SQLite):** `dm_workspaces`, `dm_folders`, `dm_documents`, `dm_document_versions`

## `documents_search`

*Mirrors:* GET /work/api/v2/customers/{c}/libraries/{l}/documents?anywhere=

Full-text and profile search across documents.

**Who uses it & why:** An associate hunts for the execution copy across the workspace by keyword.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `anywhere` | string | no | `query` |
| `limit` | integer | no | same |
| `offset` | integer | no | same |

**Op:** `search` on `dm_documents`

## `documents_get`

*Mirrors:* GET /documents/{id}

Fetch a document profile and its text.

**Who uses it & why:** The partner opens the engagement letter to check the fee clause verbatim.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `get` on `dm_documents`

## `documents_list`

*Mirrors:* GET /folders/{id}/documents

List documents in a folder or workspace.

**Who uses it & why:** A paralegal lists everything in the Closing Set folder before the signing.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `folder_id` | integer | no | same |
| `workspace_id` | integer | no | same |
| `doc_class` | string | no | same |
| `checked_out_by` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `dm_documents`

## `documents_checkout`

*Mirrors:* POST /documents/{id}/checkout

Check a document out for editing (locks it to the user).

**Who uses it & why:** An associate checks out the MSA draft so nobody edits underneath her.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `id` | integer | no | same |
| `checked_out_by` | string | no | same |

**Op:** `update` on `dm_documents` · lock conflict (409) enforced

## `documents_checkin`

*Mirrors:* POST /documents/{id}/checkin

Check a document back in; optionally as a new version.

**Who uses it & why:** She checks the MSA back in as version 4 with partner revisions.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `updateOrCreate` | string | no | same |
| `documentId` | string | no | `id` |
| `file` | string | no | `body` |

**Op:** `update` on `dm_documents`

## `document_versions_list`

*Mirrors:* GET /documents/{id}/versions

List a document's version history.

**Who uses it & why:** Disputing what changed, the team lists the document's version history.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `document_id` | integer | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `dm_document_versions`

## `documents_create`

*Mirrors:* POST /folders/{id}/documents

File a new document into a folder.

**Who uses it & why:** The associate files the signed amendment into the matter's Deal Documents folder.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `libraryId` | string | no | same |
| `folderId` | string | yes | `folder_id` |
| `inherit_profile_from_folder` | boolean | no | same |
| `file` | string | yes | `body` |
| `author` | string | no | `author` |
| `class` | string | yes | `doc_class` |

**Op:** `create` on `dm_documents`

## `workspaces_list`

*Mirrors:* GET /workspaces

List matter workspaces.

**Who uses it & why:** Records manager reviews workspaces for the quarterly retention sweep.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `owner` | string | no | same |
| `limit` | integer | no | same |

**Op:** `list` on `dm_workspaces`

## `workspaces_search`

*Mirrors:* GET /workspaces?name=

Search workspaces by name or matter number.

**Who uses it & why:** A new paralegal finds the matter workspace from the client's matter number.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `search` on `dm_workspaces`

## `folders_list`

*Mirrors:* GET /workspaces/{id}/folders

List folders in a workspace.

**Who uses it & why:** Before filing, the secretary checks which folders the workspace already has.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `list` on `dm_folders`

## `documents_download`

*Mirrors:* GET /api/v2/customers/{c}/libraries/{l}/documents/{id}/download — iManage Work document download

Download a document: the FULL body text, not the profile preview.

**Who uses it & why:** An associate pulls the full executed agreement text before drafting.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `body` | object | no | same |

**Op:** `get` on `dm_documents`

## `documents_search_fulltext`

*Mirrors:* POST /api/v2/customers/{c}/libraries/{l}/documents/search (anyword/fulltext) — iManage Work search

Full-text search over document bodies and names. Paged; page until has_more is false.

**Who uses it & why:** Find every document mentioning the escrow release condition.

| Param (real API name) | Type | Required | Internal field |
|---|---|---|---|
| `query` | string | no | same |
| `limit` | integer | no | same |
| `offset` | integer | no | same |

**Op:** `search` on `dm_documents`

