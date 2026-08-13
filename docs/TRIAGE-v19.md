# Triage — world-v19

> Difficulty labels come only from three model episodes on this exact world version. Oracle success and task metadata are never substituted for missing measurements.

- Tasks fully measured: **0/2324**
- Usable episodes: **856/6972**
- Complete: **no**
- Episode source: `data/leaderboard/episodes/deepseek-chat/v19-triage`
- Tool-scope protocol: `all`
- Measurement protocol: `v19-all-tools-fixed50-context-v4`

| Label | Tasks | Rule |
|---|---:|---|
| easy | 0 | 3/3 pass; each run uses ≤ max(3, reference calls + 1) tools |
| medium | 0 | 3/3 pass, but at least one non-trivial call count |
| **boundary** | 0 | mixed result (1/3 or 2/3); headline flaky band |
| hard | 0 | 0/3 with no assertion common to every miss |
| suspect | 0 | 0/3 with a systematic shared failed assertion; audit required |
| unmeasured | 2324 | fewer than 3 usable episodes |

## Gate status

**M7.2 remains open.** 6116 usable episodes are still required. Run:

```bash
node sim/run-leaderboard.mjs --engines deepseek-chat --tasks all --episodes 3 \
  --world-file world/blobfish/world-v19.json --local-base http://127.0.0.1:8988 \
  --label v19-triage \
  --episode-namespace v19-triage --resume --retry-ungraded --compress-episodes \
  --concurrency 32 --tool-scope all --max-cost-usd 1500 --max-episode-cost-usd 5 \
  --min-free-disk-mb 1024 --canary-every 25
python3 tools/triage_world.py --engine deepseek-chat --namespace v19-triage
```

Empirical projection from 856 completed v19 episodes: **$895.65** remaining at $0.1464/episode. This is not a ceiling; the approved planning envelope is $2,000.

### External blocker

DeepSeek returned **HTTP 402 — Insufficient Balance**. The runner halted and counted no failed model episode. Proof: `data/leaderboard/results/deepseek-chat@v19-triage.sweep-health.json`. Recommended top-up from the empirical remainder plus 25% buffer: **$1150**.
