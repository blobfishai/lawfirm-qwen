# mcp/ — the firm's tool stack as MCP servers

One MCP server per system the firm runs (the realistic topology: a law firm
does not have one god-API; it has a practice-management suite, a docketing
system, a DMS, a billing platform, …). All servers front the same local world
runtime (`world/local/server.py`) — one firm, many frontends. Tool names are
globally unique across systems, so verifier traces are identical regardless
of topology.

| Server | Product (SIMULATED) | Tools |
|---|---|---|
| `practice-management` | LexOperis PM (Clio Manage v4) | 33 — matters, contacts, time, billing, trust, calendars, tasks, communications |
| `docket-records` | CourtDock Records (CourtListener v4) | 13 — courts, dockets, RECAP, opinions, citations, alerts |
| `dms` | MatterVault DMS (iManage Work) | 12 — workspaces, folders, documents, versions, checkout/checkin, full text |
| `ediscovery` | DiscoParse (Relativity REST) | 12 — review, coding, holds, privilege logs, productions, async jobs |
| `workspace` | Fieldstone Workspace (Google APIs) | 10 — Sheets, Drive, Gmail, Calendar |
| `ebilling` | LedgerBill (LEDES/UTBMS) | 2 — code lookup and standards-conformant file submission |
| `courtfile-efiling` | CourtFile ECF (CM/ECF workflow semantics) | 4 — cases, PDF filing, docket entries, NEFs |
| `deadline-rules` | DeadlineRules (published FRCP fixtures) | 1 — cited deadline calculation |
| `esign` | SealPoint eSign (Docusign v2.1) | 4 — envelopes, recipients, lifecycle |

**91 agent-visible tools total** — the partition is validated (every exposed tool in exactly
one system) and integration-tested end to end by `mcp/test-multi-server.mjs`
(spawns all 9, checks the aggregated surface, drives a reference walk across
servers, requires the verifier to pass on the merged trace).

## Files

- `systems.json` — the partition: system → product, description, tool list.
- `serve-system.mjs` — generic per-system stdio MCP server:
  `node mcp/serve-system.mjs --system dms`. Pass `BLOBFISH_SESSION_ID` so
  several servers join one episode; without it each server opens its own
  session (right for interactive exploration). When sharing a session, also
  pass its bearer as `BLOBFISH_SESSION_TOKEN`; session ids alone are not
  authority.
- `test-multi-server.mjs` — the topology integration test (`npm run mcp:test`).
- `blobfish-lawfirm-bridge.mjs` — the single-surface bridge
  (all 91 tools + `verify_task`/`reset_session` harness tools). Historical
  measured episode to date used this surface; it remains the measurement
  default (`sim/run-simulation.mjs --mcp bridge`).

## Using the topologies

```bash
npm run world:serve                 # the world runtime (state substrate)
npm run mcp:test                    # prove the 9-server topology end to end

# an episode over the per-system stack:
node sim/run-simulation.mjs --task task_127 --engine deepseek-chat --mcp multi

# interactive: .mcp.json registers all 9 servers with Claude Code
```

The measurement default stays `bridge` so leaderboard protocol never changes
implicitly; switch a run with `--mcp multi` (recorded per episode as
`mcpMode` for provenance).
