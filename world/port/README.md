# world/port — the repo→world porting pipeline

A repeatable process for consuming a domain repo and reproducing its **tasks,
seeded data, tools, workflow and verifier** inside the simulation world.

This exists because the first two ports (Harvey C&H, LegalBench) were written by
hand, one importer each, and that does not scale to 46 repos. `docs/PARITY.md`
is the scoreboard it feeds.

## The five things a port must extract

A benchmark is portable when we can answer all five. An adapter that cannot
answer one declares it `null`, and the porter records the gap rather than
inventing it.

| | What it is | Where it usually lives |
|---|---|---|
| **tasks** | the instruction the agent receives | `task.json`, `*.tsv` rows, `prompts/` |
| **seeded data** | documents/records the task reads | `documents/`, `dms/`, corpus dirs |
| **tools** | the surface the agent acts through | implied by the task (filesystem, DMS, classification = none) |
| **verifier** | how the ground truth is checked | rubric criteria, `answer` columns, gold files |
| **workflow** | the reference walk, if the source defines one | `walk`, reference solutions, ordered steps |

## The porting contract

An adapter is one file under `world/port/adapters/` exporting:

```js
export const meta = {
  id: "legalbench",                    // stable key, used in PARITY.md
  repo: "HazyResearch@legalbench",     // directory under research/repos/
  license: "MIT",
};

/** @returns {PortBundle} */
export function port(repoDir) { … }
```

A `PortBundle` is uniform across every source:

```js
{
  source:    { repo, commit, path, license },
  tasks:     [{ id, prompt, split?, instances?, expected?, provenance }],
  documents: [{ title, doc_type, body }] | { external_store: "world/corpus/x" },
  tools:     ["corpus_search", …] | [],          // [] = no tool surface needed
  grading:   { kind: "deterministic" | "mixed" | "judge",
               key: …,                            // what the verifier compares
               ungraded: n },                      // criteria we do NOT grade
  gaps:      [{ what, why }],                      // declared, never hidden
}
```

## Why `grading.kind` matters more than task count

Porting a benchmark is only worth it if we can *check* the answer. Three kinds:

- **deterministic** — the source's ground truth is a value we can compare
  (a label column, a matter id in the rubric text, an exact figure). No judge,
  no variance, reproducible by anyone. This is where this world is strongest.
- **mixed** — some criteria are deterministic, the rest are prose. We grade the
  deterministic portion and report the remainder as **ungraded**, never as
  passed. C&H is 2,515 of 2,623 criteria deterministic; the other 108 are
  reported ungraded.
- **judge** — irreducibly prose. We record it and do not pretend to score it.

## Adaptations must be disclosed

LegalBench's prompts end in `A:` because they target *completion* models. A chat
model answers in prose — "the clause **requires consent**" where the gold label
is `Yes` — which is correct and unscoreable, and put every `cuad_*` task at 0%.
The fix is a one-line output constraint, which changes how the answer is
expressed and not what is asked. Any such adaptation goes in
`bundle.source.adaptations` and is printed with the score.

## Running it

```bash
node world/port/port.mjs                 # run every adapter, write bundles
node world/port/port.mjs --id legalbench # one source
node world/expansion/parity-audit.mjs    # scoreboard
```

Bundles land in `world/port/bundles/<id>.json` and are what the world hosts.
