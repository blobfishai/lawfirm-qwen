# Triage — world-v19

> Difficulty labels come only from three model episodes on this exact world version. Oracle success and task metadata are never substituted for missing measurements.

- Tasks fully measured: **0/2324**
- Usable episodes: **0/6972**
- Complete: **no**
- Episode source: `data/leaderboard/episodes/deepseek-chat/v19-triage`
- Tool-scope protocol: `systems`
- Measurement protocol: `v19-systems-bounded-context-v1`

| Label | Tasks | Rule |
|---|---:|---|
| easy | 0 | 3/3 pass; each run uses ≤ max(3, reference calls + 1) tools |
| medium | 0 | 3/3 pass, but at least one non-trivial call count |
| **boundary** | 0 | mixed result (1/3 or 2/3); headline flaky band |
| hard | 0 | 0/3 with no assertion common to every miss |
| suspect | 0 | 0/3 with a systematic shared failed assertion; audit required |
| unmeasured | 2324 | fewer than 3 usable episodes |

## Gate status

**M7.2 remains open.** 6972 usable episodes are still required. Run:

```bash
node sim/run-leaderboard.mjs --engines deepseek-chat --tasks all --episodes 3 \
  --world-file world/blobfish/world-v19.json --label v19-triage \
  --episode-namespace v19-triage --resume --retry-ungraded --compress-episodes \
  --tool-scope systems --max-cost-usd 1700 --max-episode-cost-usd 10
python3 tools/triage_world.py --engine deepseek-chat --namespace v19-triage
```
