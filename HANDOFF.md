# Handoff

State of the world, what is in flight, and what to do next. Read
[`DELIVERY.md`](DELIVERY.md) for what this project *is*; this file is for
picking the work back up.

## Where things stand

| | |
|---|---|
| Canonical world | `world/blobfish/world-v14.json` — 288 tasks, 99 tools, 72 tables, **288/288 oracle**, 0 lint flags |
| Corpus | `world/corpus/ch` — Harvey's Calderwood & Harkness: 9,288 files, 266 matters, 46 clients, ~534M chars |
| Ported benchmarks | 543 tasks — C&H 250, LegalBench 160, MAUD 92, CUAD 41 (`docs/PARITY.md`, 23.5%) |
| Generated | 726 tasks over the corpus with **computed** ground truth (`world/blobfish/corpus-wave-tasks.json`) |
| **Runnable total** | **1,557** |
| Harbor | `dist/harbor`, regenerate with `python3 world/local/export_harbor.py` |

## In flight when this was written

`sim/run-firm-knowledge.mjs` is measuring Harvey's 250 C&H tasks on
deepseek-chat (79/201 complete). It resumes safely — episodes with real tool
calls are kept, zero-call records are re-run:

```bash
python3 world/local/server.py --world world/blobfish/world-v14.json \
    --v2-contracts mcp/v3/contracts --port 8791 &
node sim/run-firm-knowledge.mjs --engine deepseek-chat --grading deterministic \
    --limit 999 --max-turns 40 --concurrency 6
```

**Do not run `pkill -f server.py` while a run is live.** That is how 186
fabricated failures were produced (`docs/AUDIT.md`, defect 11). The runner now
aborts rather than recording them, but the run still dies.

## The finding to build on

The same model is **over-cautious on extraction and over-eager on retrieval**,
and no rubric of required criteria can see the second half.

- CUAD: 0 fabricated clauses out of 137 impossible instances, but 75
  over-abstentions — it never invents, it declines too often.
- C&H and the generated waves: recall is decent, precision is a third of it.
  `cw_0257` returned **142 matters where 40 qualify** — recall 100, precision
  28, and an **all-pass PASS** under Harvey's grading.

Per generator kind on the 15-task stratified sample:

| kind | recall | precision | over-included |
|---|---|---|---|
| conjunction | 88 | **23** | 191 |
| exclusion | 86 | 42 | 76 |
| superlative | 100 | 63 | 3 |
| client_roll | 33 | 33 | 3 |
| **structural** | **13** | **5** | 85 |

`structural` is the hardest by a distance and `conjunction` produces the worst
over-inclusion. Both are worth expanding; `superlative` is nearly solved and
should be grown or dropped.

## Next steps, in order

1. **Finish the C&H run**, then `node sim/triage-new-families.mjs` and compare
   against Harvey's published baselines. Ours is deterministic and theirs is
   judged, so the comparable claim is about *shape*, not the number.
2. **Triage the 726 generated tasks** at scale (the 15-task sample above is a
   pilot). Keep the flaky band, grow what passes, retire what nothing can do.
   ~$0.9/task, so a 100-task stratified run is ~$90.
3. **Verify `structural` before trusting it.** 13% recall may be a genuinely
   hard family or a mis-specified one — check by hand whether the folder
   taxonomy in `index.sqlite` matches what an agent can actually observe
   through `corpus_files_list`. This is exactly the shape of defects 8 and 9.
4. **Port more sources.** `world/port/adapters/` — one file per repo answering
   five questions (tasks, seeded data, tools, verifier, workflow). ACORD is the
   best next candidate: it ships graded relevance judgments, the only source
   here that natively measures the precision/recall trade.
5. **A judge, if LAB's 1,760 practice tasks matter.** They sit at 0% parity by
   design — prose rubrics, no deterministic key. Everything else here is
   judge-free and that is the project's main claim, so add one deliberately and
   keep its scores in a separate column.

## Things that will bite you

- `--v2-contracts mcp/v3/contracts` is **required** when serving, or ~15 v3
  tasks fail with confusing product-table errors. Cost me two false alarms.
- `world/corpus/ch` and `research/repos` are gitignored (7.6 GB combined).
  Rebuild: `bash research/clone-repos.sh` then
  `python3 world/corpus/build-corpus-index.py --src research/repos/harveyai@harvey-labs/tasks/firm-knowledge/dms`.
  Exact commits are pinned in `research/repos-commits.json`.
- Intermediate world snapshots were deleted; `world/blobfish/LINEAGE.md` has the
  command that regenerates each.
- Disk fills fast. The clones were 10 GB before `.git` was dropped.

## The discipline that found eleven defects

Every number is a claim about a harness until proven otherwise. In this project
that produced: a wrong answer key caught by a model disagreeing (defect 8), a
grader that scored `Option A:` as wrong when gold was `A` and suppressed
LegalBench by 37 points (9), a runner that ran every bundle 8× (10), and a
runner that fabricated 186 failures when its world died (11).

The cheapest check that catches most of them: **does the full run agree with its
own pilot?** C&H came back at a twelfth of its pilot's recall, and that single
comparison was the tell.
