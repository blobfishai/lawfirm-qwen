# Path-rule rescore — verdicts superseded by the ordering correction

`required_workflow_path` no longer grades the ordering of *read* checkpoints against each other;
it grades writes in declared order and every read before the write it justifies
(`world/expansion/fix-path-ordering.mjs`). The assertion is a pure function of the trace's tool
sequence, so unlike the seed-baseline quarantine its outcome is recomputable offline exactly —
these are corrections, not estimates.

**9 archived failures satisfy the corrected rule with no other failed condition** —
their recorded FAIL is wrong under the rule the world now ships. 
145 path failures stand.

| Episode | Task | Model |
|---|---|---|
| `traces/deepseek-chat/failed/task_001-t1.json` | task_001 | deepseek-chat |
| `traces/deepseek-chat/failed/task_002-t2.json` | task_002 | deepseek-chat |
| `traces/deepseek-chat/failed/task_002-t3.json` | task_002 | deepseek-chat |
| `traces/deepseek-chat/failed/task_113-t3.json` | task_113 | deepseek-chat |
| `traces/deepseek-chat/failed/task_114-t2.json` | task_114 | deepseek-chat |
| `traces/deepseek-chat/failed/task_115-t1.json` | task_115 | deepseek-chat |
| `traces/deepseek-chat/failed/task_116-t1.json` | task_116 | deepseek-chat |
| `traces/deepseek-chat/failed/task_116-t3.json` | task_116 | deepseek-chat |
| `traces/deepseek-chat/failed/task_v3_006-t3.json` | task_v3_006 | deepseek-chat |

### Path now satisfied, but the episode still fails on other conditions

| Episode | Task | Still failing |
|---|---|---|
| `traces/deepseek-chat/failed/task_v3_015-t1.json` | task_v3_015 | pm_notes_new_row_matter_id_is_3.0, pm_notes_new_row_matter_id_is_15.0 |
