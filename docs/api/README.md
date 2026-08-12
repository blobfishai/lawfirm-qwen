# Mock services — canonical product API documentation

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
| [deadline-rules-v3](./v3-deadlines.md) | `calendar_rules` | 1 | https://www.uscourts.gov/forms-rules/current-rules-practice-procedure/federal-rules-civil-procedure |
| [dms-v3](./v3-dms.md) | `imanage` | 12 | https://docs.imanage.com/work-api/ |
| [docket-records-v3](./v3-docket-records.md) | `courtlistener` | 13 | https://www.courtlistener.com/help/api/rest/ |
| [ebilling-v3](./v3-ebilling.md) | `ledes` | 2 | https://ledes.org/ledes-98b-format/ |
| [ediscovery-v3](./v3-ediscovery.md) | `relativity` | 12 | https://platform.relativity.com/ |
| [courtfile-efiling-v3](./v3-efiling.md) | `cmecf` | 4 | https://pacer.uscourts.gov/file-case/how-file-case ; https://www.ord.uscourts.gov/index.php/filing-and-forms/cm-ecf/user-manual |
| [sealpoint-esign-v3](./v3-esign.md) | `docusign` | 4 | https://github.com/docusign/OpenAPI-Specifications/blob/master/esignature.rest.swagger-v2.1.json |
| [practice-management-v3](./v3-practice-management.md) | `clio` | 33 | https://docs.developers.clio.com/api-reference/ |
| [workspace-v3](./v3-workspace.md) | `google` | 10 | https://developers.google.com/sheets/api \| drive/api \| gmail/api \| calendar/api |

**91 agent-visible tools across 9 products.**

11 internal simulator/migration operations are excluded from MCP discovery and vendor conformance scoring.

Graded by the v3 workflow task pack (`world/expansion/build-v3-tasks.mjs`, 15 tasks) —
see `docs/MCP-JUSTIFICATION.md` for why each product was chosen and how the mock
compares to the real API surface.
