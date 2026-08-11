#!/usr/bin/env node
/**
 * packs-v4 — replacements for the 38 "recipe" tasks.
 *
 * The tasks being replaced read, in full:
 *
 *   Complete the "harvey_lab: antitrust-competition matter workflow" workflow
 *   for Law Firm Company: list legal matters -> get legal matters -> create
 *   legal matters amount history. Use the matters record with id
 *   "legal_matters_001".
 *
 * The prompt hands over the tool sequence AND the target id, and the verifier
 * pins no value — so the task grades "can you call three named tools", and the
 * discrimination sweep confirmed it: a corrupted write payload passes with
 * reward 1.0 (docs/DISCRIMINATION.md).
 *
 * Each replacement keeps the family, anchor and terminal write tool of the task
 * it replaces, and adds what was missing: documents carrying the operative
 * facts, a firm rule that must be applied to them, and a determinate answer
 * pinned in the verifier. Every scenario ships a DISTRACTOR — a figure or name
 * a careless reader grabs instead — so a wrong answer is plausible rather than
 * arbitrary, and a forbidden-value trap graded against it.
 *
 * Answers are COMPUTED here, never hand-written, so the pinned key and the
 * documents cannot drift apart.
 *
 * Run: node world/expansion/packs-v4/build-packs-v4.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
mkdirSync(HERE, { recursive: true });

const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mid = (n) => `legal_matters_${String(n).padStart(3, "0")}`;
const cid = (n) => `litigation_cases_${String(n).padStart(3, "0")}`;

// ===================================================================== 1/5
// banking-finance -> legal_matters_remediation_create  (10 tasks)
// Covenant compliance: compute two ratios, decide which covenant broke, and
// the firm's ownership rule assigns the remediation owner from that.
// Distractor: the certificate also reports PRIOR-quarter figures that comply.
const MAX_LEVERAGE = 3.50, MIN_COVERAGE = 2.75;
const OWNER = { leverage: "restructuring-counsel", coverage: "banking-counsel", both: "workout-committee" };

const facilities = [
  { borrower: "Harborlight Freight Systems",  debt: 486_000_000, ebitda: 128_400_000, interest: 41_900_000 },
  { borrower: "Cedarline Manufacturing",      debt: 430_000_000, ebitda: 118_000_000, interest: 38_600_000 },
  { borrower: "Ironwood Ops Holdings",        debt: 705_000_000, ebitda: 186_300_000, interest: 74_500_000 },
  { borrower: "Silverline Data Centers",      debt: 240_000_000, ebitda:  96_000_000, interest: 36_800_000 },
  { borrower: "Prairie Aerostructures",       debt: 890_000_000, ebitda: 231_000_000, interest: 79_100_000 },
  { borrower: "Fairview Logistics Group",     debt: 155_000_000, ebitda:  62_800_000, interest: 24_600_000 },
  { borrower: "Summit Operations Midco",      debt: 528_000_000, ebitda: 139_500_000, interest: 44_200_000 },
  { borrower: "Halcyon Specialty Chemicals",  debt: 274_000_000, ebitda: 104_600_000, interest: 41_300_000 },
  { borrower: "Northgate Utilities Partners", debt: 962_000_000, ebitda: 248_000_000, interest: 96_400_000 },
  { borrower: "Brightwater Marine Services",  debt: 198_000_000, ebitda:  74_200_000, interest: 29_500_000 },
];

function bankingPack() {
  const documents = [{
    title: "Credit agreement — Covenant schedule and remediation ownership memo",
    doc_type: "covenant_schedule",
    body: [
      "CREDIT AGREEMENT — FINANCIAL COVENANT SCHEDULE (firm memo)",
      "",
      "Tested quarterly on the CURRENT quarter figures certified in the compliance certificate.",
      "Prior-quarter figures are reproduced in each certificate for trend reference ONLY and are",
      "never the tested period.",
      "",
      `  Maximum Total Leverage Ratio  = Total Funded Debt / Consolidated EBITDA  <=  ${MAX_LEVERAGE.toFixed(2)}x`,
      `  Minimum Interest Coverage Ratio = Consolidated EBITDA / Cash Interest Expense  >=  ${MIN_COVERAGE.toFixed(2)}x`,
      "",
      "REMEDIATION OWNERSHIP RULE. On a covenant breach, open a remediation owned by:",
      `  - leverage covenant breached alone            -> ${OWNER.leverage}`,
      `  - interest coverage covenant breached alone   -> ${OWNER.coverage}`,
      `  - both covenants breached in the same quarter -> ${OWNER.both}`,
      "",
      "Every remediation opened under this schedule is created with status exactly \"open\".",
      "Owner vocabulary (use exactly): restructuring-counsel | banking-counsel | workout-committee",
    ].join("\n"),
  }];

  const tasks = facilities.map((f, i) => {
    const lev = f.debt / f.ebitda, cov = f.ebitda / f.interest;
    const levBreach = lev > MAX_LEVERAGE, covBreach = cov < MIN_COVERAGE;
    // A scenario that breaches nothing would tell the agent to open a remediation
    // the prompt simultaneously forbids — the incoherent-task defect. Refuse to
    // emit rather than let it ship.
    if (!levBreach && !covBreach) {
      throw new Error(
        `${f.borrower} breaches neither covenant (leverage ${lev.toFixed(2)}x <= ${MAX_LEVERAGE}, ` +
        `coverage ${cov.toFixed(2)}x >= ${MIN_COVERAGE}) — every scenario in this pack must have a ` +
        `real breach for its remediation to be coherent`);
    }
    const kind = levBreach && covBreach ? "both" : levBreach ? "leverage" : "coverage";
    const owner = OWNER[kind];
    // prior quarter: engineered to comply on both tests (the distractor)
    const pDebt = Math.round(f.ebitda * 3.10), pInterest = Math.round(f.ebitda / 3.05);
    const title = `Covenant compliance certificate — ${f.borrower} (Q2 2026)`;
    documents.push({
      title, doc_type: "compliance_certificate",
      body: [
        `COMPLIANCE CERTIFICATE — ${f.borrower}`,
        "Delivered under the credit agreement for the quarter ended 30 June 2026.",
        "",
        "CURRENT QUARTER (tested period — quarter ended 30 June 2026):",
        `  Total Funded Debt .......... $${money(f.debt)}`,
        `  Consolidated EBITDA ........ $${money(f.ebitda)}`,
        `  Cash Interest Expense ...... $${money(f.interest)}`,
        "",
        "PRIOR QUARTER (trend reference only — quarter ended 31 March 2026):",
        `  Total Funded Debt .......... $${money(pDebt)}`,
        `  Consolidated EBITDA ........ $${money(f.ebitda)}`,
        `  Cash Interest Expense ...... $${money(pInterest)}`,
        "",
        "The borrower certifies the figures above are true and complete. The borrower makes no",
        "representation as to covenant compliance; that determination is the lender's.",
      ].join("\n"),
    });
    const wrongOwner = kind === "both" ? OWNER.leverage
      : kind === "leverage" ? OWNER.coverage : OWNER.leverage;
    return {
      slug: `covenant-remediation-${f.borrower.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`,
      difficulty: "high",
      prompt:
        `Quarterly covenant review for ${f.borrower}. Read the credit agreement covenant schedule ` +
        `and that borrower's compliance certificate in the matter folder in full. Test BOTH financial ` +
        `covenants on the certified current-quarter figures, then open the remediation the schedule ` +
        `requires by calling legal_matters_remediation_create against ${mid(i + 1)} with owner_role ` +
        `exactly as the ownership rule assigns it and status exactly "open". Do not open a remediation ` +
        `for a covenant that is not breached.`,
      reads: ["Credit agreement — Covenant schedule and remediation ownership memo", title],
      creates: [{
        tool: "legal_matters_remediation_create",
        args: {
          legal_matters_id: mid(i + 1),
          owner_role: owner,
          action_required:
            `Cure the ${kind === "both" ? "leverage and interest coverage" : kind === "leverage" ? "total leverage" : "interest coverage"} ` +
            `covenant breach certified for the quarter ended 30 June 2026 (leverage ${lev.toFixed(2)}x vs ` +
            `${MAX_LEVERAGE.toFixed(2)}x maximum; coverage ${cov.toFixed(2)}x vs ${MIN_COVERAGE.toFixed(2)}x minimum).`,
          due_at: "2026-09-30T17:00:00Z",
          status: "open",
        },
        pinned: { owner_role: owner, status: "open" },
      }],
      forbidden: [{ table: "legal_matters_remediations", field: "owner_role", value: wrongOwner }],
    };
  });
  return { family: "banking-finance-covenants", anchor: "harvey_lab", documents, tasks };
}

// ===================================================================== 2/5
// bankruptcy-restructuring -> legal_matters_review_create  (8 tasks)
// Claim classification against a priority waterfall. Distractor: every claim
// asserts its own preferred treatment in the creditor's own words.
const PETITION = "2026-01-20", BAR_DATE = "2026-04-15", WAGE_CAP = 15150;
const claims = [
  { creditor: "Meridian Equipment Finance", basis: "equipment lease financing", filed: "2026-03-02", ucc: "2025-11-14", wages: 0, amount: 2_400_000, asserts: "secured" },
  { creditor: "Delacroix Staffing",         basis: "unpaid wages earned 2025-12-01 through petition", filed: "2026-02-18", ucc: null, wages: 11_800, amount: 11_800, asserts: "priority" },
  { creditor: "Ridgeway Consulting",        basis: "professional fees", filed: "2026-05-08", ucc: null, wages: 0, amount: 340_000, asserts: "general unsecured" },
  { creditor: "Kestrel Capital Partners",   basis: "term loan", filed: "2026-03-27", ucc: "2026-02-03", wages: 0, amount: 18_500_000, asserts: "secured" },
  { creditor: "Ashford Trade Supply",       basis: "goods delivered pre-petition", filed: "2026-04-01", ucc: null, wages: 0, amount: 762_000, asserts: "general unsecured" },
  { creditor: "Petrov Maintenance Crew",    basis: "unpaid wages earned 2025-09-02 through 2025-11-30", filed: "2026-03-11", ucc: null, wages: 22_400, amount: 22_400, asserts: "priority" },
  { creditor: "Longview Realty Trust",      basis: "lease rejection damages", filed: "2026-06-19", ucc: null, wages: 0, amount: 1_150_000, asserts: "general unsecured" },
  { creditor: "Fairhaven Insurance",        basis: "premium financing", filed: "2026-04-14", ucc: "2025-08-22", wages: 0, amount: 495_000, asserts: "secured" },
];

function classify(c) {
  if (c.filed > BAR_DATE) return "disallowed";
  if (c.ucc && c.ucc < PETITION) return "allowed_secured";
  if (c.wages > 0) {
    // 180 days before petition = 2025-07-24; wages earned wholly within window and at/under cap
    const withinWindow = /2025-(0[89]|1[012])|2026-01/.test(c.basis);
    if (withinWindow && c.wages <= WAGE_CAP) return "allowed_priority";
    return "allowed_general_unsecured";
  }
  return "allowed_general_unsecured";
}

function bankruptcyPack() {
  const documents = [{
    title: "Chapter 11 — Claim classification waterfall memo",
    doc_type: "claims_waterfall",
    body: [
      "CLAIM CLASSIFICATION MEMO — In re Northgate Holdings, Chapter 11",
      "",
      `Petition date: ${PETITION}.   Claims bar date: ${BAR_DATE}.`,
      "",
      "Apply the tests IN ORDER. The first test that matches controls.",
      "",
      `  1. LATE FILING. A proof of claim filed after ${BAR_DATE} is disallowed unless the docket`,
      "     shows an excusable-neglect order. No such order has been entered in this case.",
      "     -> disallowed",
      "",
      "  2. PERFECTED SECURITY INTEREST. A UCC-1 financing statement filed BEFORE the petition",
      "     date perfects the interest. A UCC-1 filed on or after the petition date does not.",
      "     -> allowed_secured",
      "",
      `  3. EMPLOYEE WAGES. Wages EARNED within the 180 days before the petition date (that is, on`,
      `     or after 2025-07-24), capped at $${money(WAGE_CAP)} per employee. Wages earned wholly or`,
      "     partly outside that window, or exceeding the cap, do not take priority treatment.",
      "     -> allowed_priority",
      "",
      "  4. EVERYTHING ELSE.  -> allowed_general_unsecured",
      "",
      "A creditor's own characterisation of its claim in the proof of claim is not evidence of its",
      "treatment and is routinely overstated. Classify on the tests above alone.",
      "",
      "Outcome vocabulary (use exactly):",
      "  disallowed | allowed_secured | allowed_priority | allowed_general_unsecured",
    ].join("\n"),
  }];

  const tasks = claims.map((c, i) => {
    const outcome = classify(c);
    const title = `Proof of claim — ${c.creditor}`;
    documents.push({
      title, doc_type: "proof_of_claim",
      body: [
        `PROOF OF CLAIM — In re Northgate Holdings`,
        `Creditor: ${c.creditor}`,
        `Basis of claim: ${c.basis}`,
        `Amount asserted: $${money(c.amount)}`,
        `Date filed with the clerk: ${c.filed}`,
        c.ucc ? `UCC-1 financing statement filed: ${c.ucc}` : "UCC-1 financing statement: none of record",
        c.wages ? `Wages component asserted: $${money(c.wages)}` : "Wages component: none",
        "",
        `Creditor's characterisation: "This claim is entitled to treatment as ${c.asserts}."`,
      ].join("\n"),
    });
    const wrong = { secured: "allowed_secured", priority: "allowed_priority", "general unsecured": "allowed_general_unsecured" }[c.asserts];
    return {
      slug: `claim-classification-${c.creditor.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`,
      difficulty: "high",
      prompt:
        `Claims administration for In re Northgate Holdings. Read the claim classification waterfall ` +
        `memo and the proof of claim filed by ${c.creditor} in the matter folder in full, apply the ` +
        `memo's tests in order, and record the classification by calling legal_matters_review_create ` +
        `against ${mid(11 + i)} with reviewer_role exactly "claims-analyst" and outcome set to exactly ` +
        `one value from the memo's outcome vocabulary. The creditor's own characterisation is not ` +
        `evidence of treatment.`,
      reads: ["Chapter 11 — Claim classification waterfall memo", title],
      creates: [{
        tool: "legal_matters_review_create",
        args: {
          legal_matters_id: mid(11 + i),
          reviewer_role: "claims-analyst",
          outcome,
          rationale: `Classified ${outcome} on the waterfall memo: filed ${c.filed} (bar date ${BAR_DATE}); ` +
            `UCC-1 ${c.ucc ?? "none"}; wages component ${c.wages ? "$" + money(c.wages) : "none"}.`,
        },
        pinned: { outcome, reviewer_role: "claims-analyst" },
      }],
      forbidden: wrong && wrong !== outcome
        ? [{ table: "legal_matters_reviews", field: "outcome", value: wrong }] : [],
    };
  });
  return { family: "bankruptcy-claim-classification", anchor: "harvey_lab", documents, tasks };
}

// ===================================================================== 3/5
// multi-hop legal reasoning -> litigation_cases_amount_history_create  (8)
// Three documents chain: heads of loss -> liability cap -> prejudgment interest.
// Distractor: the worksheet's own "TOTAL CLAIMED" ignores both the cap and the
// consequential-damages exclusion.
const COMPUTE_DATE = "2026-08-01", INTEREST_RATE = 0.06;
const damages = [
  { matter: "Summit Operations v. Delacroix Systems", direct: 4_120_000, consequential: 2_650_000, mitigation: 310_000, fees12m: 1_450_000, breach: "2025-02-14", gross: false },
  { matter: "Harborlight Freight v. Kestrel Logistics", direct: 1_875_000, consequential: 940_000, mitigation: 125_000, fees12m: 1_200_000, breach: "2025-06-03", gross: false },
  { matter: "Ironwood Ops v. Silverline Data", direct: 6_400_000, consequential: 3_100_000, mitigation: 480_000, fees12m: 2_900_000, breach: "2024-11-21", gross: true },
  { matter: "Cedarline Manufacturing v. Ashford Supply", direct: 2_240_000, consequential: 1_180_000, mitigation: 90_000, fees12m: 780_000, breach: "2025-09-30", gross: false },
  { matter: "Fairview Logistics v. Petrov Haulage", direct: 980_000, consequential: 415_000, mitigation: 55_000, fees12m: 640_000, breach: "2025-04-18", gross: false },
  { matter: "Halcyon Chemicals v. Brightwater Marine", direct: 3_360_000, consequential: 1_720_000, mitigation: 240_000, fees12m: 1_900_000, breach: "2025-01-07", gross: true },
  { matter: "Northgate Utilities v. Meridian Equipment", direct: 5_150_000, consequential: 2_010_000, mitigation: 365_000, fees12m: 2_100_000, breach: "2025-07-25", gross: false },
  { matter: "Prairie Aerostructures v. Ridgeway Metals", direct: 1_530_000, consequential: 690_000, mitigation: 70_000, fees12m: 1_050_000, breach: "2025-11-12", gross: false },
];

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function damagesAnswer(d) {
  const recoverableHeads = d.direct + (d.gross ? d.consequential : 0) - d.mitigation;
  const cap = 2 * d.fees12m;
  const capped = Math.min(recoverableHeads, cap);
  const days = daysBetween(d.breach, COMPUTE_DATE);
  const interest = capped * INTEREST_RATE * (days / 365);
  return { recoverableHeads, cap, capped, days, total: Math.round((capped + interest) * 100) / 100 };
}

function damagesPack() {
  const documents = [
    {
      title: "Damages protocol — Liability cap and recoverable heads of loss",
      doc_type: "damages_protocol",
      body: [
        "DAMAGES PROTOCOL (firm memo) — master services agreement claims",
        "",
        "RECOVERABLE HEADS. Direct loss is recoverable. CONSEQUENTIAL loss is EXCLUDED by the",
        "agreement's limitation clause UNLESS the liability memo for the matter records a finding of",
        "gross negligence, in which case the carve-out applies and consequential loss is recoverable.",
        "Amounts actually mitigated are credited against the claim and reduce it.",
        "",
        "LIABILITY CAP. Total recoverable damages are capped at TWO TIMES the fees paid to the",
        "supplier in the twelve months preceding the claim. The cap is applied to the recoverable",
        "heads AFTER the mitigation credit and BEFORE prejudgment interest. Interest is not capped.",
        "",
        "ORDER OF OPERATIONS (do not reorder):",
        "  1. recoverable heads = direct + (consequential only if gross negligence) - mitigation credit",
        "  2. capped = min(recoverable heads, 2 x fees paid in the preceding 12 months)",
        "  3. claim = capped + prejudgment interest computed under the interest memo",
        "",
        "The 'TOTAL CLAIMED' line on a damages worksheet is the client's opening position. It applies",
        "neither the exclusion nor the cap and is never the figure filed.",
      ].join("\n"),
    },
    {
      title: "Damages protocol — Prejudgment interest memo",
      doc_type: "interest_memo",
      body: [
        "PREJUDGMENT INTEREST (firm memo)",
        "",
        `Simple interest at ${(INTEREST_RATE * 100).toFixed(0)}% per annum on the CAPPED principal.`,
        `Accrues from the date of breach to the computation date of ${COMPUTE_DATE}, inclusive of`,
        "neither endpoint adjustment: use exact elapsed days divided by a 365-day year.",
        "",
        "  interest = capped principal x 0.06 x (elapsed days / 365)",
        "",
        "Round the final filed figure to two decimal places.",
      ].join("\n"),
    },
  ];

  const tasks = damages.map((d, i) => {
    const a = damagesAnswer(d);
    const title = `Damages worksheet — ${d.matter}`;
    documents.push({
      title, doc_type: "damages_worksheet",
      body: [
        `DAMAGES WORKSHEET — ${d.matter}`,
        `Date of breach: ${d.breach}`,
        "",
        "Heads of loss as pleaded:",
        `  Direct loss ................................ $${money(d.direct)}`,
        `  Consequential loss (lost profits) .......... $${money(d.consequential)}`,
        `  Less: amounts mitigated .................... $${money(d.mitigation)}`,
        `  TOTAL CLAIMED (client opening position) .... $${money(d.direct + d.consequential - d.mitigation)}`,
        "",
        `Fees paid to the supplier in the 12 months preceding the claim: $${money(d.fees12m)}`,
        "",
        "Liability memo finding: " + (d.gross
          ? "the tribunal record supports a finding of GROSS NEGLIGENCE against the supplier."
          : "no finding of gross negligence is supported on the record; ordinary breach only."),
      ].join("\n"),
    });
    return {
      slug: `damages-computation-${d.matter.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "").slice(0, 46)}`,
      difficulty: "high",
      prompt:
        `Damages assessment for ${d.matter}. Read the damages protocol, the prejudgment interest memo, ` +
        `and this matter's damages worksheet in the matter folder in full. Apply the protocol's order ` +
        `of operations exactly, then file the figure by calling litigation_cases_amount_history_create ` +
        `against ${cid(i + 1)} with claimed_amount set to the computed figure rounded to two decimal ` +
        `places and changed_by_role exactly "litigation-associate". The worksheet's TOTAL CLAIMED line ` +
        `is the client's opening position, not the filed figure.`,
      reads: [
        "Damages protocol — Liability cap and recoverable heads of loss",
        "Damages protocol — Prejudgment interest memo",
        title,
      ],
      creates: [{
        tool: "litigation_cases_amount_history_create",
        args: {
          litigation_cases_id: cid(i + 1),
          claimed_amount: a.total,
          changed_by_role: "litigation-associate",
          change_reason:
            `Heads ${money(a.recoverableHeads)} (consequential ${d.gross ? "included under the gross-negligence carve-out" : "excluded"}), ` +
            `capped at 2x fees = ${money(a.cap)} -> ${money(a.capped)}; plus ${a.days} days' interest at 6% = ${money(a.total)}.`,
        },
        pinned: { claimed_amount: a.total, changed_by_role: "litigation-associate" },
      }],
      forbidden: [],
    };
  });
  return { family: "multi-hop-damages", anchor: "legalagentbench", documents, tasks };
}

// ===================================================================== 4/5
// antitrust-competition -> legal_matters_amount_history_create  (6 tasks)
// HSR fee tier lookup on a deal value the agent must assemble.
// Distractor: the headline "purchase price" omits assumed debt and earnout.
const HSR_TIERS = [
  { min: 119_500_000,   max: 173_300_000,   fee: 30_000 },
  { min: 173_300_000,   max: 536_500_000,   fee: 105_000 },
  { min: 536_500_000,   max: 1_073_000_000, fee: 260_000 },
  { min: 1_073_000_000, max: 2_146_000_000, fee: 415_000 },
  { min: 2_146_000_000, max: Infinity,      fee: 2_335_000 },
];
// Below the lowest tier the transaction is not reportable at all — which is the
// sharpest trap in this pack: a deal whose headline price reads non-reportable
// but whose assumed debt carries it over the threshold.
const feeFor = (v) => (HSR_TIERS.find((t) => v >= t.min && v < t.max) ?? { fee: null }).fee;

const deals = [
  { target: "Cedarline Manufacturing", cash: 410_000_000, debt: 165_000_000, earnout: 40_000_000, cashAcquired: 22_000_000 },
  { target: "Brightwater Marine Services", cash: 96_000_000, debt: 38_000_000, earnout: 12_000_000, cashAcquired: 5_000_000 },
  { target: "Northgate Utilities Partners", cash: 1_640_000_000, debt: 520_000_000, earnout: 0, cashAcquired: 60_000_000 },
  { target: "Fairview Logistics Group", cash: 148_000_000, debt: 26_000_000, earnout: 8_000_000, cashAcquired: 3_500_000 },
  { target: "Ironwood Ops Holdings", cash: 720_000_000, debt: 310_000_000, earnout: 55_000_000, cashAcquired: 41_000_000 },
  { target: "Halcyon Specialty Chemicals", cash: 2_050_000_000, debt: 180_000_000, earnout: 95_000_000, cashAcquired: 75_000_000 },
];

function hsrPack() {
  const documents = [{
    title: "HSR filing fee schedule and valuation memo (2026)",
    doc_type: "hsr_fee_schedule",
    body: [
      "HART-SCOTT-RODINO FILING FEE MEMO (2026 thresholds, firm memo)",
      "",
      "ACQUISITION VALUE. The reportable value is the total consideration the buyer gives up:",
      "",
      "  acquisition value = cash consideration",
      "                    + funded debt assumed or refinanced at closing",
      "                    + the MAXIMUM contingent earnout payable",
      "",
      "Cash on the target's balance sheet at closing is NOT deducted. A deal's headline",
      "'purchase price' customarily quotes cash consideration only and is not the reportable value.",
      "",
      "FEE TIERS (fee is determined by the tier the acquisition value falls into):",
      ...HSR_TIERS.map((t) => `  $${money(t.min)} to ${t.max === Infinity ? "and above" : "< $" + money(t.max)} .... fee $${money(t.fee)}`),
      "",
      "Record the fee as the matter's filing fee budget.",
    ].join("\n"),
  }];

  const tasks = deals.map((d, i) => {
    const value = d.cash + d.debt + d.earnout;
    const fee = feeFor(value);
    const title = `Transaction summary — Acquisition of ${d.target}`;
    documents.push({
      title, doc_type: "transaction_summary",
      body: [
        `TRANSACTION SUMMARY — Acquisition of ${d.target}`,
        "",
        `Headline purchase price (as announced) ........ $${money(d.cash)}`,
        "",
        "Consideration detail:",
        `  Cash consideration at closing ............... $${money(d.cash)}`,
        `  Funded debt assumed / refinanced ............ $${money(d.debt)}`,
        `  Contingent earnout, maximum payable ......... $${money(d.earnout)}`,
        `  Target cash on balance sheet at closing ..... $${money(d.cashAcquired)}`,
        "",
        "The earnout is payable on revenue milestones through 2028; the maximum is stated above.",
      ].join("\n"),
    });
    // The headline-price answer: either a lower tier's fee, or — when the cash
    // alone falls under the reporting threshold — the conclusion "no fee at all",
    // which the trap grades as a forbidden 0.
    const wrongFee = feeFor(d.cash) ?? 0;
    return {
      slug: `hsr-filing-fee-${d.target.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`,
      difficulty: "high",
      prompt:
        `Merger notification for the acquisition of ${d.target}. Read the HSR filing fee schedule and ` +
        `valuation memo and this deal's transaction summary in the matter folder in full, assemble the ` +
        `reportable acquisition value as the memo defines it, look up the fee tier, and record it by ` +
        `calling legal_matters_amount_history_create against ${mid(19 + i)} with fee_budget set to the ` +
        `tier fee and changed_by_role exactly "antitrust-counsel". The announced headline price is not ` +
        `the reportable value.`,
      reads: ["HSR filing fee schedule and valuation memo (2026)", title],
      creates: [{
        tool: "legal_matters_amount_history_create",
        args: {
          legal_matters_id: mid(19 + i),
          fee_budget: fee,
          changed_by_role: "antitrust-counsel",
          change_reason:
            `Acquisition value $${money(value)} = cash $${money(d.cash)} + assumed debt $${money(d.debt)} + ` +
            `max earnout $${money(d.earnout)}; target cash not deducted. Tier fee $${money(fee)}.`,
        },
        pinned: { fee_budget: fee, changed_by_role: "antitrust-counsel" },
      }],
      forbidden: wrongFee !== fee
        ? [{ table: "legal_matters_amount_history", field: "fee_budget", value: wrongFee }] : [],
      note: feeFor(d.cash) === null
        ? "headline cash price is below the reporting threshold; assumed debt carries it over"
        : undefined,
    };
  });
  return { family: "hsr-merger-notification", anchor: "harvey_lab", documents, tasks };
}

// ===================================================================== 5/5
// arbitration-international -> legal_matters_evidence_create  (6 tasks)
// Determine the administering institution from the clause. Distractor: the
// clause names a hearing venue whose city is another institution's home seat.
const clauses = [
  { counterparty: "Delacroix Systems SA",   rules: "ICC Rules of Arbitration", venue: "Singapore", seat: "Paris",     type: "icc_administered" },
  { counterparty: "Kestrel Logistics Ltd",  rules: "LCIA Arbitration Rules",   venue: "Singapore", seat: "London",    type: "lcia_administered" },
  { counterparty: "Ashford Trade Supply",   rules: "SIAC Arbitration Rules",   venue: "London",    seat: "Singapore", type: "siac_administered" },
  { counterparty: "Petrov Haulage OOO",     rules: "UNCITRAL Arbitration Rules", venue: "Paris",   seat: "Geneva",    type: "uncitral_ad_hoc" },
  { counterparty: "Ridgeway Metals GmbH",   rules: "ICC Rules of Arbitration", venue: "London",    seat: "Zurich",    type: "icc_administered" },
  { counterparty: "Meridian Equipment KK",  rules: "UNCITRAL Arbitration Rules", venue: "Singapore", seat: "Tokyo",   type: "uncitral_ad_hoc" },
];

function arbitrationPack() {
  const documents = [{
    title: "Arbitration clause review — Institutional rules mapping memo",
    doc_type: "arbitration_rules_memo",
    body: [
      "ARBITRATION CLAUSE REVIEW (firm memo)",
      "",
      "Classify each clause by the RULES it adopts, not by where hearings are held. A clause that",
      "fixes a hearing venue for convenience does not change the administering institution, and the",
      "venue city is frequently another institution's home seat — that coincidence is a trap.",
      "",
      "MAPPING (by the rules named in the clause):",
      "  ICC Rules of Arbitration ......... administered by the ICC     -> icc_administered",
      "  LCIA Arbitration Rules ........... administered by the LCIA    -> lcia_administered",
      "  SIAC Arbitration Rules ........... administered by SIAC        -> siac_administered",
      "  UNCITRAL Arbitration Rules ....... NOT administered by an institution unless the clause",
      "                                     separately appoints one     -> uncitral_ad_hoc",
      "",
      "Record the classification as an evidence record with owner_role exactly \"arbitration-counsel\"",
      "and status exactly \"confirmed\".",
      "",
      "Evidence type vocabulary (use exactly):",
      "  icc_administered | lcia_administered | siac_administered | uncitral_ad_hoc",
    ].join("\n"),
  }];

  const VENUE_TRAP = { Singapore: "siac_administered", London: "lcia_administered", Paris: "icc_administered", Zurich: "uncitral_ad_hoc", Tokyo: "uncitral_ad_hoc", Geneva: "uncitral_ad_hoc" };
  const tasks = clauses.map((c, i) => {
    const title = `Arbitration clause — ${c.counterparty} master agreement`;
    documents.push({
      title, doc_type: "arbitration_clause",
      body: [
        `ARBITRATION CLAUSE — master agreement with ${c.counterparty}`,
        "",
        `"Any dispute arising out of or in connection with this Agreement shall be finally resolved by`,
        ` arbitration under the ${c.rules}. The seat of the arbitration shall be ${c.seat}. The`,
        ` tribunal shall consist of three arbitrators. Hearings shall be held in ${c.venue} for the`,
        ` convenience of the parties and their witnesses. The language of the arbitration shall be`,
        ` English."`,
        "",
        `Counterparty correspondence notes that its counsel "expects the ${c.venue} centre to`,
        `administer the reference" — the counterparty's expectation is not part of the clause.`,
      ].join("\n"),
    });
    const trap = VENUE_TRAP[c.venue];
    return {
      slug: `arbitration-institution-${c.counterparty.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`,
      difficulty: "medium",
      prompt:
        `Arbitration clause review for the ${c.counterparty} master agreement. Read the institutional ` +
        `rules mapping memo and that agreement's arbitration clause in the matter folder in full, ` +
        `classify the clause by the rules it adopts, and record it by calling ` +
        `legal_matters_evidence_create against ${mid(25 + i)} with evidence_type set to exactly one ` +
        `value from the memo's vocabulary, owner_role exactly "arbitration-counsel" and status exactly ` +
        `"confirmed". The hearing venue does not determine the administering institution.`,
      reads: ["Arbitration clause review — Institutional rules mapping memo", title],
      creates: [{
        tool: "legal_matters_evidence_create",
        args: {
          legal_matters_id: mid(25 + i),
          evidence_type: c.type,
          source_uri: `matter://arbitration/${c.counterparty.toLowerCase().replace(/[^a-z]+/g, "-")}/clause`,
          content_digest: `clause-${c.rules.split(" ")[0].toLowerCase()}-seat-${c.seat.toLowerCase()}`,
          owner_role: "arbitration-counsel",
          status: "confirmed",
        },
        pinned: { evidence_type: c.type, owner_role: "arbitration-counsel" },
      }],
      forbidden: trap && trap !== c.type
        ? [{ table: "legal_matters_evidence_records", field: "evidence_type", value: trap }] : [],
    };
  });
  return { family: "arbitration-clause-review", anchor: "harvey_lab", documents, tasks };
}

// ===================================================================== emit
const packs = [bankingPack(), bankruptcyPack(), damagesPack(), hsrPack(), arbitrationPack()];
let tasks = 0, docs = 0;
for (const p of packs) {
  writeFileSync(join(HERE, `${p.family}.json`), JSON.stringify(p, null, 1));
  tasks += p.tasks.length; docs += p.documents.length;
  console.log(`  ${p.family}.json — ${p.tasks.length} tasks, ${p.documents.length} documents ` +
    `(${p.tasks[0].creates[0].tool})`);
}
console.log(`\npacks-v4: ${packs.length} packs · ${tasks} tasks · ${docs} documents`);
