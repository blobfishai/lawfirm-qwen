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

Nothing is running. **The C&H deterministic set is complete: 201/201 on
deepseek-chat.** Total spend for the final 68 tasks was $59.12.

The denominator is 201 and always was: the bank's `taskList` holds 250, split
`deterministic` 201 / `mixed` 42 / `judge_only` 7, and `--grading
deterministic` selects the 201. A `taskList`-length count says 250 and is
wrong for this run — count within the grading class, as the snippet in
"Things that will bite you" now does.

| | |
|---|---|
| all-pass | 64/201 (32%) |
| mean recall | 46.5 |
| mean precision | 33.1 (defined on the 132 that returned anything) |
| returned nothing | 69 (34%) |
| turn-exhausted | 58 (29%) |
| over-included, total | 1,195 |
| **saw `has_more`** | **201 (all of them)** |
| **stopped anyway** | **103 (51%)** |

The last two rows are the result worth carrying. `server.py` answers every
page with plain language — *"You have NOT seen every match — call again with
offset=N"* — and the model read that on all 201 tasks and stopped early on
half of them. That is not a retrieval-quality finding that a recall number can
express; the harness stated the incompleteness outright and was ignored.

The 42 `mixed` tasks are still unrun and are the obvious next measurement:
same corpus, same tools, but their criteria are part prose, so they test
whether the deterministic story survives contact with rubric grading.

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
| ~~structural~~ | ~~13~~ | ~~5~~ | ~~85~~ |

**Do not quote the `structural` row.** It is not a model measurement — a third
of that family has answer keys derived from filenames rather than the folder
index, three of the four tasks sampled here were from that broken third, and a
*perfect* agent scores 0/11 on them. See `docs/AUDIT.md` Bug 12. The sound
21 tasks are answerable in a median of 3 tool calls, so the family's real
difficulty is unknown until it is re-run.

`conjunction` produces the worst over-inclusion and is worth expanding.
`superlative` is nearly solved and should be grown or dropped.

## Next steps, in order

1. ~~Finish the C&H run, then `node sim/triage-new-families.mjs`.~~ **Both
   done.** The run is 201/201 (above). The triage was reading the deleted
   `world-v13.json` and had been dying on ENOENT before printing anything; it
   now takes `--world` and defaults to v14, which carries all 56 of the
   `task_271..326` family tasks it inspects. Current verdict: **56 tasks,
   198/223 episodes passed (88.8), too-hard 0, FLAKY 6, too-easy 50** —
   written to `docs/TRIAGE-NEW-FAMILIES.md`. 50 of 56 sitting in "too easy"
   is the calibration signal to act on. What is still open is the comparison
   against Harvey's published baselines; ours is deterministic and theirs is
   judged, so the comparable claim is about *shape*, not the number.
2. **Triage the 726 generated tasks** at scale (the 15-task sample above is a
   pilot). Keep the flaky band, grow what passes, retire what nothing can do.
   ~$0.9/task, so a 100-task stratified run is ~$90.
3. ~~Verify `structural` before trusting it.~~ **Done, and repaired.**
   `docs/AUDIT.md` Bug 12 has the evidence. 11 of 32 tasks are keyed off
   filenames and unanswerable by any strategy; the other 21 are exactly
   answerable in a median of 3 calls. The 11 are now `quarantined` in the bank
   and skipped by `run-firm-knowledge.mjs` (`--all` overrides).

   Every family was audited the same way and the rest are **sound**:
   `conjunction`, `exclusion`, `client_roll` and `superlative` all reproduce
   their keys element-for-element from `corpus_search` semantics (12 of 12
   sampled), and the index matches the corpus on disk exactly — 9,288 files
   both ways, no zero-char rows, no parse errors. Paging cost is low too: the
   heaviest sampled term needs 5 pages at `limit=200`, so these are tractable
   inside 40 turns. Structural was the only family keyed off something the
   agent cannot query. The whole audit cost nothing but sqlite queries and one
   corpus scan.

   **`structural` has not been re-measured** — its difficulty is genuinely
   unknown, not 13%. That re-run is the cheap thing to do before step 2.
4. **Port more sources.** `world/port/adapters/` — one file per repo answering
   five questions (tasks, seeded data, tools, verifier, workflow). ACORD is the
   best next candidate: it ships graded relevance judgments, the only source
   here that natively measures the precision/recall trade.
5. **A judge, if LAB's 1,760 practice tasks matter.** They sit at 0% parity by
   design — prose rubrics, no deterministic key. Everything else here is
   judge-free and that is the project's main claim, so add one deliberately and
   keep its scores in a separate column.

## Things that will bite you

- Progress counts in this file go stale, and the obvious count is wrong.
  `taskList` is 250, but a run is scoped by `--grading`, so the denominator is
  201 for `deterministic` and 42 for `mixed`. Count *within the class you are
  running*, treating a task as done only when its episode made tool calls —
  the same rule the runner's resume uses (`run-firm-knowledge.mjs:249-252`):

  ```bash
  python3 -c "
  import json, glob
  CLASS = 'deterministic'   # or 'mixed'
  ids = {t['task_id'] for t in
         json.load(open('world/blobfish/firm-knowledge-tasks.json'))['taskList']
         if t['grading'] == CLASS}
  done = {d['task_id'] for f in glob.glob('data/firm-knowledge/deepseek-chat/fk_*.json')
          for d in [json.load(open(f))] if d.get('tool_calls', 0) > 0} & ids
  print(f'{CLASS}: {len(done)}/{len(ids)} done, {len(ids - done)} remaining')"
  ```

- A dropped API connection records as a **graded zero, not an error**. `fk_201`
  came back `recall 0` with `error: "TypeError: terminated"`, `tool_calls: 0`
  and empty `usage`; re-run untouched it scores **recall 100 / precision 100**.
  Nothing in the aggregate distinguishes that from a genuine miss, so the
  zero-call rule is not hygiene — it is the thing standing between you and
  defect 11. Never commit a zero-call record, and re-run it before believing
  any number computed over it.
- `data/firm-knowledge/<engine>/_summary.json` is **not** a summary of that
  directory. The runner overwrites it with the results of its last invocation
  only, whatever family those were — right now it holds 15 `cw_*` records from
  the generated-wave pilot, sitting in a directory otherwise full of `fk_*`
  results. Read the per-task files, not this.
- `oracle.py --world` defaults to `world/blobfish/world.json`, the retired
  156-task world — **always pass `--world world/blobfish/world-v14.json`**.
  Driving the old task list against a v14 server reports 117/156 with 39
  `oracle_error` 404s, which reads exactly like a broken world and is not one.
  The correct invocation is 288/288:
  `python3 world/local/oracle.py --base http://127.0.0.1:8791 --world world/blobfish/world-v14.json`
- `--v2-contracts mcp/v3/contracts` is **required** when serving, or ~15 v3
  tasks fail with confusing product-table errors. Cost me two false alarms.
- `world/corpus/ch` and `research/repos` are gitignored (4.5 GB combined).
  Rebuild: `bash research/clone-repos.sh` then
  `python3 world/corpus/build-corpus-index.py --src research/repos/harveyai@harvey-labs/tasks/firm-knowledge/dms`.
- **`world/corpus/ch` is not scratch — do not delete it to free space.**
  `world/local/server.py` reads `index.sqlite` and serves document bodies out
  of `text/` at request time, so every C&H and generated task fails without it.
  It is also the *only* copy: rebuilding means re-cloning 3.2 GB of harvey-labs.
- The rebuild is **not byte-exact**. `clone-repos.sh` does `--depth 1` clones of
  whatever HEAD is today; it does not check out
  `research/repos-commits.json`, and the clones' `.git` dirs were dropped to
  save space, so nothing is restorable locally. Treat that file as a *record*
  of what was cloned, not as a restore mechanism.
- `research/repos/_extracted/{cuad,maud}` looks like scratch and is not:
  `world/port/adapters/{cuad,maud}.mjs` read it, and `parity-audit.mjs` runs
  those adapters to produce the 23.5% figure in `docs/PARITY.md`. Delete it and
  the parity claim silently degrades to "data missing".
- `world/local/state/<world-slug>/` is a regenerated per-task-seed baseline
  cache. Stale slugs are safe to delete; only the slug matching the world you
  serve (`world-v14-with-v2`) is live. It reached 1.5 GB across 28 dead world
  versions before being pruned.
- Intermediate world snapshots were deleted; `world/blobfish/LINEAGE.md` has the
  command that regenerates each.
- Disk fills fast. The clones were 10 GB before `.git` was dropped.
- `research/repos-manifest.tsv` now over-reports: `shmsoft@FreeEed`,
  `freelawproject@juriscraper` and `zeweihan@aiworkdeck` were deleted as
  unreferenced (no generator or adapter reads them). Re-running
  `clone-repos.sh` restores the first two; `aiworkdeck` was never in that
  script and must be cloned by hand from `repos-commits.json`.
- `harveyai@harvey-labs/tasks/diligence` is 2.0 GB and the largest thing still
  on disk. It is kept because `research/extract-lab-corpus.mjs` walks it and
  the LAB judge work below depends on it — drop it only if that work is off
  the table.

## The discipline that found eleven defects

Every number is a claim about a harness until proven otherwise. In this project
that produced: a wrong answer key caught by a model disagreeing (defect 8), a
grader that scored `Option A:` as wrong when gold was `A` and suppressed
LegalBench by 37 points (9), a runner that ran every bundle 8× (10), and a
runner that fabricated 186 failures when its world died (11).

The cheapest check that catches most of them: **does the full run agree with its
own pilot?** C&H came back at a twelfth of its pilot's recall, and that single
comparison was the tell.
