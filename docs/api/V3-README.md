# v3 mock services — vendor-shaped, conformance measured

Each product tool maps to a cited vendor operation and executes against
session-private SQLite. Mapping is not exactness: input, response, pagination,
encoding, and error conformance are tracked separately in `docs/CONFORMANCE.md`.
Serve the canonical product-only world with:

```bash
python3 world/local/server.py --port 8979 \
  --world world/blobfish/world-v16.json --v2-contracts mcp/v3/contracts
```

| Product | Dialect | Tools | Real API mirrored |
|---|---|---|---|
| [dms-v3](./v3-dms.md) | `imanage` | 12 | https://docs.imanage.com/work-api/ |
| [docket-records-v3](./v3-docket-records.md) | `courtlistener` | 13 | https://www.courtlistener.com/help/api/rest/ |
| [ebilling-v3](./v3-ebilling.md) | `ledes` | 8 | https://ledes.org/ |
| [ediscovery-v3](./v3-ediscovery.md) | `relativity` | 12 | https://platform.relativity.com/ |
| [practice-management-v3](./v3-practice-management.md) | `clio` | 37 | https://docs.developers.clio.com/api-reference/ |
| [workspace-v3](./v3-workspace.md) | `google` | 10 | https://developers.google.com/sheets/api \| drive/api \| gmail/api \| calendar/api |

**92 tools across 6 products.**

Graded by the v3 workflow task pack (`world/expansion/build-v3-tasks.mjs`, 15 tasks) —
see `docs/MCP-JUSTIFICATION.md` for why each product was chosen and how the mock
compares to the real API surface.
