# Quarantined verdicts — archived episodes that are not evidence

107 of the archived episodes carry a verdict that contradicts itself: the verifier's
own `reads_before_writes` assertion reports `writes=0` while its `state_changed` /
`rows_inserted_into_*` assertions credit a state change. They were scored before the runtime
captured its verification baseline *after* applying each task's seed bundle, so rows the seed
inserted were attributed to the agent.

**34 of them were recorded as passes** — that is
false credit, and those episodes are excluded from every rate rather than counted.

The runtime is fixed (`baseline_for()` snapshots the session database after seeding) and verified:
an empty episode on task_038 now fails `state_changed` with "NO state change — agent did nothing"
and `rows_inserted_into_matter_documents` with `267 -> 267 rows`. These traces predate that fix.

Traces record steps and verdicts but **not world state**, so they cannot be re-scored offline.
A valid verdict requires re-running the episode.

| Model | Episodes | Recorded as pass |
|---|---|---|
| claude-haiku-4-5 | 101 | 34 |
| deepseek-chat | 4 | 0 |
| deepseek-chat@dual-surface | 2 | 0 |

## Affected episodes

| Episode | Task | Recorded |
|---|---|---|
| `traces/claude-haiku-4-5/passed/task_098-t1.json` | task_098 | pass |
| `traces/claude-haiku-4-5/passed/task_098-t2.json` | task_098 | pass |
| `traces/claude-haiku-4-5/passed/task_098-t3.json` | task_098 | pass |
| `traces/claude-haiku-4-5/passed/task_099-t1.json` | task_099 | pass |
| `traces/claude-haiku-4-5/passed/task_099-t2.json` | task_099 | pass |
| `traces/claude-haiku-4-5/passed/task_099-t3.json` | task_099 | pass |
| `traces/claude-haiku-4-5/passed/task_100-t1.json` | task_100 | pass |
| `traces/claude-haiku-4-5/passed/task_100-t2.json` | task_100 | pass |
| `traces/claude-haiku-4-5/passed/task_100-t3.json` | task_100 | pass |
| `traces/claude-haiku-4-5/passed/task_101-t1.json` | task_101 | pass |
| `traces/claude-haiku-4-5/passed/task_101-t2.json` | task_101 | pass |
| `traces/claude-haiku-4-5/passed/task_101-t3.json` | task_101 | pass |
| `traces/claude-haiku-4-5/passed/task_102-t1.json` | task_102 | pass |
| `traces/claude-haiku-4-5/passed/task_102-t2.json` | task_102 | pass |
| `traces/claude-haiku-4-5/passed/task_104-t1.json` | task_104 | pass |
| `traces/claude-haiku-4-5/passed/task_104-t2.json` | task_104 | pass |
| `traces/claude-haiku-4-5/passed/task_104-t3.json` | task_104 | pass |
| `traces/claude-haiku-4-5/passed/task_105-t1.json` | task_105 | pass |
| `traces/claude-haiku-4-5/passed/task_105-t2.json` | task_105 | pass |
| `traces/claude-haiku-4-5/passed/task_105-t3.json` | task_105 | pass |
| `traces/claude-haiku-4-5/passed/task_106-t1.json` | task_106 | pass |
| `traces/claude-haiku-4-5/passed/task_106-t2.json` | task_106 | pass |
| `traces/claude-haiku-4-5/passed/task_106-t3.json` | task_106 | pass |
| `traces/claude-haiku-4-5/passed/task_107-t1.json` | task_107 | pass |
| `traces/claude-haiku-4-5/passed/task_107-t2.json` | task_107 | pass |
| `traces/claude-haiku-4-5/passed/task_107-t3.json` | task_107 | pass |
| `traces/claude-haiku-4-5/passed/task_108-t1.json` | task_108 | pass |
| `traces/claude-haiku-4-5/passed/task_108-t2.json` | task_108 | pass |
| `traces/claude-haiku-4-5/passed/task_109-t1.json` | task_109 | pass |
| `traces/claude-haiku-4-5/passed/task_109-t2.json` | task_109 | pass |
| `traces/claude-haiku-4-5/passed/task_109-t3.json` | task_109 | pass |
| `traces/claude-haiku-4-5/passed/task_111-t2.json` | task_111 | pass |
| `traces/claude-haiku-4-5/passed/task_111-t3.json` | task_111 | pass |
| `traces/claude-haiku-4-5/passed/task_112-t3.json` | task_112 | pass |
| `traces/claude-haiku-4-5/failed/task_038-t1.json` | task_038 | fail |
| `traces/claude-haiku-4-5/failed/task_038-t2.json` | task_038 | fail |
| `traces/claude-haiku-4-5/failed/task_040-t1.json` | task_040 | fail |
| `traces/claude-haiku-4-5/failed/task_040-t3.json` | task_040 | fail |
| `traces/claude-haiku-4-5/failed/task_042-t1.json` | task_042 | fail |
| `traces/claude-haiku-4-5/failed/task_042-t2.json` | task_042 | fail |
| `traces/claude-haiku-4-5/failed/task_043-t1.json` | task_043 | fail |
| `traces/claude-haiku-4-5/failed/task_045-t2.json` | task_045 | fail |
| `traces/claude-haiku-4-5/failed/task_048-t1.json` | task_048 | fail |
| `traces/claude-haiku-4-5/failed/task_048-t2.json` | task_048 | fail |
| `traces/claude-haiku-4-5/failed/task_049-t1.json` | task_049 | fail |
| `traces/claude-haiku-4-5/failed/task_049-t2.json` | task_049 | fail |
| `traces/claude-haiku-4-5/failed/task_050-t2.json` | task_050 | fail |
| `traces/claude-haiku-4-5/failed/task_051-t2.json` | task_051 | fail |
| `traces/claude-haiku-4-5/failed/task_052-t2.json` | task_052 | fail |
| `traces/claude-haiku-4-5/failed/task_052-t3.json` | task_052 | fail |
| `traces/claude-haiku-4-5/failed/task_054-t1.json` | task_054 | fail |
| `traces/claude-haiku-4-5/failed/task_054-t2.json` | task_054 | fail |
| `traces/claude-haiku-4-5/failed/task_054-t3.json` | task_054 | fail |
| `traces/claude-haiku-4-5/failed/task_055-t1.json` | task_055 | fail |
| `traces/claude-haiku-4-5/failed/task_055-t3.json` | task_055 | fail |
| `traces/claude-haiku-4-5/failed/task_056-t1.json` | task_056 | fail |
| `traces/claude-haiku-4-5/failed/task_056-t2.json` | task_056 | fail |
| `traces/claude-haiku-4-5/failed/task_056-t3.json` | task_056 | fail |
| `traces/claude-haiku-4-5/failed/task_057-t2.json` | task_057 | fail |
| `traces/claude-haiku-4-5/failed/task_057-t3.json` | task_057 | fail |
| `traces/claude-haiku-4-5/failed/task_058-t3.json` | task_058 | fail |
| `traces/claude-haiku-4-5/failed/task_059-t1.json` | task_059 | fail |
| `traces/claude-haiku-4-5/failed/task_059-t2.json` | task_059 | fail |
| `traces/claude-haiku-4-5/failed/task_061-t1.json` | task_061 | fail |
| `traces/claude-haiku-4-5/failed/task_061-t2.json` | task_061 | fail |
| `traces/claude-haiku-4-5/failed/task_062-t1.json` | task_062 | fail |
| `traces/claude-haiku-4-5/failed/task_062-t2.json` | task_062 | fail |
| `traces/claude-haiku-4-5/failed/task_062-t3.json` | task_062 | fail |
| `traces/claude-haiku-4-5/failed/task_117-t3.json` | task_117 | fail |
| `traces/claude-haiku-4-5/failed/task_118-t1.json` | task_118 | fail |
| `traces/claude-haiku-4-5/failed/task_118-t2.json` | task_118 | fail |
| `traces/claude-haiku-4-5/failed/task_118-t3.json` | task_118 | fail |
| `traces/claude-haiku-4-5/failed/task_119-t1.json` | task_119 | fail |
| `traces/claude-haiku-4-5/failed/task_119-t2.json` | task_119 | fail |
| `traces/claude-haiku-4-5/failed/task_119-t3.json` | task_119 | fail |
| `traces/claude-haiku-4-5/failed/task_120-t2.json` | task_120 | fail |
| `traces/claude-haiku-4-5/failed/task_121-t1.json` | task_121 | fail |
| `traces/claude-haiku-4-5/failed/task_121-t2.json` | task_121 | fail |
| `traces/claude-haiku-4-5/failed/task_121-t3.json` | task_121 | fail |
| `traces/claude-haiku-4-5/failed/task_122-t1.json` | task_122 | fail |
| `traces/claude-haiku-4-5/failed/task_122-t2.json` | task_122 | fail |
| `traces/claude-haiku-4-5/failed/task_122-t3.json` | task_122 | fail |
| `traces/claude-haiku-4-5/failed/task_123-t3.json` | task_123 | fail |
| `traces/claude-haiku-4-5/failed/task_124-t1.json` | task_124 | fail |
| `traces/claude-haiku-4-5/failed/task_124-t2.json` | task_124 | fail |
| `traces/claude-haiku-4-5/failed/task_124-t3.json` | task_124 | fail |
| `traces/claude-haiku-4-5/failed/task_125-t1.json` | task_125 | fail |
| `traces/claude-haiku-4-5/failed/task_125-t2.json` | task_125 | fail |
| `traces/claude-haiku-4-5/failed/task_126-t1.json` | task_126 | fail |
| `traces/claude-haiku-4-5/failed/task_126-t3.json` | task_126 | fail |
| `traces/claude-haiku-4-5/failed/task_127-t1.json` | task_127 | fail |
| `traces/claude-haiku-4-5/failed/task_127-t2.json` | task_127 | fail |
| `traces/claude-haiku-4-5/failed/task_127-t3.json` | task_127 | fail |
| `traces/claude-haiku-4-5/failed/task_128-t1.json` | task_128 | fail |
| `traces/claude-haiku-4-5/failed/task_128-t2.json` | task_128 | fail |
| `traces/claude-haiku-4-5/failed/task_128-t3.json` | task_128 | fail |
| `traces/claude-haiku-4-5/failed/task_129-t1.json` | task_129 | fail |
| `traces/claude-haiku-4-5/failed/task_129-t3.json` | task_129 | fail |
| `traces/claude-haiku-4-5/failed/task_130-t1.json` | task_130 | fail |
| `traces/claude-haiku-4-5/failed/task_130-t2.json` | task_130 | fail |
| `traces/claude-haiku-4-5/failed/task_130-t3.json` | task_130 | fail |
| `traces/deepseek-chat/failed/task_251-t3.json` | task_251 | fail |
| `traces/deepseek-chat/failed/task_252-t1.json` | task_252 | fail |
| `traces/deepseek-chat/failed/task_252-t2.json` | task_252 | fail |
| `traces/deepseek-chat/failed/task_252-t3.json` | task_252 | fail |
| `traces/deepseek-chat@dual-surface/failed/task_246-t1.json` | task_246 | fail |
| `traces/deepseek-chat@dual-surface/failed/task_252-t2.json` | task_252 | fail |
