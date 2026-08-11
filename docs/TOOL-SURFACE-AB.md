# Tool-surface A/B — does surface size move the capability boundary?

**Question.** The hardest pack in the world (the eval-anchored ACORD / ObliQA /
LawFlow tasks) scored 43.3 with three tasks at 0/3. One failing trace ended
with the model complaining, in its own words, that a tool "keeps returning
pollution from other tables." Was that a capability boundary, or an artifact
of my serving **two overlapping tool generations at once** (91 legacy tools +
88 v3 product tools = 179), a configuration no real firm would have?

**Design.** Same 10 tasks, same model (deepseek-chat), same world document,
same 3-episode protocol. The only variable is the served tool surface:

| Arm | Server | Tools |
|---|---|---|
| dual-surface | `--world world-v4.json --v2-contracts mcp/v3/contracts` | 179 |
| single-surface | `--world world-v4.json` | 91 |

## Result

On the three tasks that scored 0/3 on the dual surface:

| Task | single-surface (91 tools) | dual-surface (179 tools) |
|---|---|---|
| `lawflow-entity-selection` | **2/3** · ~75 calls · $1.23 | 0/3 · ~74 calls · $1.89 |
| `lawflow-filing-fee-total` | 0/3 · ~62 calls · $1.26 | 0/3 · ~93 calls · $2.56 |
| `lawflow-83b-deadline` | 0/3 · ~89 calls · $2.24 | 0/3 · ~77 calls · $2.16 |
| **total** | **2/9 (22.2)** · **$4.74** | **0/9 (0.0)** · **$6.61** |

On the six ACORD episodes measured in both arms: 2/6 single vs 3/6 dual —
no accuracy signal, but the single surface ran **38% cheaper per episode**.

## Conclusions (three, and the third is the uncomfortable one)

1. **Surface size moves the boundary, partially.** Halving the tool count
   flipped one task from impossible (0/3) to flaky (2/3) and cut cost ~28%
   across the three. Tool-surface bloat is real and measurable — but it does
   not explain the other two failures.
2. **Two tasks are genuinely beyond this model on this world.** They stay 0/3
   on both surfaces, at 62–104 tool calls per episode, one hitting the 50-turn
   cap outright. Both require deriving a value from a document buried in a
   242-document corpus and then writing it — the "find it, compute it, file
   it" chain that the flat and easy tasks never test.
3. **One 0/3 was my authoring bug, and the model's refusal was correct.**
   `lawflow-filing-fee-total` asked the agent to record a *business-formation*
   filing fee onto a **litigation courts** record — a table that has nothing to
   do with entity formation. The agent read the right documents, then declined
   to write, saying: *"There's no Harborlight/formation-specific court record
   in the courts table. The courts records are all generic litigation courts."*
   It was right; the task was semantically incoherent. Retargeted to the
   matter's own ledger (`legal_matters_amount_history_create`) and re-admitted.

   **Post-fix re-measurement (3 fresh episodes):** the character of the failure
   changed completely. The model now attempts the write and **computes the
   answer correctly** — episode 1 posted `fee_budget: 269` with
   `changed_by_role: "formation-paralegal"`, exactly the pinned key ($89 DE +
   $180 WA derived from the checklist). It still fails the task, but on the
   world's real modes: episode 1 tripped the scope guards (it also wrote
   somewhere it should not have), and episodes 2–3 exhausted their hunt (53 and
   63 calls, no write). That is a defensible "too hard" — a task the model can
   solve arithmetically but not yet execute cleanly — rather than a task that
   punished correct reasoning.

## Standing rules this produced

- **Report the surface with the score.** A number measured on 179 tools is not
  the same measurement as one on 91. Every result row states its arm.
- **Serve one generation at a time for measurement.** The dual surface exists
  for migration, not for benchmarking; `--v2-contracts` is an explicit choice.
- **When an agent refuses to write, check the task before the model.** A
  refusal to make a semantically incoherent record is correct behavior, and in
  this run it caught an authoring error a passing oracle had not.

*Raw episodes: `data/leaderboard/episodes/deepseek-chat@dual-surface/` and
`data/leaderboard/episodes/deepseek-chat/`. Reproduce: serve both arms, run
`sim/run-leaderboard.mjs --tasks task_250,task_251,task_252 --episodes 3`
against each `--local-base`.*
