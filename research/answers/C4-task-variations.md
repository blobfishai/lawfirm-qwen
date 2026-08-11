# C4 — What makes one instance of a family harder than another?

**Status:** answered from the automation corpus on disk.

**Evidence:** `research/repos/CSlawyer1985@legal-ZH` — cited per axis below.

This question drives the growth loop: when a task passes first try, we grow it.
Growing means moving along an axis the domain actually varies on, not just
bolting on more tool calls.

---

## Axis 1 — Party posture (the same facts, a different right answer)

14 skills make the output depend on which side the firm acts for.
`litigation-legal/skills/chronology/SKILL.md` states it plainly: the same event
is rated 🔴/🟡/⚪ differently for the claiming party (mark events that
*establish* an element, *close* a gap the other side will open, or *start*
limitation) versus the defending party (mark events that *break* an element,
*open* a limitation or jurisdiction defence, or *support* an affirmative
defence). `litigation-legal/skills/claim-chart/SKILL.md:145` frames the same
split as "which side? the claimant's cause of action, the defendant's
defences."

**Why this is the best growth axis we have.** It multiplies task count without
adding a single document, it cannot be solved by pattern-matching the document
(the document is identical), and it has a determinate answer given the posture.
Our world has no task where the posture is the operative variable.

## Axis 2 — Retrievability of the controlling authority

`corporate-legal/skills/diligence-issue-extraction/SKILL.md:103` sets out what
to do when a cited provision cannot be retrieved: do not write a description of
it from memory. Say that the provision does not match expectation, tag the claim
*[statute not retrieved — needs verification]*, and then either retrieve the
text through a configured tool, ask the user to paste it, or refer it to outside
counsel. The stated reason:

> a confident but wrong description of a real statute is worse than "unclear" —
> a deal-team memo citing a fictitious subsection is harder to correct than a
> blank one.

This is a difficulty axis *and* a grading rule. Easy instance: the authority is
in the corpus, cite it. Hard instance: the authority is referenced but absent,
and the only correct output is a tagged non-answer. We grade fabrication on
forbidden rows; we do not currently grade *this* shape, where the correct
deliverable contains an explicit "not retrieved" marker.

## Axis 3 — Threshold and matrix lookups

`commercial-legal/skills/escalation-flagger/SKILL.md` routes an issue to an
approver by an escalation matrix, classifying it first as amount threshold /
clause deviation / automatic trigger / business decision — and requires naming
**a person or role, not "legal leadership"**. Difficulty scales with how far the
instance sits from a threshold edge, and with whether one issue trips two
categories at once.

Our `packs-v4` covenant and settlement-authority tasks already use this shape.
The corpus confirms it is real practice, and adds the specificity requirement
(name the role, not the department) which we can pin.

## Axis 4 — Workflow length

41% of shipped skills run ≥8 numbered steps, up to 40
(`litigation-legal/skills/demand-draft/SKILL.md`). Our world: 3 of 270 tasks
reach 8 steps. See `C1-task-families.md` for the full comparison.

## Axis 5 — Prior state

53 skills version their output and present a diff against the previous run.
Every one of our tasks begins with the deliverable absent. "Update the existing
chronology and show what changed" is a harder instance of the same family, and
the world's tables already support it (rows exist; an update is gradeable).

---

## How these map onto the growth loop

When a task passes first try, grow along the axis that fits its family:

| Family | Grow by |
|---|---|
| chronology / claim chart / diligence | flip the posture (axis 1) |
| citation audit / statute application | remove the authority from the corpus (axis 2) |
| covenant / settlement / escalation | move the instance toward the threshold edge (axis 3) |
| any | prior version exists; require the diff (axis 5) |

Axis 4 (length) is the loop's default, but it is the *weakest* of the five: a
longer walk of the same operations tests endurance, not judgment. The r1 finding
recorded in `docs/WORLD-CREATION-PLAYBOOK.md` said the same thing from the other
direction — length is easy, ambiguity is the lever. The corpus tells us which
ambiguities are real ones.
