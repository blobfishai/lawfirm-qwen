# Tool conformance

Pinned specifications: **2026-08-12**.

> Endpoint mapping is not API exactness. A tool counts as exact only after its wire input, success response, pagination, and documented errors all validate. Derived helpers and simulator extensions are excluded from the vendor score.

## Current result

| Measure | Count |
| --- | ---: |
| Contract tools covered by the registry | 92 / 92 |
| Vendor-targeted tools | 82 |
| Vendor targets resolved to a pinned source | 76 / 82 |
| Deterministic success calls | 92 / 92 |
| Applicable success-response schemas passed | 20 / 49 |
| Fully exact vendor tools | 0 / 82 |
| Derived helpers (excluded) | 2 |
| Simulator-extension gaps | 8 |
| Conformance-harness failures | 0 |

The current exact count is intentionally zero: response, pagination, and error fixtures have not yet passed. This report establishes the fail-closed target registry; subsequent M2 work closes those components rather than relabeling endpoint mappings as conformance.

## Product coverage

| Product | Tools | Exact | Verification state |
| --- | ---: | ---: | --- |
| `clio-manage-v4` | 37 | 0 | derived-excluded-from-vendor-score, simulator-extension-gap, spec-mapped-not-conformant |
| `courtlistener-v4` | 13 | 0 | live-diff-required |
| `google-calendar-v3` | 2 | 0 | spec-mapped-not-conformant |
| `google-drive-v3` | 3 | 0 | spec-mapped-not-conformant |
| `google-gmail-v1` | 3 | 0 | spec-mapped-not-conformant |
| `google-sheets-v4` | 2 | 0 | spec-mapped-not-conformant |
| `imanage-work` | 12 | 0 | public-connector-mapped-fidelity-ceiling, unverifiable-partner-gated |
| `ledes-1998b` | 7 | 0 | derived-excluded-from-vendor-score, simulator-extension-gap, standard-fixture-required |
| `relativity-rest` | 12 | 0 | golden-fixture-required |
| `utbms` | 1 | 0 | standard-fixture-required |

## Tool rows

| Tool | Product | Mode | Status | Target |
| --- | --- | --- | --- | --- |
| `appeals_create` | `ledes-1998b` | `simulator_extension` | `simulator-extension-gap` | Appeal workflow is an e-billing platform surface, not part of the LEDES file standard. |
| `appeals_list` | `ledes-1998b` | `simulator_extension` | `simulator-extension-gap` | Appeal workflow is an e-billing platform surface, not part of the LEDES file standard. |
| `audit_events_list` | `clio-manage-v4` | `simulator_extension` | `simulator-extension-gap` | No public Clio audit-log endpoint; retained temporarily for controlled-change verifiers. |
| `bill_line_items_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /line_items.json |
| `bills_create` | `clio-manage-v4` | `simulator_extension` | `simulator-extension-gap` | The pinned Clio v4 OpenAPI exposes GET /bills.json but no POST; direct bill creation is not a documented operation. |
| `bills_get` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /bills/{id}.json |
| `bills_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /bills.json |
| `bills_update` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | patch · /bills/{id}.json |
| `calendar_entries_create` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | post · /calendar_entries.json |
| `calendar_entries_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /calendar_entries.json |
| `calendar_entries_update` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | patch · /calendar_entries/{id}.json |
| `calendar_events_insert` | `google-calendar-v3` | `google_discovery` | `spec-mapped-not-conformant` | calendar.events.insert |
| `calendar_events_list` | `google-calendar-v3` | `google_discovery` | `spec-mapped-not-conformant` | calendar.events.list |
| `citation_lookup` | `courtlistener-v4` | `live_diff` | `live-diff-required` | post · /api/rest/v4/citation-lookup/ |
| `communications_create` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | post · /communications.json |
| `communications_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /communications.json |
| `contacts_create` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | post · /contacts.json |
| `contacts_get` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /contacts/{id}.json |
| `contacts_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /contacts.json |
| `contacts_search` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /contacts.json |
| `contacts_update` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | patch · /contacts/{id}.json |
| `courts_list` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/courts/ |
| `docket_alerts_create` | `courtlistener-v4` | `live_diff` | `live-diff-required` | post · /api/rest/v4/docket-alerts/ |
| `docket_alerts_list` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/docket-alerts/ |
| `docket_entries_list` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/docket-entries/ |
| `dockets_get` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/dockets/{id}/ |
| `dockets_list` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/dockets/ |
| `dockets_search` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/search/ |
| `document_versions_list` | `imanage-work` | `partner_gated` | `unverifiable-partner-gated` | private Work API version listing |
| `documents_checkin` | `imanage-work` | `imanage_connector` | `public-connector-mapped-fidelity-ceiling` | UpdateOrCreateNewDocVersion |
| `documents_checkout` | `imanage-work` | `partner_gated` | `unverifiable-partner-gated` | private Work API checkout lifecycle |
| `documents_code` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | documents_code |
| `documents_create` | `imanage-work` | `imanage_connector` | `public-connector-mapped-fidelity-ceiling` | UploadDocument |
| `documents_download` | `imanage-work` | `imanage_connector` | `public-connector-mapped-fidelity-ceiling` | DownloadDocument |
| `documents_get` | `imanage-work` | `imanage_connector` | `public-connector-mapped-fidelity-ceiling` | GetDocumentProfile |
| `documents_list` | `imanage-work` | `partner_gated` | `unverifiable-partner-gated` | private Work API folder-document listing |
| `documents_query` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | documents_query |
| `documents_search` | `imanage-work` | `partner_gated` | `unverifiable-partner-gated` | private Work API document search |
| `documents_search_fulltext` | `imanage-work` | `partner_gated` | `unverifiable-partner-gated` | private Work API full-text search |
| `drive_files_get` | `google-drive-v3` | `google_discovery` | `spec-mapped-not-conformant` | drive.files.get |
| `drive_files_list` | `google-drive-v3` | `google_discovery` | `spec-mapped-not-conformant` | drive.files.list |
| `expense_entries_create` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | post · /activities.json |
| `expense_entries_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /activities.json |
| `folders_list` | `imanage-work` | `imanage_connector` | `public-connector-mapped-fidelity-ceiling` | SearchFolders |
| `gmail_messages_get` | `google-gmail-v1` | `google_discovery` | `spec-mapped-not-conformant` | gmail.users.messages.get |
| `gmail_messages_list` | `google-gmail-v1` | `google_discovery` | `spec-mapped-not-conformant` | gmail.users.messages.list |
| `gmail_messages_send` | `google-gmail-v1` | `google_discovery` | `spec-mapped-not-conformant` | gmail.users.messages.send |
| `holds_create` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | holds_create |
| `holds_list` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | holds_list |
| `invoice_lines_list` | `ledes-1998b` | `simulator_extension` | `simulator-extension-gap` | Line retrieval is an e-billing platform surface, not part of the LEDES file standard. |
| `invoice_total_check` | `ledes-1998b` | `derived` | `derived-excluded-from-vendor-score` | sum line items and compare with declared total |
| `invoices_get` | `ledes-1998b` | `simulator_extension` | `simulator-extension-gap` | Invoice detail retrieval is an e-billing platform surface, not part of the LEDES file standard. |
| `invoices_list` | `ledes-1998b` | `simulator_extension` | `simulator-extension-gap` | Invoice inventory is an e-billing platform surface, not part of the LEDES file standard. |
| `invoices_submit` | `ledes-1998b` | `published_standard` | `standard-fixture-required` | ledes-1998b-file |
| `jobs_get` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | jobs_get |
| `matters_create` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | post · /matters.json |
| `matters_get` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /matters/{id}.json |
| `matters_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /matters.json |
| `matters_search` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /matters.json |
| `matters_update` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | patch · /matters/{id}.json |
| `notes_create` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | post · /notes.json |
| `notes_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /notes.json |
| `opinions_get` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/opinions/{id}/ |
| `opinions_search` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/search/ |
| `parties_list` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/parties/ |
| `practice_areas_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /practice_areas.json |
| `privilege_log_create` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | privilege_log_create |
| `privilege_log_list` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | privilege_log_list |
| `productions_create` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | productions_create |
| `productions_list` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | productions_list |
| `recap_documents_get` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/recap-documents/{id}/ |
| `recap_documents_list` | `courtlistener-v4` | `live_diff` | `live-diff-required` | get · /api/rest/v4/recap-documents/ |
| `review_documents_get` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | review_documents_get |
| `review_documents_search` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | review_documents_search |
| `review_workspaces_list` | `relativity-rest` | `documentation_fixture` | `golden-fixture-required` | review_workspaces_list |
| `sheets_values_get` | `google-sheets-v4` | `google_discovery` | `spec-mapped-not-conformant` | sheets.spreadsheets.values.get |
| `sheets_values_update` | `google-sheets-v4` | `google_discovery` | `spec-mapped-not-conformant` | sheets.spreadsheets.values.update |
| `spreadsheets_list` | `google-drive-v3` | `google_discovery` | `spec-mapped-not-conformant` | drive.files.list |
| `tasks_create` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | post · /tasks.json |
| `tasks_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /tasks.json |
| `tasks_update` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | patch · /tasks/{id}.json |
| `time_entries_create` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | post · /activities.json |
| `time_entries_get` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /activities/{id}.json |
| `time_entries_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /activities.json |
| `time_entries_update` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | patch · /activities/{id}.json |
| `trust_balance_get` | `clio-manage-v4` | `derived` | `derived-excluded-from-vendor-score` | sum trust allocations for a scoped balance |
| `trust_transactions_create` | `clio-manage-v4` | `simulator_extension` | `simulator-extension-gap` | The pinned Clio v4 OpenAPI exposes allocations as read-only; trust writes must migrate to a documented bank-transaction or trust-request workflow. |
| `trust_transactions_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /allocations.json |
| `users_list` | `clio-manage-v4` | `openapi` | `spec-mapped-not-conformant` | get · /users.json |
| `utbms_codes_list` | `utbms` | `published_standard` | `standard-fixture-required` | utbms-code-set |
| `workspaces_list` | `imanage-work` | `partner_gated` | `unverifiable-partner-gated` | private Work API workspace listing |
| `workspaces_search` | `imanage-work` | `imanage_connector` | `public-connector-mapped-fidelity-ceiling` | SearchWorkspaces |

## Reproduce

```bash
python3 tools/conformance/sync_specs.py --check
python3 tools/conformance/live.py --base http://127.0.0.1:8974 --check
python3 tools/conformance/run.py --check
# The release gate remains red until this succeeds:
python3 tools/conformance/run.py --strict
```
