# v3 mock services — 1:1 real-API wire format

Each product's tools take the **real API's parameter names** and return the
**real API's response envelope**, executed against SQLite. This is the
fidelity copy of the v2 surface (v2 kept intact as the measured-history
surface). Serve with:

```bash
python3 world/local/server.py --port 8979 \
  --world world/blobfish/world-v3.json --v2-contracts mcp/v3/contracts
```

| Product | Dialect | Tools | Real API mirrored |
|---|---|---|---|
| [dms-v3](./v3-dms.md) | `imanage` | 10 | https://docs.imanage.com/work-api/ |
| [docket-records-v3](./v3-docket-records.md) | `courtlistener` | 13 | https://www.courtlistener.com/help/api/rest/ |
| [ebilling-v3](./v3-ebilling.md) | `ledes` | 8 | https://ledes.org/ |
| [ediscovery-v3](./v3-ediscovery.md) | `relativity` | 11 | https://platform.relativity.com/ |
| [practice-management-v3](./v3-practice-management.md) | `clio` | 36 | https://docs.developers.clio.com/api-reference/ |
| [workspace-v3](./v3-workspace.md) | `google` | 10 | https://developers.google.com/sheets/api \| drive/api \| gmail/api \| calendar/api |

**88 tools across 6 products.**

Graded by the v3 workflow task pack (`world/expansion/build-v3-tasks.mjs`, 15 tasks) —
see `docs/MCP-JUSTIFICATION.md` for why each product was chosen and how the mock
compares to the real API surface.
