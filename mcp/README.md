# mcp/ — the firm's tool stack as MCP servers

One MCP server per system the firm runs (the realistic topology: a law firm
does not have one god-API; it has a practice-management suite, a docketing
system, a DMS, a billing platform, …). All servers front the same local world
runtime (`world/local/server.py`) — one firm, many frontends. Tool names are
globally unique across systems, so verifier traces are identical regardless
of topology.

| Server | Product (SIMULATED) | Tools |
|---|---|---|
| `practice-management` | LexOperis PM (Clio-class) | 16 — matters, conflicts, ops assistants |
| `litigation-docketing` | CourtDock | 42 — cases, filings, dockets, hearings, courts, deadlines |
| `discovery-platform` | DiscoParse (Relativity-class) | 7 — discovery requests + workflows |
| `billing` | LedgerBill | 9 — invoice reviews, ledgers, billing workflows |
| `dms` | MatterVault (iManage-class) | 4 — matter documents: search, read, draft, retitle |
| `office-suite` | Fieldstone Workspace | 7 — working docs, sheets, calendar, files |
| `hr-directory` | StaffDesk | 9 — employees, departments, assignments |
| `knowledge-assistant` | Cortex Notes | 8 — memory, knowledge, playbooks, schedules |

**102 tools total** — the partition is validated (every world tool in exactly
one system) and integration-tested end to end by `mcp/test-multi-server.mjs`
(spawns all 8, checks the aggregated surface, drives a reference walk across
servers, requires the verifier to pass on the merged trace).

## Files

- `systems.json` — the partition: system → product, description, tool list.
- `serve-system.mjs` — generic per-system stdio MCP server:
  `node mcp/serve-system.mjs --system dms`. Pass `BLOBFISH_SESSION_ID` so
  several servers join one episode; without it each server opens its own
  session (right for interactive exploration).
- `test-multi-server.mjs` — the topology integration test (`npm run mcp:test`).
- `blobfish-lawfirm-bridge.mjs` — the legacy single-surface bridge
  (all 102 tools + `verify_task`/`reset_session` harness tools). Every
  measured episode to date used this surface; it remains the measurement
  default (`sim/run-simulation.mjs --mcp bridge`).

## Using the topologies

```bash
npm run world:serve                 # the world runtime (state substrate)
npm run mcp:test                    # prove the 8-server topology end to end

# an episode over the per-system stack:
node sim/run-simulation.mjs --task task_127 --engine deepseek-chat --mcp multi

# interactive: .mcp.json registers all 8 servers with Claude Code
```

The measurement default stays `bridge` so leaderboard protocol never changes
implicitly; switch a run with `--mcp multi` (recorded per episode as
`mcpMode` for provenance).
