# v3 mock services — vendor-shaped contract surface

Each product's tools declare a real-product target and apply a vendor-shaped
dialect over SQLite. They are **not yet a 1:1 wire copy**. The executable
[conformance report](../CONFORMANCE.md) distinguishes endpoint mappings from
validated request, response, pagination, and error contracts; derived helpers
and simulator-only extensions never count as vendor-exact. Serve with:

```bash
python3 world/local/server.py --port 8979 \
  --world world/blobfish/world-v3.json --v2-contracts mcp/v3/contracts
```

| Product | Dialect | Tools | Real API mirrored |
|---|---|---|---|
| [dms-v3](./v3-dms.md) | `imanage` | 12 | https://learn.microsoft.com/connectors/imanagework/ |
| [docket-records-v3](./v3-docket-records.md) | `courtlistener` | 13 | https://www.courtlistener.com/help/api/rest/ |
| [ebilling-v3](./v3-ebilling.md) | `ledes` | 8 | https://ledes.org/ |
| [ediscovery-v3](./v3-ediscovery.md) | `relativity` | 12 | https://platform.relativity.com/ |
| [practice-management-v3](./v3-practice-management.md) | `clio` | 37 | https://docs.developers.clio.com/api-reference/ |
| [workspace-v3](./v3-workspace.md) | `google` | 10 | https://developers.google.com/sheets/api \| drive/api \| gmail/api \| calendar/api |

**92 tools across 6 simulated products.** The current registry contains 82
vendor-targeted tools, 2 derived helpers, and 8 simulator-extension gaps. See
the generated report for the exact, reproducible counts. The deterministic wire
probe currently executes 92/92 success calls and passes 20/49 applicable
success-response schemas; that is evidence of the remaining work, not an
aggregate fidelity score.

```bash
python3 tools/conformance/sync_specs.py --check
python3 tools/conformance/run.py --check
# Release gate; intentionally red until every vendor-targeted row is exact:
python3 tools/conformance/run.py --strict
```

Graded by the v3 workflow task pack (`world/expansion/build-v3-tasks.mjs`, 15 tasks) —
see `docs/MCP-JUSTIFICATION.md` for why each product was chosen and how the mock
compares to the real API surface.
