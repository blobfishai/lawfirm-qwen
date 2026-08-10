#!/usr/bin/env node
/**
 * Coverage adjudications — every domain-registry item judged against the
 * world's actual tasks/tools/grammar. Verdict rules (see coverage-report.mjs):
 * covered = existing tasks host the core families (proof: task ids);
 * partial = some families hosted (ids) + missing families named;
 * hostable-gap = the outcome grammar + tables can express it via a content
 * pack, none exists yet (pack named); structural-gap = a mechanic is missing
 * (multi-party interaction, human/LLM-judged prose quality, non-English
 * corpora, live/large-scale retrieval, form/PDF runtimes, training corpora).
 *
 * Merges into data/research/domain-registry.json as `manual_map`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REG = join(ROOT, "data", "research", "domain-registry.json");

const M = {}; // coverage_key -> {verdict, proof}
const cov = (k, proof) => (M[k] = { verdict: "covered", proof });
const par = (k, proof) => (M[k] = { verdict: "partial", proof });
const host = (k, proof) => (M[k] = { verdict: "hostable-gap", proof });
const struct = (k, proof) => (M[k] = { verdict: "structural-gap", proof });

// ---- agent benchmarks ----
struct("agentcourt", "Needs multi-agent adversarial courtroom interaction and Chinese corpora; the world is single-agent, English.");
struct("simucourt-agentscourt", "Multi-party court-debate simulation (judge/opposing counsel agents) — no counterparty mechanics in the world.");
struct("alkiln", "Requires a guided-interview/form runtime plus a Gherkin test executor; the world has no interview engine.");
par("crosby-multi-turn-negotiation-bench", "Single-turn redline-vs-playbook adherence is hosted (deep-drafting tasks {{fam:deep-drafting}}: counterparty markup reconciled against internal playbook, superseding-instruction compliance). The multi-turn bargaining loop with a live counterparty is not (no opposing agent).");
cov("harvey-lab-extensions", "VDR-style diligence review hosted: harvey_lab diligence family (task_012, task_026, task_036…) — red-flags reporting over seeded deal folders with distractors — plus discovery-retrieval corpus tasks ({{fam:discovery-retrieval}}).");
par("openprobono", "Evidence-grounded determinations with required full reads are hosted (discovery-retrieval tasks {{fam:discovery-retrieval}}; hallucination-traps tasks {{fam:hallucination-traps}} incl. a phantom-citation record). Open-web cited research reports are not (no live corpus); a citation-registry pack would close the cite-verification half.");
struct("j1bench-ready-jurist-one", "Multi-participant procedural interaction in Chinese — both mechanics absent.");
struct("terms-bench", "Bilateral negotiation under private information requires an opposing agent.");

// ---- benchmarks ----
host("acord", "Precedent-clause retrieval-for-drafting fits the grammar (query/read a seeded clause library, draft with required reads); no clause-library pack exists yet. Pack: clause-library + retrieval-ranked drafting tasks.");
struct("arablegaleval", "Arabic legal corpora; world is English-only.");
struct("bsard", "French statutory corpus retrieval.");
struct("calrk-bench", "Korean legal corpora.");
struct("casegen", "Chinese multi-stage judicial drafting corpus; language mechanic missing (the multi-stage drafting SHAPE exists in deep-drafting).");
struct("chinese-labor-law-llm-benchmark", "Chinese labor-law corpus.");
cov("contracteval", "Clause-level risk identification with abstention calibration is exactly the cuad pack ({{fam:cuad-clause-extraction}}): per-category identification over executed contracts, absent-category fabrication traps graded as forbidden rows.");
struct("disc-law-eval", "Chinese MCQ + LLM-judged subjective QA (language + judged-prose mechanics).");
struct("dlawbench", "Multi-turn client consultation dialogue in Chinese — no multi-turn client simulator.");
struct("gerdalir-german-cluster", "German retrieval corpora.");
par("hallucination-detection-cluster-2026", "Abstention-under-absence is hosted with veto grading (hallucination-traps tasks {{fam:hallucination-traps}}, incl. phantom-citation and client-pressure documents). Typed citation-audit over long briefs is not; a cite-checking pack (seeded citation registry + defective briefs) would close it.");
struct("il-tur", "Nine Indian languages + Indian court corpora.");
struct("jbe-qa", "Japanese bar-exam corpus.");
struct("jec-qa", "Chinese judicial-exam corpus.");
struct("kbl", "Korean legal corpora.");
struct("koblex", "Korean multi-hop statute corpus.");
struct("korean-canonical-legal-benchmark", "Korean corpora.");
struct("laiw", "Chinese legal-NLP corpus suite.");
struct("lbox-open", "Korean case corpora.");
par("legal-rag-bench", "Grounded determination over a seeded corpus with enforced reads is hosted (discovery-retrieval tasks {{fam:discovery-retrieval}}). Passage-level retrieval at real-corpus scale (thousands of documents) is not — the world's corpus is 205 documents by design.");
host("legalcitebench", "Citation retrieval/completion/error-detection fits the grammar (pinned determinations + forbidden fabricated citations); needs a citation-registry pack (case-citation table + briefs with seeded defects). Adjacent proof: the phantom-citation trap the phantom-citation trap in {{fam:hallucination-traps}}.");
par("legaleval", "Judgment-prediction-with-explanation shape hosted via rule-application reviews (legalbench tasks {{fam:legalbench-rule-application}}: pinned outcome + rationale grounded in required reads). Span-level rhetorical-role labeling and NER are not record-level outcomes; hostable only via a per-span evidence-record pack.");
struct("legaleval-q", "Scores prose quality of legal text — requires an LLM/human judge; deterministic verifiers grade records, not style.");
struct("legalhalbench", "Chinese corpus (the abstention shape itself is hosted in English: {{fam:hallucination-traps}}).");
host("legallens", "Violation detection + resolution NLI fits pinned evidence/review grading over seeded incident documents; no violation-NER pack exists yet.");
struct("lexgenius", "Chinese corpora.");
struct("lexrag", "Chinese multi-turn consultation.");
struct("lexrubric", "Rubric-scored open-ended generation — needs an LLM judge by construction.");
struct("lleqa", "French statutory corpus.");
struct("magis-bench", "Portuguese judicial corpora + judged discursive drafting.");
par("maslegalbench", "IRAC deductive rule application is hosted (legalbench pack {{fam:legalbench-rule-application}}: rule memo + fact pattern → pinned conclusion, edge cases included). Multi-agent role decomposition is not (single-agent world).");
struct("nitibench", "Thai legal corpus.");
host("obliqa-regnlp-rirag", "Regulatory obligation extraction fits the grammar (seed regulation excerpts as matter documents; pinned obligation evidence records; required reads). Pack: regulatory-obligations. Not present today.");
struct("plawbench", "Chinese corpora.");
cov("sara", "Statutory rule-to-number computation is hosted by the damages-computation pack ({{fam:damages-computation}}: multi-step arithmetic from stated rules/facts, exact amounts pinned) and statutory entailment by legalbench rule-application ({{fam:legalbench-rule-application}}, pinned outcomes).");
struct("stard", "Chinese statute retrieval.");
struct("summarization-cluster", "Summary quality is judged-prose territory; deterministic verifiers cannot grade faithfulness/coverage of free-text summaries without gold-key reduction that changes the task.");
struct("tar-stopping-rule-research-line", "Stopping-rule certification requires statistical estimation over corpora of thousands+; a 205-document world cannot pose the substance.");
struct("trec-legal-track", "Responsive-review at 7M-document scale (Enron); corpus-scale mechanic absent.");
struct("trec-total-recall-track", "Continuous active learning over large corpora; same scale mechanic.");
struct("tribench-ko", "Korean corpora.");

// ---- competitions ----
struct("cail-umbrella", "Chinese court corpora across all tracks (the judgment-prediction SHAPE is hosted in English via legalbench rule-application).");
par("coliee", "Statute/case ENTAILMENT shape is hosted (legalbench tasks {{fam:legalbench-rule-application}}: rule + facts → pinned conclusion). Case-law retrieval over a real decisions corpus is not (small seeded corpus only).");
struct("philip-c-jessup-international-law-moot-court-competition", "Human-judged memorial prose + oral rounds.");
struct("willem-c-vis-international-commercial-arbitration-moot", "Human-judged memoranda + oral hearings.");

// ---- datasets ----
host("annocaselaw", "English judgment-outcome prediction fits pinned review outcomes over seeded case records with required reads; no case-record prediction pack exists yet. Pack: appellate-outcome-prediction.");
struct("cail2018", "Chinese judgments corpus.");
struct("cail2019-scm", "Chinese similar-case corpus.");
struct("cjrc", "Chinese judicial reading comprehension.");
struct("court-view-generation-corpora", "Chinese court-view generation (also judged-prose).");
par("edrm-enron-email-data-set-v2", "The review half is hosted: responsiveness/privilege-style classification over a seeded email corpus with distractors (discovery-retrieval tasks {{fam:discovery-retrieval}}), production-cost allocation (the ESI cost-allocation tasks in {{fam:damages-computation}}). The processing half (hash dedup, load-file generation, culling at corpus scale) is e-discovery software mechanics the world does not model.");
struct("gerlayqa", "German statute-grounded QA.");
host("ildc-for-cjpe", "Same as annocaselaw: English appeal-outcome prediction with rationale via required reads + pinned outcome; needs a case-record pack.");
par("lawflow", "Process-trace comparison IS the world's native grading (required_workflow_path over every task; 225 ordered-checkpoint verifiers). The entity-formation matter content (intake→structure choice→drafting) is not seeded; a company-formation pack would host it fully.");
struct("lawinstruct", "Training corpus, not an evaluation — out of scope for a verifiable world.");
struct("legalquad", "German extractive QA corpus.");
struct("lener-br", "Portuguese NER corpus.");
struct("leven", "Chinese event-detection corpus.");
struct("multieurlex", "23-language EU-law classification corpus.");
struct("pile-of-law-multilegalpile-lexfiles", "Pretraining corpora, not evaluations.");
struct("swiss-judgment-prediction", "German/French/Italian court corpora.");
struct("victor", "Portuguese supreme-court documents.");

// ---- workflows ----
struct("a2j-author", "Guided-interview + court-form-template runtime absent.");
par("appellate-practice-management", "Notice-of-appeal deadline computation with entry-vs-minute-order trigger discrimination and holiday rollover is hosted ({{fam:deadline-computation}}). Tolling-motion recomputation, record designation, and briefing schedules are not seeded (same pack shape would extend).");
cov("calendaring-docketing-with-court-rule-deadlines", "Closed by the deadline-computation pack ({{fam:deadline-computation}}): SRCP-6-style computation from trigger documents — personal vs mail service, filing vs service triggers, weekend/holiday rollover, mail-day ordering, briefing-chain day counts — with naive-method dates as forbidden traps and a no-trigger abstention task.");
cov("client-intake-conflicts-checking", "Conflicts workflow hosted end-to-end: conflict_cases chains with evidence/review/remediation creates (harvey_lab workflow tasks e.g. task_076, task_086, task_096 use legal_conflicts tools), conflicts-archive-gap abstention trap (the conflicts-archive-gap trap in {{fam:hallucination-traps}}), adverse-party search via records-research tasks; matter opening chains (task_001 family).");
par("cloc-core-12", "Spend/e-billing review hosted (legal_billing chains: invoice_reviews + amount histories, e.g. task_015; fee true-up computation the fee true-up task in {{fam:damages-computation}}). Vendor RFP management, KM, and resourcing competencies are not modeled.");
host("closing-binders-transaction-closing-management", "Conditions-precedent verification fits required-reads + pinned evidence records over executed-document sets; no closing pack yet.");
par("contract-lifecycle-management-stage-model-openclm", "Draft/negotiate/redline stages hosted (deep-drafting tasks {{fam:deep-drafting}}; cuad {{fam:cuad-clause-extraction}}; spa {{fam:spa-deal-extraction}}). Intake triage, approval-matrix routing, and post-execution obligation tracking are not seeded; an obligations pack would close the biggest missing stage.");
host("court-e-filing", "Record-level filing workflow fits (court_filings table + create tools; local-rules memo + pinned filing rows); PDF assembly/NEF mechanics stay out of scope. No filing pack yet.");
host("deposition-management", "Scheduling-against-cutoff computation + hearing-row creation fits (hearings, litigation_deadlines tables); no deposition pack yet.");
par("discovery-management", "Hosted: discovery request chains (litigation_discovery tasks e.g. task_015 family), responsiveness/privilege-style classification with enforced reads ({{fam:discovery-retrieval}}), production-cost allocation (task_169–170). Not hosted: per-request objection drafting graded at answer level, privilege-log generation.");
struct("docassemble", "Interview/document-assembly runtime absent.");
par("document-management-with-versioning-and-ethical-walls", "Superseded-version discipline is a core graded behavior (deep-drafting superseding-instruction task; superseded-draft forbidden-value traps across maud/spa/damages packs; update_matter_documents_title tool). Ethical walls and check-out/check-in are not modeled.");
host("engagement-letters-and-fee-agreements", "Engagement-letter determinations fit pinned reviews (the unexecuted-engagement-letter trap the unexecuted-engagement-letter trap in {{fam:hallucination-traps}} is adjacent); a drafting+terms pack with pinned fee determinations would host it.");
host("expert-witness-management", "26(a)(2) deadline computation + disclosure completeness checks fit the grammar (deadlines table + evidence records + required reads); no expert pack yet.");
par("juriscraper-recap-courtlistener", "Docket-entry triage and routing hosted (litigation_dockets chains, docket_entries table). Live scraping of real court systems is out of scope by design.");
host("kyc-aml-client-screening", "Screening fits the grammar perfectly: client-file documents + sanctions/PEP list documents → pinned determinations + escalation remediation traps for hits the record cannot clear. No screening pack yet.");
cov("matter-opening", "Matter-opening chains are the world's largest family: legal_matters list→get→create workflows with required-field validation enforced by tool signatures (task_001, task_063, task_067, task_075, task_085, task_095 + banking/bankruptcy/arbitration variants).");
par("outside-counsel-guidelines-compliance-billing", "Billing review + fee-computation hosted (invoice_reviews chains; fee true-up the fee true-up task in {{fam:damages-computation}}; invoice status task_016-family). UTBMS narrative coding and LEDES file generation are not modeled.");
par("settlement-negotiation-tracking", "The Rule 68 offer-of-judgment acceptance-deadline computation is hosted (mail-service adjustment task in {{fam:deadline-computation}}). The demand/offer ledger over a negotiation history is not seeded yet (fits amount_history rows with pinned values).");
struct("suffolk-document-assembly-line", "Court-form PDF completion runtime absent.");
struct("tarexp", "TAR workflow composition requires corpus-scale active-learning mechanics.");
par("time-capture-prebill-review-and-invoicing", "Invoice lifecycle hosted (update_invoices_status task_016-family; invoice_reviews chains; billing computations the fee true-up task in {{fam:damages-computation}}). Time-entry capture and prebill generation from WIP are not seeded (no time-entries table).");
host("trust-iolta-accounting-with-three-way-reconciliation", "Three-way reconciliation-to-the-penny is exactly the damages-computation shape (multi-document arithmetic with pinned results + discrepancy traps); needs a trust-ledger document pack (and optionally a trust_ledger table).");

// ---- tool categories ----
struct("awesome-lists-meta-catalogs", "Meta-catalogs, not evaluable capabilities.");
cov("awesome-legal-skills", "Its four playbooks map to live families: playbook redline (deep-drafting tasks {{fam:deep-drafting}}), compliance/risk review (cuad {{fam:cuad-clause-extraction}}, maud {{fam:maud-deal-points}}), matter intake→bill→close (legal_matters + billing chains), litigation checklists (litigation entity chains).");
cov("contraxsuite-lexnlp", "Structured field extraction from contracts is hosted with exact answer keys: spa-deal-extraction ({{fam:spa-deal-extraction}}) and maud-deal-points ({{fam:maud-deal-points}}) pin prices, escrows, caps, fees, governing law.");
cov("court-deadline-computation-rules-engines", "Hosted by the deadline-computation pack ({{fam:deadline-computation}}): rules-engine-style chained deadline computation with pinned dates and rollover/adjustment traps.");
par("eyecite", "Hallucinated-citation detection hosted as abstention traps (phantom-citation the phantom-citation trap in {{fam:hallucination-traps}}). Citation extraction/short-form resolution over real reporters is not (no citation corpus).");
struct("freeeed", "E-discovery processing software mechanics (hashing, load files) at corpus scale.");
struct("lrage", "An evaluation harness, not a task set — out of scope.");
struct("tar-evaluation-toolkit-bmi", "Baseline-model-implementation comparison requires corpus-scale TAR runs.");

// ---------------------------------------------------------------- merge
const reg = JSON.parse(readFileSync(REG, "utf8"));
const keys = new Set((reg.items ?? []).map((i) => i.coverage_key));
const unknown = Object.keys(M).filter((k) => !keys.has(k));
const unmapped = [...keys].filter((k) => !M[k]);
if (unknown.length) console.warn("adjudications for unknown keys:", unknown.join(", "));
if (unmapped.length) console.warn("registry items still unmapped:", unmapped.join(", "));
reg.manual_map = M;
reg.manual_map_meta = {
  adjudicated_at: "2026-08-10",
  method: "each item judged against world-expanded.json task inventory + verifier grammar; verdicts biased downward on uncertainty",
};
writeFileSync(REG, JSON.stringify(reg, null, 1));
console.log(`merged ${Object.keys(M).length} adjudications (${unmapped.length} unmapped remain)`);
