# traces/ — every episode of every measured model, split passed/failed

Materialized from `data/leaderboard/episodes/` (canonical, written by the runner) and
`data/flake/flaky-trajectories.json` (historical hosted pushes) by `node sim/build-catalog.mjs`.

- `claude-haiku-4-5`: 233 passed / 155 failed
- `deepseek-chat`: 410 passed / 55 failed
- `grok-4-5`: 92 passed / 12 failed
- `deepseek-v4-flash-hosted`: 34 passed / 23 failed (historical hosted boundary pushes; NOTE: docs/AUDIT.md reclassified this cohort's dominant failure signature as output-cap truncation, a harness artifact)

Each episode file: full turn-by-turn steps (tool, arguments, argBytes/argParseError, ok,
observation, thought when the API returns one), verifier verdict with per-assertion results,
token usage, cost, and `preRescore` where the contamination audit corrected the verdict.
Human-readable views: docs/evidence/traces.html (exemplars) and docs/evidence/all-failed-traces.html (all failures).
