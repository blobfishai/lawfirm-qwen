# MatterVault DMS (SIMULATED) — API surface mirrors iManage Work API

Provenance: https://docs.imanage.com/work-api/ (documents, versions, workspaces, folders, search, checkout/checkin)

Tables: `dm_workspaces`, `dm_folders`, `dm_documents`, `dm_document_versions`

## `documents_search`

*Mirrors:* GET /work/api/v2/customers/{c}/libraries/{l}/documents?anywhere=

Full-text and profile search across documents.

**Who uses it & why:** An associate hunts for the execution copy across the workspace by keyword.

**Params:** `query:string, limit:integer` · **Op:** search on `dm_documents`

## `documents_get`

*Mirrors:* GET /documents/{id}

Fetch a document profile and its text.

**Who uses it & why:** The partner opens the engagement letter to check the fee clause verbatim.

**Params:** `id:integer` · **Op:** get on `dm_documents`

## `documents_list`

*Mirrors:* GET /folders/{id}/documents

List documents in a folder or workspace.

**Who uses it & why:** A paralegal lists everything in the Closing Set folder before the signing.

**Params:** `folder_id:integer, workspace_id:integer, doc_class:string, checked_out_by:string, limit:integer` · **Op:** list on `dm_documents`

## `documents_checkout`

*Mirrors:* POST /documents/{id}/checkout

Check a document out for editing (locks it to the user).

**Who uses it & why:** An associate checks out the MSA draft so nobody edits underneath her.

**Params:** `id:integer, checked_out_by:string` · **Op:** update on `dm_documents`

## `documents_checkin`

*Mirrors:* POST /documents/{id}/checkin

Check a document back in; optionally as a new version.

**Who uses it & why:** She checks the MSA back in as version 4 with partner revisions.

**Params:** `id:integer, checked_out_by:string, latest_version:integer, body:string, edit_date:string` · **Op:** update on `dm_documents`

## `document_versions_list`

*Mirrors:* GET /documents/{id}/versions

List a document's version history.

**Who uses it & why:** Disputing what changed, the team lists the document's version history.

**Params:** `document_id:integer, limit:integer` · **Op:** list on `dm_document_versions`

## `documents_create`

*Mirrors:* POST /folders/{id}/documents

File a new document into a folder.

**Who uses it & why:** The associate files the signed amendment into the matter's Deal Documents folder.

**Params:** `folder_id:integer, workspace_id:integer, name:string, doc_class:string, author:string, body:string` · **Op:** create on `dm_documents`

## `workspaces_list`

*Mirrors:* GET /workspaces

List matter workspaces.

**Who uses it & why:** Records manager reviews workspaces for the quarterly retention sweep.

**Params:** `owner:string, limit:integer` · **Op:** list on `dm_workspaces`

## `workspaces_search`

*Mirrors:* GET /workspaces?name=

Search workspaces by name or matter number.

**Who uses it & why:** A new paralegal finds the matter workspace from the client's matter number.

**Params:** `query:string, limit:integer` · **Op:** search on `dm_workspaces`

## `folders_list`

*Mirrors:* GET /workspaces/{id}/folders

List folders in a workspace.

**Who uses it & why:** Before filing, the secretary checks which folders the workspace already has.

**Params:** `workspace_id:integer, limit:integer` · **Op:** list on `dm_folders`
