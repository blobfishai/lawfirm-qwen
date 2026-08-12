# MCP schema diff: legal-mcp vs the simulation world

Pinned source: `agentic-ops/legal-mcp@e726301bfdc7` (AGPL-3.0-only). The comparison parses **27** decorated source tools and **102** spec-backed world tools.

## Result

- Exact tool-name matches: **0**
- Exact input schemas: **0**
- Exact output schemas: **0**
- Exact end-to-end contracts: **0**
- Executable compatibility adapters: **1** (`search_live_case_law` through the CourtListener base-URL facade)

That zero is expected and important. `legal-mcp` exposes application-level research, drafting, and analysis helpers. The world exposes Clio-, CourtListener-, iManage-, Relativity-, Google-, LEDES-, ECF-, CalendarRules-, and DocuSign-shaped operations with persistent state. Similar legal purpose does not make inputs or outputs identical.

## Per-tool alignment

| legal-mcp tool | Relation | World composition | Input exact? | Output exact? |
|---|---|---|---:|---:|
| `analyze_clauses` | workflow composition | `documents_search_fulltext`, `documents_download`, `documents_create` | no | no |
| `analyze_document` | workflow composition | `documents_download`, `documents_create` | no | no |
| `check_demo_database` | structural analogue | `citation_lookup` | no | no |
| `check_privilege_risk` | workflow composition | `review_documents_get`, `privilege_log_create` | no | no |
| `compare_contracts` | workflow composition | `documents_download`, `documents_create` | no | no |
| `compare_documents` | workflow composition | `documents_download`, `document_versions_list`, `documents_create` | no | no |
| `create_argument_structure` | workflow composition | `citation_lookup`, `documents_create` | no | no |
| `deep_analyze_clause` | workflow composition | `documents_download`, `documents_create` | no | no |
| `export_analysis_report` | workflow composition | `documents_create` | no | no |
| `extract_clauses` | workflow composition | `documents_search_fulltext`, `documents_download`, `documents_create` | no | no |
| `extract_contract_metadata` | workflow composition | `documents_download`, `documents_create` | no | no |
| `extract_statute` | no counterpart | — | no | no |
| `generate_brief_outline` | workflow composition | `opinions_search`, `citation_lookup`, `documents_create` | no | no |
| `generate_issue_statement` | workflow composition | `documents_create` | no | no |
| `generate_negotiation_guide` | workflow composition | `documents_download`, `documents_create` | no | no |
| `get_analysis_result` | structural analogue | `jobs_get`, `documents_create` | no | no |
| `get_analysis_status` | structural analogue | `jobs_get` | no | no |
| `integration_status` | no counterpart | — | no | no |
| `list_analysis_jobs` | structural analogue | `productions_list` | no | no |
| `normalize_citation` | structural analogue | `citation_lookup` | no | no |
| `queue_document_analysis` | structural analogue | `documents_download`, `productions_create`, `jobs_get` | no | no |
| `research_legal_issue` | workflow composition | `opinions_search`, `citation_lookup`, `documents_create` | no | no |
| `search_case_law` | structural analogue | `opinions_search` | no | no |
| `search_live_case_law` | compatibility adapter | `opinions_search` | no | no |
| `search_precedents` | structural analogue | `opinions_search` | no | no |
| `suggest_clause_alternatives` | workflow composition | `documents_search_fulltext`, `documents_create` | no | no |
| `validate_citation` | structural analogue | `citation_lookup` | no | no |

## Design consequences

1. Do not rename the vendor contracts to legal-mcp names. That would erase the distinction between doing legal analysis and changing a system of record.
2. Evaluate legal-mcp as an application layer composed over the world. The first executable path is its configurable CourtListener client through `mcp/byo/courtlistener_facade.py`.
3. Keep async submit/poll/retrieve as a cross-layer failure-mode test, while documenting that Relativity production and document analysis are different jobs.
4. Treat statute retrieval as a real gap. It needs a licensed, version-pinned authority corpus and a provable API before a mock is admitted.
5. Preserve world-only state surfaces: practice management, DMS versions, e-filing, billing, deadlines, and e-signature are precisely what analysis-only MCP tools cannot verify.

## Rebuild

```bash
python3 world/ecosystem/diff_mcp_schemas.py
python3 tools/check_mcp_schema_diff.py
```

The complete parameter-level diff and source locations live in `data/ecosystem/mcp-schema-diff.json`.
