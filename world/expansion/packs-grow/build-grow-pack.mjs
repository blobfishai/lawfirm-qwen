#!/usr/bin/env node
/**
 * packs-grow — harder variants of the families that measured 100%.
 *
 * Measurement (docs/TRIAGE-NEW-FAMILIES.md) put three families at 3/3 on
 * deepseek-chat: banking-finance-covenants (30/30), production-gap-disclosure
 * (9/9) and ethical-wall-screening (9/9). By the creation workflow's rule those
 * are too easy and must grow.
 *
 * WHICH AXIS. The same measurement says how. Length is not the lever — the
 * async family runs a 7-step walk and still passed once its key was right. The
 * only genuine reasoning failure in 162 episodes was POSTURE (task_320, 2 of 3),
 * where the model had to hold a frame while reading. So these variants grow on
 * the axes that actually bit:
 *
 *   - remove the named target: the prompt no longer says which record to look
 *     at, so the agent must sweep the portfolio and decide for itself
 *   - require aggregation across documents rather than extraction from one
 *   - state a CRITERION instead of a list, and plant something that satisfies
 *     the description but not the criterion
 *
 * The covenant variants add no documents at all — they reuse the ten compliance
 * certificates already seeded by packs-v4, which is the point: depth from the
 * corpus we have, not from more corpus.
 *
 * Run: node world/expansion/packs-grow/build-grow-pack.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(HERE, { recursive: true });
const mid = (n) => `legal_matters_${String(n).padStart(3, "0")}`;

// ---- single source of truth: the shipped covenant pack -------------------
const covPack = JSON.parse(readFileSync(
  join(HERE, "..", "packs-v4", "banking-finance-covenants.json"), "utf8"));
const MAX_LEVERAGE = 3.50, MIN_COVERAGE = 2.75;

/** Re-derive each borrower's ratios from the certificate text we actually shipped. */
const certs = covPack.documents.filter((d) => d.doc_type === "compliance_certificate");
const num = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
const facilities = certs.map((d) => {
  const borrower = /COMPLIANCE CERTIFICATE — (.+)/.exec(d.body)[1].trim();
  const cur = d.body.slice(d.body.indexOf("CURRENT QUARTER"), d.body.indexOf("PRIOR QUARTER"));
  const debt = num(/Total Funded Debt \.+ \$([\d,\.]+)/.exec(cur)[1]);
  const ebitda = num(/Consolidated EBITDA \.+ \$([\d,\.]+)/.exec(cur)[1]);
  const interest = num(/Cash Interest Expense \.+ \$([\d,\.]+)/.exec(cur)[1]);
  const lev = debt / ebitda, cov = ebitda / interest;
  return { borrower, title: d.title, lev, cov,
           levBreach: lev > MAX_LEVERAGE, covBreach: cov < MIN_COVERAGE };
});
if (facilities.length !== 10) throw new Error(`expected 10 certificates, found ${facilities.length}`);

const bothBreached = facilities.filter((f) => f.levBreach && f.covBreach);
const worstLeverage = facilities.slice().sort((a, b) => b.lev - a.lev)[0];
const anyBreach = facilities.filter((f) => f.levBreach || f.covBreach);
if (!bothBreached.length) throw new Error("no borrower breaches both — the sweep would be trivial");

console.log("derived from the shipped certificates:");
for (const f of facilities) {
  console.log(`   ${f.borrower.padEnd(30)} lev ${f.lev.toFixed(2)}x  cov ${f.cov.toFixed(2)}x  ` +
    `${f.levBreach && f.covBreach ? "BOTH" : f.levBreach ? "leverage" : f.covBreach ? "coverage" : "compliant"}`);
}

const SWEEP_MEMO = "Portfolio covenant sweep — quarterly instruction";
const documents = [{
  title: SWEEP_MEMO,
  doc_type: "sweep_instruction",
  body: [
    "PORTFOLIO COVENANT SWEEP — quarter ended 30 June 2026",
    "",
    "The credit committee requires a portfolio-level view this quarter, not a borrower-level one.",
    "Work the whole book of compliance certificates in the matter folder. The instruction does",
    "not name a borrower; identifying which borrowers are in scope is part of the task.",
    "",
    "Apply the covenant schedule's tests to EVERY compliance certificate on file, on the",
    "certified current-quarter figures only. Then answer the committee's question exactly as",
    "asked — a borrower-level answer to a portfolio-level question is not responsive.",
    "",
    "Escalation note. A borrower in breach of BOTH covenants in the same quarter is a workout",
    "candidate and is reported separately from single-covenant breaches, which are handled in",
    "the ordinary remediation cycle.",
  ].join("\n"),
}];

const READS = [
  "Credit agreement — Covenant schedule and remediation ownership memo",
  SWEEP_MEMO,
];

const tasks = [
  {
    slug: "covenant-portfolio-dual-breach-count",
    difficulty: "high",
    prompt:
      "Portfolio covenant sweep for the quarter ended 30 June 2026. Read the covenant schedule " +
      "and the portfolio sweep instruction in the matter folder in full, then work every " +
      "compliance certificate on file and determine how many borrowers breached BOTH financial " +
      "covenants in the same quarter. Record that count by calling " +
      `legal_matters_amount_history_create against ${mid(17)} with fee_budget set to the number ` +
      'of dual-breach borrowers and changed_by_role exactly "credit-committee". No borrower is ' +
      "named for you; the certificates on file are the population.",
    reads: READS,
    creates: [{
      tool: "legal_matters_amount_history_create",
      args: {
        legal_matters_id: mid(17),
        fee_budget: bothBreached.length,
        changed_by_role: "credit-committee",
        change_reason:
          `${bothBreached.length} of ${facilities.length} borrowers breached both covenants: ` +
          bothBreached.map((f) => `${f.borrower} (leverage ${f.lev.toFixed(2)}x, coverage ${f.cov.toFixed(2)}x)`).join("; ") + ".",
      },
      pinned: { fee_budget: bothBreached.length, changed_by_role: "credit-committee" },
    }],
    // The count of borrowers breaching ANY covenant — what you get by testing
    // one covenant at a time and not intersecting.
    forbidden: [{ table: "legal_matters_amount_history", field: "fee_budget", value: anyBreach.length }],
  },
  {
    slug: "covenant-portfolio-worst-leverage",
    difficulty: "high",
    prompt:
      "Portfolio covenant sweep for the quarter ended 30 June 2026. Read the covenant schedule " +
      "and the portfolio sweep instruction in the matter folder in full, work every compliance " +
      "certificate on file, and identify the borrower carrying the HIGHEST total leverage ratio " +
      "on its certified current-quarter figures. Record it by calling " +
      `legal_matters_evidence_create against ${mid(18)} with content_digest set to exactly that ` +
      'borrower\'s name as it appears on its certificate, evidence_type exactly ' +
      '"portfolio_worst_leverage", owner_role exactly "credit-committee" and status exactly ' +
      '"confirmed". Prior-quarter figures are reference only.',
    reads: READS,
    creates: [{
      tool: "legal_matters_evidence_create",
      args: {
        legal_matters_id: mid(18),
        evidence_type: "portfolio_worst_leverage",
        source_uri: "matter://portfolio/covenant-sweep/q2-2026",
        content_digest: worstLeverage.borrower,
        owner_role: "credit-committee",
        status: "confirmed",
      },
      pinned: { content_digest: worstLeverage.borrower, evidence_type: "portfolio_worst_leverage" },
    }],
    forbidden: [],
  },
];

const pack = {
  family: "covenant-portfolio-sweep",
  anchor: "harvey_lab",
  provenance: {
    grows: "banking-finance-covenants (measured 30/30 on deepseek-chat — too easy)",
    axis: "named target removed; aggregation across the whole certificate population",
    reuses: "the ten compliance certificates already seeded by packs-v4 — no new documents",
    derivation: "ratios re-parsed from the shipped certificate bodies at build time, so the "
      + "answer key cannot drift from the documents",
  },
  documents,
  tasks,
};

writeFileSync(join(HERE, "covenant-portfolio-sweep.json"), JSON.stringify(pack, null, 1));
console.log(`\npacks-grow: ${tasks.length} tasks · ${documents.length} document`);
console.log(`   dual-breach borrowers = ${bothBreached.length} (${bothBreached.map((f) => f.borrower).join(", ")})`);
console.log(`   any-breach (the forbidden answer) = ${anyBreach.length}`);
console.log(`   highest leverage = ${worstLeverage.borrower} at ${worstLeverage.lev.toFixed(2)}x`);
