# C3 — What is "done"? What does the firm check before a deliverable leaves?

**Status:** answered from the automation corpus on disk.

**Evidence:** `research/repos/CSlawyer1985@legal-ZH`, 175 `SKILL.md` files.
Guard detection in `research/extract-skill-inventory.mjs`; counts in
`research/answers/data/skill-inventory.json`.

---

## "Done" is not "the document exists"

Every shipped skill wraps its output in guardrails, and the guardrails recur
across practice areas with enough regularity to read as a house standard:

| Guard | Skills | What it requires |
|---|---|---|
| gap disclosure | 55 | sources the skill could not reach are **named in the output**, not silently omitted |
| versioning + diff | 53 | if a prior version exists, increment and present a diff summary |
| human confirmation | 51 | the skill stops and asks before finalizing |
| source attribution | 28 | every assertion carries its source; unsourced ones are tagged |
| confidentiality gate | 17 | privilege screen runs **before** extraction, with an abort branch |
| posture dependence | 14 | the answer depends on which side the firm acts for |

### The source-attribution rule, verbatim in effect

`litigation-legal/skills/chronology/SKILL.md` requires every chronology entry to
be tagged with where it came from, and any entry *not* traceable to an extracted
file to carry an inline marker — web-retrieved *(needs re-check)*, model
knowledge *(needs verification)*, or user-provided — and states that the labels
must not be deleted or compressed.

That is a fabrication guard written into the working procedure, by
practitioners, before anyone was benchmarking it. It is the same thing our
verifiers call `required_documents_read` and the fabrication traps — which is
the strongest external validation the world's grading model has received.

### The confidentiality gate

`chronology` runs a step 0 before any extraction: are these sources already
privilege-screened? Three branches — all clean (extract without markers), mixed
or unscreened (extract *and* mark every entry), or **abort and screen first**.

The third branch matters. "Refuse to proceed and say why" is a first-class
correct outcome in the real workflow. Our world already grades abstention on
fabrication traps; it does not grade *procedural* abstention — stopping because
a precondition is unmet.

## What this changes about our world

1. **Gap disclosure is the single most common guard (55 skills) and we do not
   grade it at all.** Our tasks grade what the agent *found*; the corpus grades
   whether the agent *declared what it could not reach*. A task where one
   referenced document is deliberately unreachable, and the deliverable must
   name the gap, is directly supported by the outcome grammar we already have
   (a pinned field on the created row) and is absent from all 270 tasks.
2. **Versioning/diff (53 skills)** implies the second-run case: the artifact
   already exists, and "done" means an incremented version plus a diff. Every
   one of our tasks starts from a state where the deliverable does not yet
   exist.
3. **Human confirmation (51 skills)** is not directly hostable single-agent —
   this belongs with the multi-party structural gap already recorded in
   `docs/COVERAGE.md`.

## The honest caveat

These counts come from regex guard-detection over prose in Chinese and English
(`GUARDS` in the extractor). They are a reliable signal of *presence* and a weak
signal of *strength* — a skill that mentions 缺口 ("gap") once is counted the
same as one that structures its output around a gap section. The three findings
above were each confirmed by reading the cited skill, not by the count alone.
