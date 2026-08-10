# Legal-AI Evaluation Inventory

Complete inventory of legal-AI evals relevant to the lawfirm-qwen project (a blobfish-generated executable law-firm simulation world whose tasks are anchored to benchmark task shapes). Sources: eight vendored benchmark packs under `~/.blobfish/eval-anchors/vendor/` (counts verified against local files) plus web research (2026-08-09).

Companion document: `aa-leaderboard-reference.md` — the Artificial Analysis Harvey LAB leaderboard, our leaderboard design reference.

---

## Part I — Vendored benchmarks

### 1. Harvey LAB (Legal Agent Benchmark), v1.0

**Publisher:** Harvey AI (github.com/harveyai/harvey-labs) · **Source:** vendored · **Agentic:** yes

An open-source (MIT) benchmark from Harvey AI for evaluating LLM agents on realistic legal work. Each task is a directory with a `task.json` (title, instructions, inline pass/fail rubric, deliverables map) plus a `documents/` folder of synthetic matter files; an execution harness runs the agent in a Podman sandbox with six filesystem tools (bash, read, write, edit, glob, grep) to produce deliverables (typically .docx memos, redlines, drafts), which an LLM judge grades criterion-by-criterion under an all-pass scoring scheme.

**Total items:** 1,760 task.json in this clone (1,492 unique task dirs; 411 scenario-variant task.json). README badge says 1,671 tasks; docs/eval-strategies.md says 1,660 tasks / ~101,000 rubric criteria (clone has 111,814 criteria).

**Task families:**

| Family | Count | Shape |
|---|---|---|
| analyze (work_type=analyze) | 488 | Read a synthetic multi-document matter file, synthesize/reconcile facts, compute figures (e.g., HHI, market shares), write an analytical memo checked against dozens of fact-specific PASS/FAIL criteria. Example: antitrust market-share memo with 50 criteria such as "PASS if the memo identifies the Cornerstone total addressable market figure as $12.35 billion." |
| draft (work_type=draft) | 444 | Draft legal work product from scratch or precedent — complaints, consent decrees, leniency applications, compliance training, markups — graded on required provisions and quality dimensions. |
| review (work_type=review) | 306 | Issue-spotting and document review: identify problems/risks in a counterparty document, agreement, or filing; criteria enumerate specific findings that must appear. The tutorial anchor task (corporate-ma data-room red-flag review) ships 60 synthetic matter documents and a 68-criterion rubric. |
| research (work_type=research) | 24 | Legal research tasks producing a research memo; smallest family. |
| contracting (tasks/contracts/, no work_type field) | 498 | Contract-lifecycle tasks across 14 deal domains (commercial-vendor-customer 106, financing 51, banking 48, corporate-ma 45, channel-partnerships 44, ip-licensing 39, data-privacy 35, pe-funds 30, employment 24, healthcare 23, real-estate 23, disputes 19, energy 6, media 5). Sub-shapes: first-draft (93), playbook-escalation (87), first-turn-redline (82), subsequent-turn-redline (56), plus term-negotiation and counterparty-paper-review variants (~180). Example: escalation/approval memo comparing counter-redline to internal policy playbook, quantifying financial exposure via a provided model. |

**Grading:** LLM judge (default claude-sonnet-4-6, temperature 0.0) evaluates each rubric criterion independently with `evaluation/prompts/rubric_criterion.txt`, returning binary pass/fail with recorded reasoning; the judge sees only the deliverable files that criterion declares. Task score is **all-pass**: 1.0 only if every criterion passes, else 0.0 (n_passed/n_criteria kept as diagnostics). No gold-reference outputs, no keyword/regex matching — the match_criteria text is the standard. Optional `--dual` mode grades with claude-sonnet-4-6 and gpt-5.5 and averages (per-task 0.0/0.5/1.0; strict both-agree also reported). Criteria: ~63.5 mean / 57 median per task (min 23, max 1114); 111,814 total in this clone.

**Document corpus:** In this vendored clone: none — `.git/info/sparse-checkout` limits tasks/ to `tasks/**/task.json` only (0 non-task.json files under tasks/). Upstream, each task ships a `documents/` folder of synthetically generated matter files (batch-generated under human-lawyer guidance/review); the tutorial task alone has 60 documents in .docx/.xlsx/.pptx/.pdf/text formats parsed via Pandoc/MarkItDown/pdfplumber.

**Limitations:** All grading is semantic LLM-as-judge with no gold reference (temperature 0.0 mitigates but does not remove model dependence; dual-judge is optional). All-pass scoring is intentionally harsh — one missed criterion of up to 1,114 zeroes the task. Documents are synthetic, so it measures work on simulated, not real, matters. This vendored clone cannot execute tasks (documents/, sandbox/, scripts/ withheld) — only instructions+rubrics are inspectable locally. Counts drift across sources (1,760 clone / 1,671 badge / 1,660 docs; 26 top-level practice-area dirs locally vs "24 + contracting" badge). No human grading, no execution-based verification of deliverables, no built-in repeatability protocol beyond re-running sweeps.

---

### 2. Harvey BigLaw Bench (public samples repo)

**Publisher:** Harvey (harveyai) · **Source:** vendored · **Agentic:** yes (Workflows sub-benchmark; Core is single-shot)

A legal-AI evaluation framework from Harvey's legal research team measuring LLM performance on realistic billable lawyer work, split into three sub-benchmarks: **Core** (single-shot legal problem-solving over provided documents), **Workflows** (composite/agentic tasks, currently SPA deal-point extraction into a JSON schema), and **Retrieval** (query-over-corpus retrieval quality). The vendored repo is the public sample subset only; the full dataset requires contacting Harvey. Headline metric: "what % of a lawyer-quality work product does the model complete for the user?"

**Total items:** 46 public sample items (verified: core-samples.csv = 6 rows, retrieval samples.csv = 30 rows, spa-samples.csv = 10 rows). The full benchmark is much larger (core task numbering runs to at least 96) and private.

**Task families:**

| Family | Count | Shape |
|---|---|---|
| BLB-Core (baseline legal problem-solving) | 6 | Given 1–5 attached legal PDFs (court filings, transcripts, merger agreements, precedent agreements), produce a lawyer-quality work product: client alert, GC memo, board consent, negotiation-terms analysis, or objections explanation. Graded against a per-task point rubric with hallucination penalties. 3 Litigation + 3 Transactional samples; README lists 9 Transactional + 7 Litigation task-type categories in the full private corpus. |
| BLB-Workflows — SPA Deal Points (agentic extraction) | 10 | For each SPA PDF, extract ~28 standard deal points (parties, price, indemnification survival/cap/basket, termination rights, governing law, notices, etc.) into the JSON structure of schema.json (19 top-level keys, nested); spa-samples.csv provides gold answers (10 rows × 29 columns). Example gold: HealthEquity SPA → Base Purchase Price $50,000,000; Governing Law Delaware. |
| BLB-Retrieval (retrieval-system quality) | 30 | Given a natural-language query and one of three corpora, find the relevant documents/passages; queries stress cross-references and defined terms (contracts) or thread/metadata relationships (emails). 10 queries per corpus; CSV ships queries only, no gold relevance labels. |

**Grading:** Custom per-task rubrics with affirmative points (Structure / Style / Substance checklist questions, each 1–2 points, e.g. "Does the response state that the Court vacated the 2021 NBPP in its September 2023 order? (1 point)") plus negative points ("-1 point for every hallucination; -0.5 for every accurate but extraneous or misconstrued statement"). Two rubric dimensions per README: Answer Quality and Source Reliability (verifiable citations). Workflows-SPA grades extraction against gold answer values per field. No automated grader/scoring code ships — rubrics imply human or LLM-judge application.

**Document corpus:** 54 real PDFs total (verified by ls): blb-core/documents 14 (D.D.C. docket filings, Enron/AES call transcripts, Skilling deposition, Synopsys/Ansys merger doc, 5 precedent merger agreements); blb-retrieval 30 (10 merger agreements, 10 SPAs, 10 Clinton-FOIA discovery emails); blb-workflows/spa 10 SPAs (4 overlap by filename with retrieval SPAs). ~82MB including .git.

**Limitations:** Public repo is a small sample slice, so scores on it are not comparable to Harvey's published results. No harness, scoring scripts, or judge prompts ship — rubric application (including hallucination counting and Source Reliability) is subjective with no inter-rater calibration. Retrieval has no gold relevance judgments, so it cannot be scored as-shipped. No agentic environment/tooling provided (agents bring their own PDF parsing/retrieval stack); Workflows gold answers are free-text strings requiring fuzzy matching. Static shallow clone, no repeatability or versioned splits.

---

### 3. LegalBench (Stanford / HazyResearch)

**Publisher:** Stanford HazyResearch (Neel Guha, Julian Nyarko, Daniel E. Ho, Christopher Ré, et al.; arXiv 2308.11462) · **Source:** vendored · **Agentic:** no

A collaboratively built benchmark of **162 legal-reasoning tasks** contributed by 40 lawyers, law professors, and legal-NLP researchers, designed to measure six types of legal reasoning in English-language LLMs. Each task is a dataset of input-output pairs (mostly short-text classification, some extraction/generation) drawn from real legal materials — commercial contracts (CUAD), merger agreements (MAUD), NDAs (ContractNLI), privacy policies (OPP-115), court opinions, and lay legal-aid posts (LearnedHands). The vendored clone ships per-task directories with prompt templates, READMEs, TSV data splits, plus `evaluation.py` with official scoring functions.

**Task families** (counts exact from tasks.py; 17+5+12+118+10=162 verified):

| Family | Count | Shape |
|---|---|---|
| issue-spotting (ISSUE_TASKS) | 17 | Read a lay situation description (mostly Reddit r/legaladvice posts from LearnedHands, plus corporate_lobbying bill/company pairs) and classify Yes/No whether it raises a particular legal issue (housing, immigration, torts, benefits, etc.). |
| rule-recall (RULE_TASKS) | 5 | State/identify the content of a legal rule from memory with no supporting text: open questions about federal/state law (rule_qa), foreign citizenship law, NY judicial ethics, citation prediction. Tests parametric legal knowledge; rule_qa's local train.tsv is header-only (50 test samples on HuggingFace). |
| rule-application (shares the 12 CONCLUSION_TASKS) | 12 | Same 12 datasets as rule-conclusion, scored on whether the model's step-by-step explanation correctly applies the stated rule to the facts (application_prompt.txt / train_explanations.txt variants). The application/conclusion split is a prompting-and-grading distinction from the paper — tasks.py has no separate list. |
| rule-conclusion (CONCLUSION_TASKS) | 12 | Given a fact pattern, output only the legal conclusion (usually Yes/No or a category): hearsay, personal jurisdiction, diversity jurisdiction 1–6, Abercrombie trademark distinctiveness, successor liability, telemarketing sales rule, UCC v. common law. |
| interpretation (INTERPRETATION_TASKS) | 118 | Read a real contract clause, policy passage, or disclosure and classify what it says: 38 CUAD clause-type tasks, 34 MAUD merger-agreement MCQ tasks, 14 ContractNLI NDA-entailment tasks, 9 OPP-115 privacy-policy tasks, 10 supply-chain-disclosure tasks, plus consumer_contracts_qa, insurance_policy_interpretation, unfair_tos, sara (tax entailment/numeric), ssla, privacy_policy_qa/entailment, jcrew_blocker, proa. |
| rhetorical-understanding (RHETORIC_TASKS) | 10 | Analyze what a passage of legal argument/judicial writing does rhetorically: overruling detection, definition classification + term extraction, decision-section function, oral-argument question purpose, causal reasoning, textualism tools, SCALR holding-matching. |

**Grading:** Programmatic, per evaluation.py: ~157 tasks use exact-match balanced accuracy after normalization (lowercase, strip punctuation); successor_liability and ssla_* use F1 over predicted class/name sets; sara_numeric counts answers within 10% of the correct dollar amount; definition_extraction uses stemmed-match accuracy; citation_prediction_open uses substring containment of the case name; rule_qa is in MANUAL_EVAL_TASKS and must be hand-graded.

**Document corpus:** Real legal text throughout: 179 TSV files locally totaling 47,590 rows (counted). Most task dirs ship only the small few-shot train split (typically 4–8 rows, e.g. hearsay=5, cuad_audit_rights=6); 16 tasks (MAUD and OPP-115 subsets) also ship full test.tsv locally; full test splits (~90k+ examples benchmark-wide per the paper) live on HuggingFace (nguha/legalbench).

**Limitations:** Static single-turn Q&A/classification — no environment, no tool use, no multi-step drafting or research workflows. Mostly binary/multiple-choice exact-match, which misses reasoning quality except via the (hand-graded) rule-application variants; rule_qa requires manual evaluation so is not automatically repeatable. Heavily skewed toward interpretation (118/162). English/US-centric. Local clone alone is insufficient to run full evals (most test splits on HuggingFace). The repo merges rule-application and rule-conclusion into one 12-task list, so "six types" spans five task lists.

---

### 4. LegalAgentBench

**Publisher:** CSHaitao (Tsinghua-affiliated academic group; GitHub CSHaitao/LegalAgentBench) · **Source:** vendored · **Agentic:** yes

An agentic benchmark for LLM agents in the Chinese legal domain (paper: "LegalAgentBench: Evaluating LLM Agents in Legal Domain"). Agents answer **300** realistic legal/commercial-investigation questions (company lookups, litigation research, multi-hop cross-table reasoning, legal-document drafting) by calling ~37 tools over 17 corpora (structured tables of listed-company info, registrations, judgments, courts, law firms, enforcement/dishonesty/administrative-penalty cases, plus legal article/case/knowledge retrievers). Ships ReAct, plan-and-solve, and plan-and-execute harnesses; tools execute against a remote HTTP API rather than local data.

**Task families:**

| Family | Count | Shape |
|---|---|---|
| 1-hop lookup (type 1-x) | 80 | Single tool call against one table (company info, registration code, court address, law-firm contacts, case parties), report 1–3 extracted fields. Example: 金宏气体 lookup → keys 688106, 金向华, 陈莹. |
| 2-hop reasoning (type 2-x) | 82 | Chain two tools across tables (company → its judgments; case → court info), often with filtering/summing over amounts. Includes 2 items whose type label is a raw tool-chain string. |
| 3-hop reasoning (type 3-x) | 58 | Three chained tool calls, e.g. resolve full company name → list judgments → rank by 涉案金额 → look up court code of the top case (key: 北京市大兴区人民法院). |
| 4-hop reasoning (type 4-x) | 40 | Four chained tool calls across tables with aggregation/comparison; graded on final keys plus intermediate key_middle strings. |
| 5-hop reasoning (type 5-x) | 20 | Five-plus chained tool calls (the 'way' field shows chains up to 6 tools across all families: 84 one-tool, 78 two-, 58 three-, 40 four-, 12 five-, 8 six-tool tasks). |
| Legal document writing (empty type field) | 20 | Draft a full Chinese legal document (e.g. 答辩状 responding to a supplied 起诉状), grounding party addresses, legal representatives, credit codes, cited statutes via table lookups and retrievers. Graded by key-string containment and BERTScore vs a reference document. |

**Grading:** Deterministic keyword containment (src/evaluation/eval.py): each task has gold "key" strings; answer-rate score = fraction of key strings found via substring match (`res.find(k)`) in the agent's final response. "Process rate" mode additionally checks "key_middle" intermediate-hop strings against the trajectory summary. A third mode computes BERTScore F1 (for writing tasks) by POSTing to a remote scoring service. No LLM judge, no human grading.

**Document corpus:** No raw corpus vendored (clone is 4.1MB). README claims 17 corpora; locally src/schema.py defines 14 structured-table schemas + three retrieval tools imply 3 text corpora (14+3=17). All corpus access goes through a hardcoded remote API (http://47.114.81.51:48000/law_api). Only data/dataset.json (300 Q/A items) ships locally.

**Limitations:** Not reproducible offline: all 37 tools and 17 corpora live behind a hardcoded third-party HTTP endpoint that may be dead; BERTScore grading calls another remote service; no corpus data or tool implementations vendored (generated_tools.py contains only name/description stubs). Substring-match grading rewards keyword presence, not correctness (wrong answer mentioning the gold string scores full credit; correct paraphrases/number-format variants score zero). Chinese-only, single reference answer per task, no answer-position or reasoning-quality check; dirty labels (2 tasks with tool-chain strings as type, 20 writing tasks with empty type). 36 Tool instances locally vs 37 claimed.

---

### 5. CUAD (Contract Understanding Atticus Dataset), v1

**Publisher:** The Atticus Project (Hendrycks, Burns, Chen, Ball; NeurIPS 2021) · **Source:** vendored · **Agentic:** no

Expert-annotated legal contract review dataset. The task is extractive clause identification: for each of 41 clause categories, highlight the span(s) of a commercial contract that a lawyer should review, in SQuAD 2.0-style format (with unanswerable questions when the clause is absent). Includes HuggingFace Transformers training code and a precision-recall evaluation harness (evaluate.py).

**Total items:** 20,910 QA pairs in CUADv1.json (510 contracts × 41 questions each, verified); 6,702 have at least one gold answer span, the rest are correctly-unanswerable negatives. Split: test.json = 102 contracts / 4,182 QAs (1,244 answerable); train_separate_questions.json = 408 contracts / 22,450 QAs (multi-answer questions split into separate entries, 11,180 answerable).

**Task families:**

| Family | Count | Shape |
|---|---|---|
| Clause span extraction (extractive QA over contracts) | 20,910 | Given the full contract text and one of 41 category prompts phrased as a question, extract the exact relevant span(s), or return no answer if absent. Example: "Highlight the parts (if any) of this contract related to 'Parties' that should be reviewed by a lawyer." |
| Clause categories (41 labels, one row each in category_descriptions.csv) | 41 | Document Name; Parties; Agreement Date; Effective Date; Expiration Date; Renewal Term; Notice Period to Terminate Renewal; Governing Law; Most Favored Nation; Non-Compete; Exclusivity; No-Solicit of Customers; Competitive Restriction Exception; No-Solicit of Employees; Non-Disparagement; Termination for Convenience; Rofr/Rofo/Rofn; Change of Control; Anti-Assignment; Revenue/Profit Sharing; Price Restrictions; Minimum Commitment; Volume Restriction; IP Ownership Assignment; Joint IP Ownership; License Grant; Non-Transferable License; Affiliate License-Licensor; Affiliate License-Licensee; Unlimited/All-You-Can-Eat-License; Irrevocable or Perpetual License; Source Code Escrow; Post-Termination Services; Audit Rights; Uncapped Liability; Cap on Liability; Liquidated Damages; Warranty Duration; Insurance; Covenant Not to Sue; Third Party Beneficiary. |

**Grading:** Executable verifier (evaluate.py): predicted spans matched to gold spans by word-level Jaccard similarity ≥ 0.5 (IOU_THRESH), after lowercasing and punctuation stripping; "Parties" additionally accepts substring containment. Precision/recall swept over model confidence thresholds on n-best predictions; headline metrics AUPR, Precision@80% Recall, Precision@90% Recall. No LLM judge, no human grading.

**Document corpus:** 510 real commercial contracts (SEC EDGAR filings: supply, license, distribution agreements) shipped in data.zip as SQuAD-format JSON (~40MB full set). Page count NOT stated in local files — the commonly cited "13,000+ pages/annotations" figure is from the external paper only. Repo links (externally) to several GB of unlabeled contract pretraining data and Zenodo checkpoints.

**Limitations:** Static extraction benchmark, not agentic — only span highlighting. Fuzzy-match grading (Jaccard 0.5) means semantically correct paraphrases score wrong and near-miss spans score right; "Parties" substring exception is hard-coded. Eval harness assumes n-best predictions with probabilities (built for extractive QA models); generative LLMs require adapting output format and confidence sweep. Fixed 2021 41-category taxonomy; single gold annotation set treats ambiguous cases as unambiguous. Public SEC exhibits → heavy pretraining contamination risk. Measures clause finding only, not legal judgment, risk assessment, drafting, or negotiation.

---

### 6. MAUD (Merger Agreement Understanding Dataset)

**Publisher:** Atticus Project / MAUD authors (Wang, Scardigli, Tang, Chen, Levkin, Chen, Ball, Woodside, Zhang, Hendrycks; arXiv:2301.00876) · **Source:** vendored · **Agentic:** no

Expert-annotated dataset for merger agreement review, used in the 2021 ABA Public Target Deal Points Study. Given an excerpt from a public-target merger agreement, answer a "deal point" question by selecting one answer from a fixed multiple-choice set (e.g., Type of Consideration → "All Cash"). Vendored repo ships full data plus BERT-family fine-tuning/evaluation code (single-task and multi-task classification heads).

**Total items:** 39,231 annotated rows (MAUD_train.csv 25,827 + MAUD_dev.csv 6,753 + MAUD_test.csv 6,651, verified by parsing).

**Task families:**

| Family | Count | Shape |
|---|---|---|
| Deal-point multiple-choice questions over merger agreement excerpts | 144 | 144 (question, subquestion) classification tasks derived from 92 distinct top-level deal-point questions, spanning 7 categories: Deal Protection and Related Provisions; Material Adverse Effect; Conditions to Closing; Operating and Efforts Covenant; Knowledge; General Information; Remedies. Each has a fixed answer set (2–26 options; 60 of 144 binary). Three text variants per source: main (original excerpts), abridged, rare_answers (counterfactually edited; absent from test). Example: "Type of Consideration-Answer" over a conversion-of-securities excerpt → "All Cash". |

**Grading:** Multiple-choice classification with integer-mapped answer sets. The repo evaluator (src/maud/eval_utils.py, pr_curves.py) scores fine-tuned classifiers by AUPRC — mean minority-class AUPR over every (question, answer) pair, weighted by n_classes when aggregating. For LLM use it reduces to exact-match against the gold answer string.

**Document corpus:** 152 real public-target merger agreement full texts (data/contracts/contract_*.txt in data.zip, ~240–500KB each; 153 unique contract names across splits). Raw source CSVs (main.csv, abridged.csv, counterfactual.csv) included.

**Limitations:** Static classification over pre-extracted clause excerpts — no agentic environment, no retrieval step (the model is handed the relevant excerpt, not asked to find it in a 300KB contract), no free-text drafting/reasoning grading. Fixed ABA answer taxonomies may miss novel drafting; some labels extremely rare (synthetic rare_answers counterfactuals absent from test, so test coverage of rare labels is thin). Shipped AUPR harness targets fine-tuned BERT classifiers. Corpus is 2021-era US public-target merger agreements only.

---

### 7. GC AI In-House Legal Bench (representative examples repo)

**Publisher:** GC AI (getgc.ai) · **Source:** vendored · **Agentic:** no

A benchmark evaluating AI assistants on day-to-day in-house/general-counsel legal work: contract risk review, regulatory research, document extraction, and legal strategy advice. Each task pairs a natural-language prompt with an attorney-built answer key of binary pass/fail criteria. Full benchmark is 100 tasks across 10 categories (README claim); this vendored repo is a representative subset of **10 tasks** plus a 4-item baseline quality rubric applied across all tasks. Answer keys in the subset have 7–13 criteria each (94 total; README says full bench averages 12/task).

**Task families:**

| Family | Count | Shape |
|---|---|---|
| Contract and filing document review | 3 | Review a specific real document (linked by URL, not shipped) from a stated client perspective: GNWT construction contract risk review (13 criteria), SEC patent license redaction candidates (12), retail terms-of-use arbitration comparison across four retailers (8). |
| Regulatory / legal research | 4 | Research current law/legislation into a structured answer: EU frameworks for a children's app launch, US state synthetic food-dye bills with bill numbers and status, employee uniform pin legal issues, IEEPA tariff-refund action checklist. Graded on issue-identification, legal-accuracy, citation-sources. |
| Document data extraction | 1 | Extract every category of personal data collected, every purpose of use, and every third-party sharing category from Zoom's live privacy statement into a table; graded on extraction completeness, instruction-following, no-hallucination. |
| Legal strategy / counseling advice | 2 | GC-style counsel on a business scenario: CPSC reporting obligations and recall-vs-stop-sale strategy for a defective smart home device (8,000 units, 12 complaints, no injuries); risk-organized end-of-life guidance for a consumer gaming device. |
| Baseline quality criteria (cross-cutting) | 4 | Four pass/fail criteria applied to every response: covers material issues without padding; reads as confident practical counsel (not a disclaimer factory); gives a clear next step; avoids verbosity/boilerplate. |

**Grading:** Per-criterion binary pass/fail against attorney-developed answer keys. Each entry has a criteriaType (risk-identification, legal-accuracy, issue-identification, follow-user-instructions, authority-applicability, citation-sources, no-hallucination, formatted-well, recommendation-quality, action-item-identification), a provision label, and passCriteria text. The grader implementation (LLM judge vs. human attorney) is NOT shipped — only rubrics and a methodology JPG; README defers to a GC AI blog post.

**Document corpus:** None shipped. Tasks that involve documents reference live external URLs (GNWT contract PDF, Zoom privacy statement, SEC patent license filing, four retailers' TOU) that the assistant under test must fetch itself.

**Limitations:** Only 10 of the claimed 100 tasks are public; the 100-task/10-category figure is not locally verifiable. No grading harness or judge implementation included — scoring is not repeatable from this pack alone and criteria like "reads as confident practical counsel" are inherently subjective. Single-turn prompt-to-response: no environment/tool-use measurement, no multi-turn counseling, no file-based drafting/redlining. Several tasks depend on live web content that drifts, making answer keys perishable. No train/test split, no reference answers (only criteria), no license beyond "research and evaluation purposes."

---

### 8. TaxCalcBench (Column Tax tax-calc-bench, v1 TY24 + v2 TY25)

**Publisher:** Column Tax (column-tax/tax-calc-bench; paper arXiv:2507.16126) · **Source:** vendored · **Agentic:** no

Tests whether LLMs can natively compute complete US personal income tax returns (the "calculation" step of tax filing) from a fully-specified set of taxpayer inputs. TY24 (51 cases) gives proprietary JSON inputs for federal-only Form 1040 returns; TY25 (50 cases) gives realistic taxpayer PDFs (W-2s, 1099s, prior-year 1040, etc.) plus remaining_data.json, and adds state returns (CA, IL, NY, VA) and more complex situations. The model outputs a line-by-line text rendering of the 1040 (and state forms for TY25), compared numerically against expert-authored expected IRS MeF XML.

**Total items:** 101 (51 TY24 + 50 TY25, counted from test_data dirs).

**Task families:**

| Family | Count | Shape |
|---|---|---|
| TY24 federal-only tax return calculation (JSON input) | 51 | Given a proprietary JSON with all taxpayer data, calculate the full Form 1040 plus needed schedules for TY2024 in a pipe-delimited line format; 19 key 1040 lines numerically graded against expected MeF XML. Case names encode scenarios: single-w2-minimal-wages-alaska, hoh-w2-1099g-unemployment-schedulec-loss, mfj-capital-gains-losses-wash-sale-dependent. |
| TY25 federal + state tax return calculation from realistic PDFs | 50 | Given raw taxpayer PDFs (W-2, 1099-G, 1099-B, 1098, prior-year 1040) plus remaining_data.json, calculate the TY2025 federal return and, for 40/50 cases, the state return (CA/IL/NY/VA); graded on jurisdiction-specific scored lines (82 ScoredField definitions across 5 jurisdictions). 10 cases each: ty25-us, ty25-ca, ty25-il, ty25-ny, ty25-va. Optional web-search tool for supported models. |

**Grading:** Deterministic executable verifier, no LLM judge: TaxReturnEvaluator parses the [Amount] after the last pipe on each required output line and compares it to the value at a fixed XPath in the expected MeF XML (TY24: 19 evaluated lines in LINES_TO_XPATH_VALUES; TY25: 82 ScoredField label/XPath pairs in ty25_scoring.py). Metrics: Correct returns strict (all lines exact), lenient (within ±$5), Correct by line, by-line lenient; pass@1/pass^k for multi-run tests.

**Document corpus:** 101 hand-built test cases authored by Column Tax's human Tax Software Analyst experts. TY24 ships input.json + expected output.xml per case. TY25 ships realistic taxpayer PDFs + remaining_data.json + expected MeF output.xml per case. Repo (275MB) also vendors saved model outputs and evaluation reports for leaderboard quick-eval mode.

**Limitations:** Single-shot generation, not agentic — no environment, no tax software to operate; only optional web search. Only a subset of return lines is scored, so errors on unscored forms/lines go unmeasured; a missing line parses as 0.0 rather than failing. Output is a simplified text format, not real MeF XML. Narrow coverage: TY24 federal-only simple situations; TY25 only 4 states. Document collection and data-entry assumed perfect. Proprietary hand-built expected answers with no public IRS answer key; 101 cases is small; model runs can fail to complete (missing outputs treated as generation failures); results depend heavily on thinking-budget settings.

---

## Part II — Web-researched benchmarks

### 9. Vals AI Legal AI Report (VLAIR), Feb 27, 2025

**Publisher:** Vals AI with an Am Law 100 consortium · **Source:** web · **Agentic:** no (product-level task outputs)

First independent, systematic benchmark of commercial legal-AI **products** against a blind lawyer control group, using real tasks sourced from Am Law 100 firms (Reed Smith, Fisher Phillips, McDermott Will & Emery, Ogletree Deakins + 4 anonymous firms supplied 500+ samples). Tools compared: Harvey Assistant (6 tasks), Thomson Reuters CoCounsel 2.0 (4 tasks), vLex Vincent AI (6 tasks), Vecflow Oliver (incl. EDGAR Research, the only tool to attempt it); LexisNexis completed evaluation but withdrew.

**Task families and counts:**

| Task | Questions | Documents | Grading checks |
|---|---|---|---|
| Data Extraction | 30 | 29 | 204 |
| Document Q&A | 30 | 13 | 77 |
| Document Summarization | 20 | 20 | 197 |
| Redlining | 20 | — | 69 |
| Transcript Analysis | 30 | 6 | 54 |
| Chronology Generation | 10 | 10 | 118 |
| EDGAR Research | 100 | — | 100 accuracy + 123 citation checks |

**Headline accuracy (exact published figures):**

| Task | Lawyer Baseline | Harvey Assistant | CoCounsel | Vincent AI | Oliver |
|---|---|---|---|---|---|
| Data Extraction | 71.1% | **75.1%** | 73.2% | 69.2% | 64.0% |
| Document Q&A | 70.1% | **94.8%** | 89.6% | 72.7% | 74.0% |
| Document Summarization | 50.3% | 72.1% | **77.2%** | 58.9% | 62.4% |
| Redlining | **79.7%** | 65.0% | — | 53.6% | — |
| Transcript Analysis | 53.7% | **77.8%** | — | 64.8% | — |
| Chronology Generation | **80.2%** (tie) | 80.2% | 78.0% | — | 66.9% |
| EDGAR Research | **70.1%** | — | — | — | 55.2% |

Takeaways: AI beat lawyers on Data Extraction, Document Q&A, Summarization, Transcript Analysis; lawyers won Redlining and EDGAR Research. Harvey topped 5 of its 6 tasks; CoCounsel averaged 79.5% across its 4. AI was 6–80x faster (Harvey/CoCounsel typically <1 min; Oliver 5+ min, agentic workflow).

**Grading:** Vals automated LLM-as-judge; each rubric check scored pass/fail; task score = share of checks passed (EDGAR citation scoring separated from accuracy). Lawyer baseline via Cognia Law: independent lawyers, blind, normal client format, two-week window, time-on-task recorded.

**Limitations (stated):** EDGAR questions not optimized for tool filters; small non-confidential datasets for Transcript/Chronology; evaluates text output not full product workflows; LLM-judge limits. Dataset private, not reproducible externally.

### 10. VLAIR — Legal Research report (Oct 23, 2025)

**210 questions** across nine legal research types; blind evaluation by a law-firm/academic consortium; scoring weighted **Accuracy 50% / Authoritativeness 40% / Appropriateness 10%**. Results: Counsel Stack 81% (top), Alexi 80%, ChatGPT ~80%, Midpage 79% vs **lawyer baseline 71%** — both legal-specific and generalist AI now beat lawyers on research accuracy. AI won 15 of 21 question types; multi-jurisdictional questions dropped ~11 points vs single-state; lawyers averaged ~1,400 seconds per answer vs seconds/minutes for AI. Non-agentic; private dataset.

### 11. Vals AI live legal leaderboards (as of Aug 2026)

- **LegalBench leaderboard** (vals.ai/benchmarks/legal_bench-04-15-2025): 6 reasoning categories; ~133 models; top ~88.6%; models strongest at issue-spotting/conclusions (~92%), weakest at rhetorical analysis (top ~84%).
- **Legal Research Bench** (vals.ai/benchmarks/legal_research): proprietary **agentic** benchmark (case-law search, web search, doc retrieval tools) built with Fisher Phillips, McDermott Will & Emery, Reed Smith, Legal Technology Hub; rubrics authored/peer-reviewed by practicing lawyers (1–31 items, mean 9.35); primary **all-pass** metric; ~32 models; top all-pass ~55.3% (Claude Opus-class) — agentic legal research remains hard.
- **Harvey's Legal Agent Benchmark hosting** (vals.ai/benchmarks/hlab): 32 models listed on the benchmarks index with top ~25.4%; per llm-stats, 12 models evaluated with Claude Fable 5 leading at 0.133 all-pass (July 2026 update; last updated Aug 7, 2026).
- Adjacent: CaseLaw v2 (archived; Canadian court cases); CorpFin v2 (~131 models, top ~73.2%); TaxEval v2 (~136 models, top ~80.4%).

Note: live leaderboard names/scores were read via automated extraction on 2026-08-09 and shift as models are added; the VLAIR Feb-2025 and Oct-2025 numbers above are fixed published results.

### 12. Thomson Reuters CoCoBench + Scorecard

**Source:** web · **Agentic:** yes (explicitly targets agentic systems) · **Public:** no scores disclosed; partial visibility

- **CoCoBench** (TR Institute, ~May 2026): "hundreds of attorney-authored benchmark tasks" with a fixed core dataset; built by 100+ legal SMEs, ~15,000 hours. Categories: research, drafting, review, multi-step reasoning across workflows. Grading: "ideal-response evaluation" against attorney-drafted gold answers to a "fiduciary-grade standard," scoring the final deliverable **plus the citation record produced along the way**. Targets longer unaided task horizons and end-to-end workflows.
- **Scorecard platform**: proprietary eval infra (built by ex-Waymo testing engineers); CoCounsel runs **1,500+ tests nightly** under attorney oversight, **1M+ tests total** since launch. Attorney Trust Team hand-writes and peer-reviews tests, then trains an LLM grader for automated regression. Internal, not externally reproducible.

### 13. Stanford HAI / RegLab hallucination studies

**Source:** web · **Agentic:** no (query-level, human-graded audits)

- **Dahl et al. 2024** ("Large Legal Fictions"): general-purpose LLMs hallucinate on legal queries **58–82%** of the time.
- **Magesh et al., "Hallucination-Free?"** (arXiv 2405.20362; JELS 2025): RAG legal research tools still hallucinate — initial version >17% of queries; augmented version: **Westlaw AI-Assisted Research 33% hallucination / 42% accurate; Lexis+ AI 17% hallucination / 65% accurate**.

LexisNexis itself publishes no benchmark (marketing claims only; withdrew from VLAIR) — these are the only independent numbers on its tools.

### 14. Academic legal-NLP benchmarks (all static / non-agentic)

Every benchmark below is a static, single-turn dataset — classification, QA, NLI, retrieval, or generation graded against gold labels or an LLM judge. None is agentic; the closest to pipeline evaluation are CLERC (retrieval → RAG generation) and LEXam (multi-step reasoning graded by ensemble LLM-judge), but both grade static outputs.

| Benchmark | Scope | Grading | Key numbers |
|---|---|---|---|
| **LexGLUE** (arXiv 2110.00976) | 7 English tasks: ECtHR-A/B, SCOTUS, EUR-LEX, LEDGAR, UNFAIR-ToS, CaseHOLD (splits e.g. EUR-LEX 55k/5k/5k, LEDGAR 60k/10k/10k, CaseHOLD 45k/3.9k/3.9k) | micro/macro-F1, mean-aggregated | Best baseline Legal-BERT 79.8 µ-F1 / 72.0 m-F1; ChatGPT zero-shot 47.6% avg µ-F1 (62.8% ECtHR-B, 70.2% LEDGAR) |
| **LEXTREME** (arXiv 2301.13126) | 11 datasets, 18 tasks, 24 languages (8 single-label, 5 multi-label, 5 NER) | macro-F1 aggregated over datasets and languages | Best baseline XLM-R-large 61.3 aggregate; ChatGPT also struggles |
| **CaseHOLD** (arXiv 2104.08671) | 53,000+ five-way MCQ holding questions from citing passages | macro-F1/accuracy | Domain pretraining on ~3.5M US decisions → 7.2% F1 gain (~12% relative), largest documented in legal NLP |
| **ContractNLI** (arXiv 2110.01799) | 607 NDAs × 17 fixed hypotheses: Entailment/Contradiction/NotMentioned + evidence-span identification | accuracy/F1 + span mAP / precision@recall | Existing models "fail badly"; negation-by-exception a noted failure mode |
| **ECHR violation prediction** (Chalkidis et al. 2019, P19-1424) | ~11.5k ECtHR cases; binary violation, multi-label article, importance regression | F1 / micro-F1 | Hierarchical BERT set SOTA; successors are LexGLUE ECtHR-A/B |
| **LEXam** (arXiv 2505.12864; ICLR 2026) | 340 Swiss/European law exams, 116 UZH courses (2016–2023), EN+DE; 4,886 questions in paper v1 (2,841 open + 2,045 MCQ); 7,537 on current site | MCQ accuracy; open questions via ensemble LLM-judge with human expert validation | Open: GPT-5 70.20, Gemini-2.5-Pro 67.40, Claude-3.7-Sonnet 62.86, Claude-4.5-Sonnet 62.76. MCQ: GPT-5 62.65, Claude-4.5-Sonnet 58.01, Claude-3.7-Sonnet 57.23, Gemini-2.5-Pro 55.72 |
| **LawBench** (Chinese, arXiv 2309.16289) | 20 tasks × 3 cognitive levels (memorize/understand/apply), 5 task types | per-task auto metrics (acc/F1, ROUGE, soft match), avg 0–100 | 51 LLMs evaluated; GPT-4 best at 52.35 |
| **LexEval** (Chinese, arXiv 2409.20288, NeurIPS 2024 D&B) | 23 tasks, 14,150 questions; LexCog taxonomy of 6 abilities; 6,250 newly expert-annotated | automatic per-task metrics | Largest Chinese legal benchmark |
| **SCALE / "One Law, Many Languages"** (arXiv 2306.09237) | 7 Swiss Federal Supreme Court datasets, 5 languages (DE/FR/IT/Romansh/EN); IR, court view generation, summarization, citation extraction, 8 classification tasks; docs up to 50K tokens | task-specific automatic metrics | 14 open + 5 closed models all low; worst on CVG and IR |
| **CLERC** (arXiv 2406.17186, NAACL Findings 2025) | US case law retrieval + RAG from >1.8M Caselaw Access Project federal documents | recall/precision@k; ROUGE + citation quality + hallucination analysis | Zero-shot IR only 48.3% recall@1000; GPT-4o highest ROUGE but hallucinates most |
| **LegalDiscourse** (NAACL 2024) | 602 state-law paragraphs, 3,715 spans, 1,671 relations, 8 discourse elements; 100k+ laws scraped from 52 US states/territories | span/relation F1; annotator agreement >0.8 | Few-shot GPT-3.5 performs poorly on both subtasks |
| **Bar exams** | MBE MCQ, UBE (MBE+MEE+MPT), MPRE | MCQ accuracy scaled to NCBE score; essays human-graded | GPT-3.5 50.3% MBE (Dec 2022); GPT-4 297 UBE, claimed ~90th percentile, passes every jurisdiction (highest threshold Arizona 273); Martínez re-evaluation puts GPT-4 below 69th percentile vs July takers, lower on essays; GPT-4 and Claude 2 both passed simulated MPRE (56–64% thresholds) |

### 15. Agentic / interactive legal environments (2025–2026)

The closest published analogues to an executable law-firm world:

- **J1Bench** (FudanDISC, ACL 2026; github.com/FudanDISC/J1Bench): "interactive and comprehensive legal agent benchmark" — agents complete tasks through multi-participant interaction under procedural rules, across **six legal environments** (J1-Eval dataset); tied to the China AI and Law Challenge; tested GPT-4o, Qwen3-32B, etc. Fully agentic/interactive — the closest tau-bench analogue in law.
- **LegalWorld** (arXiv 2606.18728): life-cycle interactive environment chaining consultation → drafting → first- and second-instance trial in one case, so factual carryover and error amplification are observable. Agentic simulation environment, not static QA.
- **Counsel** (arXiv 2606.21627): meta-evaluation dataset for agentic legal tasks — 21 tasks; human meta-grading of both final answers and intermediate reasoning; models incl. DeepSeek-R1, Kimi; public on Hugging Face.
- **OccuBench** (arXiv 2604.10866): professional-task agent benchmark via LLM-simulated tool environments (Language Environment Simulators) — 100 scenarios, 10 industries, 65 domains, **382 evaluation instances**, avg 5.5 tools / 16.2 tool calls per task, rubric-graded, with **fault-injection** conditions (timeouts, truncated data). Legal is not a named category, but it is the clearest tau-bench-style "simulated professional world" template. Scores: GPT-5.2 79.6%, Gemini 3.1 Pro 72.3%, Claude Opus 4.6 71.5% across 15 models; no model dominates all industries.
- **tau2-bench** itself (sierra-research) has **no legal domain** — retail/airline/telecom only; Toloka's extension adds policy-aware settings but not law.

Non-entities: **CourtBench** and **RegBench** do not appear to exist as legal/regulatory LLM benchmarks (searches resolve to LegalBench/JusticeBench and RuleArena/RegSum respectively).

**Field takeaway for lawfirm-qwen positioning:** the agentic-legal-eval field splits into (a) Harvey LAB + Vals HLAB (rubric all-pass, sandboxed file tools, pass rates <10–27%), (b) TR CoCoBench (private, attorney gold answers + citation-record grading), (c) academic interactive environments (J1Bench, LegalWorld — procedural/interactive but China-law-centric and without executable file-system worlds), and (d) hallucination audits (Stanford). Nothing found combines an executable law-firm world with boundary-proven flaky tasks; OccuBench's fault-injection LES design is the nearest methodological neighbor.

---

## Master table

Items = total scored items as defined by each benchmark (tasks / QA pairs / questions / cases). "Executable env?" = ships or defines a runnable environment the agent operates in. "Deterministic grading?" = programmatic verifier with no LLM/human judge. "Repeatable?" = fully re-runnable from public materials with stable grading. "Doc corpus shipped?" = reference documents included in the distributed package.

| Benchmark | Items | Families | Agentic? | Executable env? | Deterministic grading? | Repeatable? | Doc corpus shipped? |
|---|---|---|---|---|---|---|---|
| Harvey LAB v1.0 (vendored) | 1,760 task.json (clone; badge 1,671) | 5 (analyze/draft/review/research/contracting) | Yes | Yes upstream (Podman sandbox, 6 fs tools); not in clone | No (LLM judge, all-pass) | Partial (judge-model-dependent; temp 0.0) | Upstream yes; vendored clone no |
| Harvey BigLaw Bench (public samples) | 46 | 3 (Core/Workflows/Retrieval) | Partly (Workflows) | No (BYO stack) | Partial (SPA gold answers; rubrics otherwise) | No (no grader ships; retrieval unlabeled) | Yes (54 real PDFs) |
| LegalBench | 162 tasks (~90k+ test examples) | 6 (5 task lists) | No | No | Yes (exact-match/F1; rule_qa manual) | Yes (test splits via HuggingFace) | Partial (few-shot TSVs local; test on HF) |
| LegalAgentBench | 300 | 6 (1–5-hop + writing) | Yes | Remote HTTP API only (may be dead) | Yes (keyword containment; BERTScore via remote svc) | No (remote dependencies) | No (schemas only) |
| CUAD v1 | 20,910 QA pairs | 2 (span extraction; 41 categories) | No | No | Yes (Jaccard-0.5 verifier) | Yes | Yes (510 contracts) |
| MAUD | 39,231 rows (144 MCQ tasks) | 1 | No | No | Yes (MCQ exact-match / AUPR) | Yes | Yes (152 merger agreements) |
| GC AI In-House Legal Bench | 10 public (100 claimed) | 5 (incl. cross-cutting baseline) | No | No | No (subjective rubrics, no grader) | No (live-URL dependencies, perishable keys) | No (external URLs) |
| TaxCalcBench (TY24+TY25) | 101 | 2 | No | No (optional web search only) | Yes (XPath-vs-XML numeric verifier) | Yes | Yes (JSON inputs + taxpayer PDFs + gold XML) |
| VLAIR (Feb 2025) | 240 questions / 7 tasks | 7 | No | No | No (LLM-as-judge rubric checks) | No (private) | No |
| VLAIR Legal Research (Oct 2025) | 210 questions | 9 question types | No | No | No (weighted blind consortium grading) | No (private) | No |
| Vals Legal Research Bench (live) | ~32 models ranked; rubrics mean 9.35 items | 1 (agentic research) | Yes | Yes (search/retrieval tools, hosted) | No (rubric all-pass) | No (proprietary) | No |
| TR CoCoBench / Scorecard | Hundreds of tasks (1,500+ nightly tests) | 4 categories | Yes | Internal | No (LLM grader trained on attorney gold) | No (private) | No |
| Stanford hallucination audits | Query sets (product audits) | 1 | No | No | No (human-graded) | No | No |
| LexGLUE | 7 tasks (e.g. 45k–60k train rows each) | 7 | No | No | Yes (F1) | Yes | Yes (public datasets) |
| LEXTREME | 18 tasks / 11 datasets / 24 languages | 3 types (SLC/MLC/NER) | No | No | Yes (macro-F1) | Yes | Yes |
| CaseHOLD | 53,000+ MCQ | 1 | No | No | Yes | Yes | Yes |
| ContractNLI | 607 NDAs × 17 hypotheses | 2 (NLI + evidence spans) | No | No | Yes | Yes | Yes |
| ECHR prediction (2019) | ~11.5k cases | 3 subtasks | No | No | Yes | Yes | Yes |
| LEXam | 4,886 (paper) / 7,537 (site) | 2 (open + MCQ) | No | No | Partial (MCQ yes; open = ensemble LLM-judge) | Partial | Yes |
| LawBench (Chinese) | 20 tasks | 3 cognitive levels | No | No | Yes (auto metrics) | Yes | Yes |
| LexEval (Chinese) | 14,150 questions / 23 tasks | 6 abilities (LexCog) | No | No | Yes | Yes | Yes |
| SCALE (Swiss) | 7 datasets, 5 languages | ~4 task types | No | No | Yes | Yes | Yes |
| CLERC | >1.8M-doc corpus; retrieval + generation sets | 2 (IR + RAG generation) | No (pipeline-style) | No | Partial (IR yes; generation ROUGE/citation) | Yes | Yes |
| LegalDiscourse | 602 paragraphs / 3,715 spans / 1,671 relations | 2 (spans + relations) | No | No | Yes (F1) | Yes | Yes |
| Bar exams (MBE/UBE/MPRE) | Exam-length item sets | 3 exam formats | No | No | Partial (MCQ yes; essays human) | Partial (NCBE materials licensed) | No |
| J1Bench | 6 interactive environments (J1-Eval) | 6 environments | Yes | Yes (multi-participant procedural sim) | Unknown | Partial (public repo) | Partial |
| LegalWorld | Case life-cycles | 1 chained life-cycle | Yes | Yes (interactive simulation) | Unknown | Partial | Partial |
| Counsel (meta-eval) | 21 tasks | 1 | Yes (grades agent trajectories) | No | No (human meta-grading) | Yes (on HF) | Yes |
| OccuBench | 382 instances / 100 scenarios | 10 industries | Yes | Yes (LLM-simulated tool envs + fault injection) | No (rubric-graded) | Partial | Simulated |

## Part III — Discovery sweep additions (2026-08-10)

Four-angle discovery sweep (github-benchmarks, github-agentic-workflow, lawfirm-workflows, nonenglish-and-competitions), deduplicated into `domain-registry.json` (101 entries total; 99 new beyond this inventory's 29). Compact summary of the newly found items only; full detail (what agents must do, world requirements) lives in `data/research/domain-registry.json` keyed by `coverage_key`.

| Name | Kind | Lang | Size | Task families |
|---|---|---|---|---|
| AgentCourt (adversarial evolvable lawyer agents) | agent-benchmark | zh | courtroom simulation framework with granular annotations across trial stages; 1,000 sim... | adversarial litigation argumentation; lawyer-agent self-improvement via case experience; adversarial courtroom simulation (evolvable lawyer agents vs judge/plaintiff/defendant roles); +1 more |
| AgentsCourt / SimuCourt (+ Legal-KB) | agent-benchmark | zh | SimuCourt: 420 Chinese judgment documents across 3 case types (first-instance, second-i... | court debate simulation; precedent/statute retrieval; judgment drafting; +2 more |
| ALKiln (SuffolkLITLab/ALKiln) | agent-benchmark | en | framework; Gherkin .feature test suites per interview | write Gherkin tests for an interview; diagnose/fix interview logic from failing tests; regression testing of form changes |
| Crosby Multi-turn Negotiation Bench | agent-benchmark | en | launched June 2026 by law firm Crosby; size undisclosed | multi-turn contract negotiation; redline response; playbook adherence |
| OpenProBono | agent-benchmark | en | open-source platform (backend/API + bots) | cited legal research reports; source-verification (every claim cited); practice-area-scoped Q&A |
| TERMS-Bench | agent-benchmark | en | Bayesian-game bilateral price negotiation testbed; 13 LLM agents evaluated | bilateral negotiation under private information |
| ACORD (Atticus Clause Retrieval Dataset) | benchmark | en | 114 queries, 126,000+ expert-ranked query-clause pairs (1–5 stars), ACL 2025 | precedent clause retrieval for contract drafting |
| ArabLegalEval | benchmark | ar | multitask QA benchmark from Saudi legal documents + translated MMLU/LegalBench items | Arabic legal QA; translated legal reasoning |
| BSARD (Belgian Statutory Article Retrieval Dataset) | benchmark | fr | 1,108+ questions labeled against 22,600+ Belgian law articles; 1,100+ citizen legal que... | statutory article retrieval; statutory article retrieval for citizen questions |
| CALRK-Bench | benchmark | ko | context-aware legal reasoning benchmark for Korean law (2026) | context-grounded legal reasoning |
| CaseGen (multi-stage Chinese legal case document generation) | benchmark | zh | ~500 real cases, 4 chained generation stages | drafting defense statements; writing trial facts; composing legal reasoning; +1 more |
| Chinese Labor Law LLM Benchmark | benchmark | zh | labor-law-specialized task set (2026) | labor-law QA and case analysis (domain-vertical evaluation) |
| ContractEval | benchmark | en | CUAD test split (102 contracts × 41 risk categories), 19 models evaluated; NLLP 2025, a... | clause-level risk identification; contract review; clause-level risk spotting; +1 more |
| DISC-Law-Eval (DISC-LawLLM evaluation suite) | benchmark | zh | objective MCQ set (multi-difficulty, from Chinese legal exams) + subjective QA set | objective legal MCQ (single/multi answer, 3 difficulty bands); subjective legal QA graded by LLM judge |
| DLawBench | benchmark | zh | multi-turn legal consultation benchmark (2026) | multi-turn consultation; fact elicitation |
| GerDaLIR (German Dataset for Legal Information Retrieval) | benchmark | de | GerDaLIR: 123k+ retrieval queries from German case law; LegalQuAD: 200 QA pairs; BenGER... | legal information retrieval; extractive QA; subsumption reasoning; +1 more |
| Hallucination-detection cluster 2026 (Who Checks the Citations?; Le... | benchmark | en | three 2026 arXiv benchmarks (2606.21155, 2606.18021, 2605.08583) for detecting legal ci... | citation hallucination detection; typed hallucination auditing |
| IL-TUR (Indian Legal Text Understanding and Reasoning) | benchmark | en/hi + 9 Indian languages/en/hi/multi (9 Indian languages) | 8 tasks over Indian legal documents; 8 tasks with leaderboard (ACL 2024) | classification; summarization; translation; +10 more |
| JBE-QA | benchmark | ja | Japanese bar exam QA dataset (2025) | bar exam QA |
| JEC-QA (thunlp) | benchmark | zh | 26,365 MCQ from China's National Judicial Examination; 26,365 multiple-choice/multiple-... | judicial exam MCQ (knowledge-driven and case-analysis); knowledge-driven bar-exam MCQ; case-analysis bar-exam MCQ (with retrieval over legal materials) |
| KBL (Korean Benchmark for Legal Language Understanding) | benchmark | ko | 7 knowledge tasks (510 ex) + 4 reasoning tasks (288 ex) + Korean bar exam (4 domains, 5... | legal knowledge QA; legal reasoning; bar exam MCQ |
| KoBLEX | benchmark | ko | open legal QA with multi-hop statutory reasoning (2025) | multi-hop statute QA |
| Korean Canonical Legal Benchmark | benchmark | ko | knowledge-independent legal reasoning items (2025) | knowledge-independent rule application |
| LAiW (Chinese Legal LLM Benchmark) | benchmark | zh | 14 tasks in 3 levels (BIR/LFI/CLA) | basic information retrieval (NER, article recommendation, element recognition); legal foundation inference (similar case matching, controversy focus mining, charge prediction); complex legal application (judgment prediction, judicial summarization, consultation) |
| LBox Open (Korean legal benchmark) | benchmark | ko | 147k-precedent corpus; tasks: case-name cls 11.3k, statute cls 2.8k, criminal LJP, civi... | case name classification from facts; statute prediction from facts; criminal judgment prediction (fine/imprisonment ranges); +2 more |
| Legal RAG Bench (Isaacus) | benchmark | en (AU) | 4,876 passages (Victorian Criminal Charge Book) + 100 expert questions with long-form a... | passage retrieval; grounded long-form legal QA; error attribution |
| LegalCiteBench | benchmark | en | 1,000 root cases → 23,646 evaluation instances, 5 task families; ICML 2026 AI4Law | citation retrieval; citation completion; citation error detection; +2 more |
| LegalEval (SemEval-2023 Task 6) | benchmark | en (India) | 3 subtasks over Indian court judgments; 26 participating teams | rhetorical role labeling; legal NER; judgment prediction with explanation |
| LegalEval-Q | benchmark | en | quality-evaluation benchmark for LLM-generated legal text (2025) | legal text quality scoring |
| LegalHalBench | benchmark | zh | hallucination benchmark spanning 7 Chinese civil/criminal law areas + 3 automatic metrics | hallucination-audited legal QA |
| LegalLens (2024 shared task) | benchmark | en | NER + NLI datasets for legal violation identification in unstructured text; best NER F1... | violation NER; violation-resolution NLI |
| LexGenius | benchmark | zh | 7 dimensions × 11 tasks × 20 abilities; MCQ from recent cases and exams; 12 SOTA LLMs e... | legal knowledge MCQ; case reasoning; professional ethics; +1 more |
| LexRAG | benchmark | zh | 1,013 multi-turn consultation dialogues, 5 rounds each + 17,228-article candidate corpus | conversational statute retrieval; multi-turn consultation response generation |
| LexRubric | benchmark | en/zh | rubric-guided diagnostic benchmark for open-ended legal tasks (2026) | open-ended legal generation with diagnostic rubrics |
| LLeQA | benchmark | fr | 1,868 expert-annotated long-form questions + Belgian statutory corpus | long-form grounded legal QA; statute retrieval |
| Magis-Bench | benchmark | pt | 74 questions from 8 Brazilian magistrate exams (2023-2025); 23 models evaluated | judicial-level drafting and review; judicial sentence drafting; discursive legal analysis (multi-turn) |
| MASLegalBench | benchmark | en | 950 MCQs from 15 expert-authored GDPR court cases | IRAC-decomposed deductive reasoning; multi-agent role decomposition; GDPR compliance analysis |
| NitiBench | benchmark | th | NitiBench-CCL (Thai financial law) + NitiBench-Tax (real tax rulings) | RAG legal QA; tax-case reasoning |
| ObliQA / RegNLP RIRAG | benchmark | en | 27,869 questions over 40 ADGM financial-regulation documents (~640k words); RIRAG-2025 ... | regulatory passage retrieval; obligation-grounded answer generation |
| PLawBench | benchmark | zh | 850 questions, 13 practical scenarios, ~12,500 expert rubric items; ACL 2026 | legal consultation; case analysis; document generation |
| SARA (StAtutory Reasoning Assessment) | benchmark | en | 9 simplified IRC sections, 376 cases (276 entailment + 100 numeric) with Prolog gold re... | statutory entailment; numeric tax liability computation |
| STARD | benchmark | zh | 1,543 real non-professional queries labeled against 55,348 statute candidates | statute retrieval from layperson queries |
| Summarization cluster (Multi-LexSum, CaseSumm, EurLexSum, UK/IN-Abs) | benchmark | en/multi | Multi-LexSum: 9,280 expert summaries at 3 granularities over 40k CRLC documents; CaseSu... | multi-document case summarization; granularity-controlled summarization |
| TAR stopping-rule research line (QBCB, Kneedle, GRLStop, point-proc... | benchmark | en | multiple papers 2023-2026 with shared TREC/RCV1/CLEF collections | review-stopping certification; recall estimation under sampling budget |
| TREC Legal Track (2006-2011) | benchmark | en | 685,592 docs (EDRM Enron v1: 455,449 emails + 230,143 attachments); ~40+ topics as mock... | responsive-document-retrieval; high-recall search; relevance assessment appeal/adjudication; +1 more |
| TREC Total Recall Track (2015-2016) | benchmark | en | 290,099 Jeb Bush governor emails; 34 topics | continuous active learning (CAL); review-budget management; stopping decision |
| TriBench-Ko | benchmark | ko | 1,414 binary items; 4 tasks × risk categories × 10 legal domains; arXiv:2605.03792 | summarization; precedent retrieval; issue extraction; +2 more |
| CAIL (China AI & Law Challenge, 2018–2025 umbrella) | competition | zh | CAIL2018: 2.68M criminal cases; later years add tracks (similar case matching 8.9k trip... | judgment prediction; similar case matching; judicial reading comprehension; +15 more |
| COLIEE (Competition on Legal Information Extraction/Entailment) | competition | en/ja/multi | Task1: 650+ queries over ~128k Canadian cases; Task3/4: ~808 Japanese Civil Code questi... | case-law retrieval; case entailment; statute retrieval; +10 more |
| Philip C. Jessup International Law Moot Court Competition (+ GenAI ... | competition | en | annual Compromis (agreed case record); ~700 teams; SSRN study: 10 LLM-generated memoria... | written memorial drafting for Applicant and Respondent from a fixed case record; oral pleading rounds (human); rubric-scored evaluation (published 1–100-per-criterion scoring rubric) |
| Willem C. Vis International Commercial Arbitration Moot | competition | en | annual Problem (arbitration case record under CISG); ~370+ teams | memorandum for Claimant and Respondent (CISG + arbitral procedure issues); oral arbitration hearings (human) |
| AnnoCaseLaw | dataset | en | 471 US Appeals negligence cases with fine-grained annotations | annotated judgment prediction |
| CAIL2018 (Legal Judgment Prediction dataset) | dataset | zh | 2.68M criminal cases (Supreme People's Court published) | law article prediction; charge identification; prison-term estimation |
| CAIL2019-SCM (Similar Case Matching) | dataset | zh | 8,964 triplets (private-lending cases from China Judgments Online) | triplet similar-case matching |
| CJRC (Chinese Judicial Reading Comprehension, CAIL2019 track) | dataset | zh | ~10k judgment documents / ~50k questions (span, yes/no, unanswerable) | extractive span QA over judgments; yes/no QA; unanswerable detection |
| Court View Generation corpora (Ye et al. 2018; C3VG-style, CAIL-der... | dataset | zh | ~100k+ fact→court-view pairs across corpora (derived from Chinese criminal judgments) | court view / judicial rationale generation (本院认为 section) |
| EDRM Enron Email Data Set v2 | dataset | en | 1,234,387 emails, 242,800 unique content SHA1s, 151 custodians; PST + EDRM XML load-fil... | ingestion/extraction; deduplication (hash-based); load-file generation; +2 more |
| GerLayQA (German layperson legal QA) | dataset | de | 21,538 layperson questions with lawyer answers grounded to German law-book paragraphs; ... | layperson legal QA with paragraph grounding; layperson question answering grounded in statute paragraphs; statute paragraph retrieval |
| ILDC for CJPE (Indian Legal Documents Corpus) | dataset | en | ~35k Indian Supreme Court cases; expert-annotated explanation test set | binary appeal-outcome prediction; decision explanation (gold rationale spans) |
| LawFlow (minnesotanlp) | dataset | en | complete end-to-end workflows from trained law students on business entity formation ca... | end-to-end workflow simulation; process-trace comparison; entity-formation matter handling (intake → structure choice → drafting); +1 more |
| LawInstruct | dataset | multi (24 languages) | 58 legal datasets converted to 12M instruction examples, 17 jurisdictions | instruction tuning corpus |
| LegalQuAD (German legal extractive QA) | dataset | de | ~200 question–document pairs (small; also used as an MTEB retrieval task) | extractive QA over German legal documents; QA-style retrieval |
| LeNER-Br (Brazilian legal NER) | dataset | pt | 70 documents (66 court, 4 legislation), token-level NER labels | legal NER (incl. Legislation and Jurisprudence entity classes) |
| LEVEN (CAIL2022 legal event detection) | dataset | zh | 8,116 documents, 150,977 event mentions, 108 event types | legal event detection (trigger identification + typing) |
| MultiEURLEX (multilingual EU-law classification; LEXTREME sub-dataset) | dataset | multi (23 EU languages) | 65k EU laws in 23 languages, EUROVOC multi-label | multi-label EUROVOC topic classification; cross-lingual zero-shot transfer |
| Pile of Law / MultiLegalPile / LexFiles (corpora) | dataset | en / multi | 256GB (Pile of Law); 689GB, 24 languages, 17 jurisdictions (MultiLegalPile); LexFiles: ... | legal corpus |
| Swiss-Judgment-Prediction | dataset | de/fr/it (+ EN MT) | 85k Swiss Federal Supreme Court cases, 2000–2020, with year/legal-area/canton metadata | binary judgment outcome prediction (approval/dismissal); robustness/fairness slicing by language, canton, year, legal area |
| VICTOR (Brazilian Supreme Court document dataset) | dataset | pt | 692k+ STF documents, expert-annotated | document type classification; multi-label process theme assignment |
| A2J Author | workflow | en | 1,000+ live guided interviews; used 7M+ times since 2005 | guided interview design; court form population; SRL-facing plain-language question drafting |
| Appellate practice management | workflow | en | — | notice-of-appeal deadline computation with tolling motions; record designation and transcript ordering; briefing schedule computation and recalculation on extensions; +2 more |
| Calendaring / docketing with court-rule deadlines | workflow | en | — | trigger-event identification from documents; rules-based deadline computation (FRCP 6 / state analogues); deadline-chain generation; +3 more |
| Client intake + conflicts checking | workflow | en | — | conflict search across parties/matters/contacts; adverse-party and related-entity identification; conflict waiver drafting; +3 more |
| CLOC Core 12 (legal operations competency framework) | workflow | en | 12 functions x 4 maturity stages + Maturity Assessment Playbook | outside-counsel spend analysis / e-billing audit; vendor RFP and panel management; matter intake and resourcing; +2 more |
| Closing binders / transaction closing management | workflow | en | — | closing checklist creation and status tracking; signature packet assembly and tracking; conditions-precedent verification gate; +3 more |
| Contract Lifecycle Management stage model + OpenCLM | workflow | en | OpenCLM: AGPL v3 software (self-hosted contracts, approvals, e-signature, clause librar... | contract intake triage; template+clause-library drafting; approval-matrix routing; +2 more |
| Court e-filing (CM/ECF) | workflow | en | — | docket-event selection and PDF assembly; PII redaction compliance check; filing submission and NEF processing; +3 more |
| Deposition management | workflow | en | — | notice vs subpoena selection and drafting; scheduling against availability and discovery cutoff; vendor booking (reporter/videographer); +3 more |
| Discovery management (requests, responses, privilege logs, meet-and... | workflow | en | — | discovery request/response tracking with deadlines; response drafting with per-request objections; responsiveness + privilege document review; +4 more |
| docassemble | workflow | multi | platform; thousands of public interviews | interview authoring (YAML logic); document assembly (template → PDF/DOCX); client intake automation; +1 more |
| Document management with versioning and ethical walls | workflow | en | — | document profiling and filing; version check-out/check-in discipline; email-to-matter filing; +3 more |
| Engagement letters and fee agreements | workflow | en | — | engagement letter drafting from template + matter facts; fee-arrangement selection and rate-table population; e-signature status tracking; +2 more |
| Expert witness management (FRCP 26(a)(2)) | workflow | en | — | expert retention and engagement tracking; disclosure deadline calendaring (90/30-day rules); report completeness check against the six 26(a)(2)(B) elements; +4 more |
| Juriscraper + RECAP/CourtListener (Free Law Project docket stack) | workflow | en | scrapers for 400+ US courts; tens of millions of records; PACER Fetch APIs | docket sheet parsing to structured entries; new-filing alert triage; document fetch + matter-file routing; +1 more |
| KYC/AML client screening | workflow | en | — | identity verification and document collection; beneficial-ownership chain resolution; sanctions/PEP/adverse-media list screening with false-positive adjudication; +3 more |
| Matter opening (new business intake) | workflow | en | — | matter record creation with required-field validation; staffing and rate assignment; SOL date computation and calendaring; +2 more |
| Outside-counsel-guidelines compliance billing (LEDES/UTBMS) | workflow | en | — | UTBMS task/activity coding of narratives; OCG rule application and violation flagging; LEDES 1998B file generation and validation; +3 more |
| Settlement negotiation tracking | workflow | en | — | demand/offer ledger maintenance; authority-limit compliance checking; Rule 68 offer-of-judgment deadline handling (14-day acceptance); +3 more |
| Suffolk Document Assembly Line (court-form interview library) | workflow | en | 100+ open-source court-form interviews (MA and beyond), quarterly-updated | court-form completion end-to-end; e-filing packet preparation; interview localization/adaptation |
| TARexp (eugene-yang/tarexp) | workflow | en | framework (used with TREC/RCV1 collections) | TAR workflow composition; stopping-rule selection/justification; cost-recall tradeoff analysis |
| Time capture, prebill review, and invoicing | workflow | en | — | time entry creation and coding; prebill generation from unbilled WIP; narrative-quality and duplicate review; +3 more |
| Trust / IOLTA accounting with three-way reconciliation | workflow | en | — | trust deposit/disbursement posting; earned-fee transfer to operating; three-way reconciliation to the penny; +3 more |
| Awesome lists / meta-catalogs (maastrichtlawtech/awesome-legal-nlp,... | tool-category | multi | 5 actively maintained catalogs; Jeryi-Sun/LLM-and-Law updated daily as of July 2026 | catalog |
| awesome-legal-skills (lawve-ai) | tool-category | multi | 238+ agent skills across 24 practice areas | playbook redline (draft→review→redline→negotiate); compliance gap analysis + roadmap; matter intake→plan→bill→close; +2 more |
| ContraxSuite + LexNLP (LexPredict) | tool-category | en | OSS (AGPL): extraction of 20+ entity kinds, hundreds of clause types, pretrained models | structured field extraction from contracts; clause-type classification; portfolio-wide contract triage |
| Court-deadline computation rules engines (CalendarRules / DocketCal... | tool-category | en | commercial rule sets covering federal + state courts; no full OSS engine found | deadline chain computation from trigger events; holiday/weekend rollover handling; service-method adjustments; +1 more |
| eyecite (Free Law Project) | tool-category | en | library; tested against 55M+ citations | citation extraction; short-form/id resolution to antecedents; brief cite-checking (validity + format); +1 more |
| FreeEed (shmsoft/FreeEed) | tool-category | en | open-source platform; processes 1,400+ file types | processing pipeline operation; keyword-search culling; review-set assembly; +1 more |
| LRAGE (Legal RAG Evaluation toolkit) | tool-category | multi | toolkit; integrates Pile-of-Law, LegalBench, LawBench, KBL corpora; smolagents integration | RAG pipeline evaluation harness; agent evaluation harness |
| TAR Evaluation Toolkit / BMI (Cormack-Grossman Baseline Model Imple... | tool-category | en | VM + scripts; baseline for Total Recall tracks | baseline comparison for review agents |

Items found by the sweep but already inventoried (registry keeps them with `already_in_inventory: true`): Harvey LAB extensions: M&A Due Diligence (+ announced enterprise search, fund formation, investigations/discovery); Ready Jurist One / J1Bench (J1-EVAL, FudanDISC).
