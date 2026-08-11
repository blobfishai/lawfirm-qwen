#!/usr/bin/env node
/**
 * packs-posture — the same file, a different right answer.
 *
 * 14 of 175 skills in the practitioner corpus make the output depend on which
 * side the firm acts for. `litigation-legal/skills/chronology/SKILL.md` states
 * it directly: for the claiming party, mark the events that ESTABLISH an element
 * of the claim, CLOSE a gap the other side will open, or START limitation; for
 * the defending party, mark the events that BREAK an element, OPEN a limitation
 * or jurisdiction defence, or SUPPORT an affirmative defence. Same events,
 * opposite emphasis (research/answers/C4-task-variations.md, axis 1).
 *
 * This is the cheapest real difficulty available to us: it multiplies tasks
 * without adding a document, it cannot be answered by pattern-matching the
 * corpus (the corpus is identical across the pair), and it still has exactly
 * one right answer once the posture is fixed.
 *
 * The pairing is what makes it provable. Each task FORBIDS its partner's
 * correct answer. An agent that ignores the posture and reads only the facts
 * will produce one answer for both halves of a pair and fail exactly one of
 * them — so the pair, taken together, is a direct test of whether the posture
 * was read at all.
 *
 * Run: node world/expansion/packs-posture/build-posture-pack.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(HERE, { recursive: true });
const mid = (n) => `legal_matters_${String(n).padStart(3, "0")}`;

const FRAMING = "Chronology framing memo — significance tagging by party posture";

// ---------------------------------------------------------------- fact pattern 1
const F1_EVENTS = [
  ["EV-01", "2022-03-04", "Supply agreement executed; specification schedule attached."],
  ["EV-02", "2023-08-19", "First batch delivered. Incoming inspection records adhesion at specification."],
  ["EV-03", "2024-01-22", "Buyer's maintenance log records coating delamination on vessel 3. No notice sent to supplier."],
  ["EV-04", "2024-02-15", "Independent surveyor attributes delamination to shipyard surface preparation, not coating."],
  ["EV-05", "2024-11-30", "Buyer issues first written notice of nonconformity to supplier."],
  ["EV-06", "2026-04-02", "Proceedings issued."],
];

// ---------------------------------------------------------------- fact pattern 2
const F2_EVENTS = [
  ["EV-11", "2023-05-10", "Services agreement executed; SLA credits capped at 10% of monthly fees."],
  ["EV-12", "2024-06-01", "Provider's monitoring alarms disabled for 31 days despite three written warnings from the customer."],
  ["EV-13", "2024-07-08", "Outage. Customer's own failover was misconfigured and did not engage."],
  ["EV-14", "2024-07-30", "Customer accepts SLA credits and signs an acknowledgement of the credit as full settlement for the July outage."],
  ["EV-15", "2025-02-11", "Customer issues demand for consequential loss notwithstanding the acknowledgement."],
];

const documents = [
  {
    title: FRAMING,
    doc_type: "framing_memo",
    body: [
      "CHRONOLOGY FRAMING MEMO — significance tagging",
      "",
      "The same event carries different significance depending on which side the firm acts for.",
      "Tag the single most significant event on the following rule, and record its event code.",
      "",
      "ACTING FOR THE CLAIMING PARTY (offensive frame). The most significant event is the one",
      "that most strongly ESTABLISHES an element of the claim — breach, causation, or loss —",
      "or that CLOSES a gap the other side will try to open. Prefer an event that is documented",
      "and contemporaneous over one that is merely asserted.",
      "",
      "ACTING FOR THE DEFENDING PARTY (defensive frame). The most significant event is the one",
      "that most strongly BREAKS an element of the claim, OPENS a limitation, notice or",
      "jurisdiction defence, or SUPPORTS an affirmative defence such as waiver, release, or",
      "contributory fault.",
      "",
      "The frame is set by the engagement, not by the strength of the underlying facts. An event",
      "that is decisive for one side is background for the other. Do not tag the event that",
      "would help the party you do not act for.",
      "",
      "Record the event code exactly as it appears in the event schedule (for example EV-01).",
    ].join("\n"),
  },
  {
    title: "Event schedule — Brightwater Marine v. Halcyon Coatings (supply dispute)",
    doc_type: "event_schedule",
    body: [
      "EVENT SCHEDULE — Brightwater Marine Services (buyer) v. Halcyon Coatings (supplier)",
      "",
      "Contractual notice provision: the buyer must give written notice of nonconformity within",
      "sixty (60) days of discovery. Limitation period for the claim: two (2) years from breach.",
      "",
      ...F1_EVENTS.map(([id, d, t]) => `  ${id}  ${d}  ${t}`),
    ].join("\n"),
  },
  {
    title: "Event schedule — Ironwood Ops v. Silverline Data (services dispute)",
    doc_type: "event_schedule",
    body: [
      "EVENT SCHEDULE — Ironwood Ops (customer) v. Silverline Data (provider)",
      "",
      "The services agreement caps SLA credits at 10% of monthly fees and excludes consequential",
      "loss except in cases of gross negligence. An accepted credit acknowledgement is expressed",
      "to be in full settlement of the incident it relates to.",
      "",
      ...F2_EVENTS.map(([id, d, t]) => `  ${id}  ${d}  ${t}`),
    ].join("\n"),
  },
];

const SCHED1 = "Event schedule — Brightwater Marine v. Halcyon Coatings (supply dispute)";
const SCHED2 = "Event schedule — Ironwood Ops v. Silverline Data (services dispute)";

/** One half of a posture pair. */
function postureTask({ slug, matter, party, side, sched, answer, partner, brief }) {
  return {
    slug,
    difficulty: "high",
    prompt:
      `You act for ${party} in ${matter}. Read the chronology framing memo and that matter's ` +
      "event schedule in the matter folder in full, apply the framing rule for the side you act " +
      "for, and record the single most significant event by calling legal_matters_evidence_create " +
      `against ${mid(brief.mid)} with content_digest set to exactly that event's code, ` +
      `evidence_type exactly "${side}_frame_key_event", owner_role exactly "litigation-counsel" ` +
      'and status exactly "confirmed". The frame is set by who you act for, not by which fact ' +
      "reads strongest on its own.",
    reads: [FRAMING, sched],
    creates: [{
      tool: "legal_matters_evidence_create",
      args: {
        legal_matters_id: mid(brief.mid),
        evidence_type: `${side}_frame_key_event`,
        source_uri: `matter://${brief.slug}/chronology/key-event`,
        content_digest: answer,
        owner_role: "litigation-counsel",
        status: "confirmed",
      },
      pinned: { content_digest: answer, evidence_type: `${side}_frame_key_event` },
    }],
    // The partner task's correct answer. Tagging it here means the posture was
    // not read — the facts alone cannot distinguish the two.
    forbidden: [{ table: "legal_matters_evidence_records", field: "content_digest", value: partner }],
  };
}

const tasks = [
  postureTask({
    slug: "posture-claimant-supply-dispute",
    matter: "Brightwater Marine v. Halcyon Coatings",
    party: "Brightwater Marine Services, the claiming party",
    side: "claimant",
    sched: SCHED1,
    // EV-03 is the contemporaneous maintenance log recording the delamination:
    // documented, contemporaneous, and it establishes the loss.
    answer: "EV-03",
    partner: "EV-05",
    brief: { mid: 11, slug: "brightwater-halcyon" },
  }),
  postureTask({
    slug: "posture-defendant-supply-dispute",
    matter: "Brightwater Marine v. Halcyon Coatings",
    party: "Halcyon Coatings, the defending party",
    side: "defendant",
    sched: SCHED1,
    // EV-05 is the first written notice — 10 months after discovery at EV-03,
    // far outside the 60-day contractual notice window. It opens the notice defence.
    answer: "EV-05",
    partner: "EV-03",
    brief: { mid: 12, slug: "brightwater-halcyon" },
  }),
  postureTask({
    slug: "posture-claimant-services-dispute",
    matter: "Ironwood Ops v. Silverline Data",
    party: "Ironwood Ops, the claiming party",
    side: "claimant",
    sched: SCHED2,
    // EV-12 — alarms disabled for 31 days despite three written warnings — is the
    // gross-negligence conduct that defeats the consequential-loss exclusion.
    answer: "EV-12",
    partner: "EV-14",
    brief: { mid: 13, slug: "ironwood-silverline" },
  }),
  postureTask({
    slug: "posture-defendant-services-dispute",
    matter: "Ironwood Ops v. Silverline Data",
    party: "Silverline Data, the defending party",
    side: "defendant",
    sched: SCHED2,
    // EV-14 — the signed acknowledgement in full settlement — is the release.
    answer: "EV-14",
    partner: "EV-12",
    brief: { mid: 14, slug: "ironwood-silverline" },
  }),
];

const pack = {
  family: "posture-dependent-chronology",
  anchor: "workflow_research",
  provenance: {
    axis: "party posture",
    corpus_support: "14 of 175 SKILL.md files in CSlawyer1985/claude-for-legal-ZH; the rule is "
      + "stated in litigation-legal/skills/chronology/SKILL.md and claim-chart/SKILL.md:145",
    design: "Tasks ship in pairs over identical documents. Each task forbids its partner's "
      + "correct answer, so an agent that ignores the posture fails exactly one half of "
      + "every pair.",
  },
  documents,
  tasks,
};

writeFileSync(join(HERE, "posture-dependent-chronology.json"), JSON.stringify(pack, null, 1));
console.log(`packs-posture: ${tasks.length} tasks (${tasks.length / 2} posture pairs) · ` +
  `${documents.length} documents`);
for (const t of tasks) {
  console.log(`   ${t.slug.padEnd(42)} answer=${t.creates[0].pinned.content_digest} ` +
    `forbidden=${t.forbidden[0].value}`);
}
