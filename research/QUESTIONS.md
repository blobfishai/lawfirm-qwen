# The question set — what we must understand before building anything

Research here is **not one-shot**. It is a set of questions, each answered in
its own document under `research/answers/`, each answer carrying evidence that
points at a **file in a repo on disk** (`research/repos/`, manifest at
`research/repos-manifest.tsv`).

**Why file-level evidence and not links.** The previous sweep produced
`data/research/domain-registry.json` — 101 items, every one with a URL, none of
them downloaded. Nothing in it could be checked. A claim like "diligence review
is a common task family" was, in practice, a claim about my own priors wearing a
citation. The rule now: an answer that cannot name a path and a line is a
hypothesis, and is labelled as one.

## Status legend

- `answered` — evidence from a cloned repo, cited by path
- `partial` — some evidence on disk, some still inferred (the inferred part is marked)
- `open` — not yet answered
- `blocked` — cannot be answered from available sources; the reason is recorded

## A. The domain and its value

| # | Question | Status |
|---|---|---|
| A1 | What work does a law firm actually sell, and which parts of it are agent-addressable? | open |
| A2 | Where is the money — which tasks carry billable weight, and which are cost centres the firm wants automated? | open |
| A3 | What does the firm risk when an agent is wrong? (the asymmetry that shapes every verifier) | open |

## B. The people

| # | Question | Status |
|---|---|---|
| B1 | Who are the stakeholders in a matter, and what is each one's authority to act? | open |
| B2 | Which role performs each task type, and which role must approve it? | open |
| B3 | What does a handoff between roles look like, and what travels with it? | open |

## C. The work

| # | Question | Status |
|---|---|---|
| C1 | What are the task families, taken from evals and from automation repos rather than invented? | [partial](answers/C1-task-families.md) |
| C2 | For each family: what are the **input documents**, and what does the agent have to extract from them? | open |
| C3 | What is "done"? What does the firm check before a deliverable leaves the building? | [answered](answers/C3-definition-of-done.md) |
| C4 | What are the variations within a family — what makes one instance harder than another? | [answered](answers/C4-task-variations.md) |

## D. The systems

| # | Question | Status |
|---|---|---|
| D1 | Which products does this domain actually run on, and who are the competitors in each category? | open |
| D2 | For each product: what does its real API/MCP surface look like — endpoints, envelopes, auth, pagination? | open |
| D3 | Where does the same fact live in more than one system, and what makes them disagree? | open |
| D4 | What does a GitHub workflow of someone *actually using* these APIs look like — call order, error handling, retries? | open |

## E. The chaos (this is what makes tasks real)

| # | Question | Status |
|---|---|---|
| E1 | What goes wrong in practice — stale data, duplicate records, missing signatures, superseded authority? | open |
| E2 | Which questions require reconciling multiple systems to answer at all? | open |
| E3 | What does the domain consider a *forbidden* answer — where is abstention the correct output? | open |

---

## How each answer is judged (Rule 2)

An answer, and every artifact derived from it (tool, table, task, mock
document), is judged before it ships:

1. **Grounding** — does the claim cite a path in `research/repos/`?
2. **Faithfulness** — does the cited file actually say that? (the judge reads it)
3. **Consequence** — does the artifact derived from it differ from what we would
   have built without the evidence? An artifact that would be identical either
   way is not evidence-driven, whatever it cites.

Test 3 is the one that matters. It is easy to attach a citation to a decision
already made; the judge's job is to catch that.
