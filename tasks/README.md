# tasks/ — one folder per task: definition, verifier, and its own seed bundle

Materialized from `world/blobfish/world-v14.json` by `node sim/build-catalog.mjs`
(seed bundles derived by `world/expansion/derive-task-seeds.mjs`). Do not edit directly.

```
tasks/task_NNN/
  task.json                 the task definition (prompt, walk, provenance, labels)
  verifier.py               the shipped VCode verifier, verbatim
  seed/
    documents/*.md          seeded documents (header marks INPUT vs distractor vs cluster)
    input-documents.json    the special input documents the task must read in full
    core-data.json          special core data: entity rows the task references/mutates
    mcp.json                special MCP seeding: which system server owns which seeded data
```

The runtime applies a task's bundle to its session at creation (`world/local/server.py` task-aware sessions; sessions carry `task_id`).
