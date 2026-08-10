# v2 mock services — real-API-mirrored tool surfaces

One MCP product per contract, built to the mcp-grafana standard: dense tool surfaces, every tool
mirroring a REAL vendor API operation, executed data-driven against SQLite (world/local/v2runtime.py),
deterministic seeds, per-session state, friction applied. Serve: `python3 world/local/server.py
--v2-contracts mcp/v2/contracts`. Every tool lists WHO uses it and WHY (persona scenario).

- [dms-v2](./v2-dms.md) — 10 tools — MatterVault DMS (SIMULATED) — API surface mirrors iManage Work API
- [docket-records-v2](./v2-docket-records.md) — 13 tools — CourtDock Records (SIMULATED) — API surface mirrors CourtListener REST API v4
- [ebilling-v2](./v2-ebilling.md) — 8 tools — LedgerBill (SIMULATED) — API surface mirrors LEDES 1998B e-billing exchange
- [ediscovery-v2](./v2-ediscovery.md) — 11 tools — DiscoParse (SIMULATED) — API surface mirrors Relativity REST (Object Manager + productions)
- [practice-management-v2](./v2-practice-management.md) — 36 tools — LexOperis PM (SIMULATED) — API surface mirrors Clio Manage API v4
- [workspace-v2](./v2-workspace.md) — 10 tools — Fieldstone Workspace (SIMULATED) — API surface mirrors Google Workspace (Sheets/Drive/Gmail/Calendar)

Total: 88 tools across 6 products.