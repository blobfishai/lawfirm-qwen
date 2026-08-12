# BYO-MCP: legal-mcp over the deterministic world

The first compatibility target is `agentic-ops/legal-mcp@e726301bfdc7`. Its CourtListener integration reads `COURTLISTENER_BASE_URL`, so the production MCP can be evaluated without live legal-data calls by pointing it at a narrow REST facade backed by CourtDock.

## Boundary

This is a compatibility adapter, not a claim that the two MCP schemas are identical. It currently supports CourtListener search types `o` (opinions) and `r` (dockets), translated to `opinions_search` and `dockets_search`. Unsupported types return an explicit 400 response. PACER remains disabled, so no fee-bearing or external call is possible.

## Run

```bash
python3 world/local/server.py --port 8972 --world world/blobfish/world-v19.json --v2-contracts mcp/v3/contracts
python3 mcp/byo/courtlistener_facade.py --port 8993 --world-base http://127.0.0.1:8972
python3 mcp/byo/legal_mcp_env.py --base-url http://127.0.0.1:8993 --format shell
```

Apply the emitted environment to the vendored `legal-mcp` process. The token is synthetic and only protects the local facade; it is not a CourtListener credential.

## Acceptance proof

```bash
python3 tools/check_byo_mcp.py --check-proof
```

The checker starts a private world and facade on ephemeral loopback ports, imports the vendored `CourtListenerClient`, performs its real base-URL-configured request, proves unauthenticated access is rejected, and records that the route has no external network path. The committed result is `data/ecosystem/byo-mcp-proof.json`.
