# Artificial Analysis Harvey LAB Leaderboard (LAB-AA) — Design Reference

Everything captured about the Artificial Analysis Harvey LAB leaderboard (https://artificialanalysis.ai/evaluations/harvey-lab-aa), plus the underlying Harvey LAB benchmark context. This is the design reference for the lawfirm-qwen leaderboard. Data extracted from the page's embedded Next.js data and the AA launch article (https://artificialanalysis.ai/articles/harvey-lab-aa), captured 2026-08-09.

---

## 1. Metrics

- **Criterion Pass Rate** (primary headline metric): share of atomic pass/fail rubric criteria satisfied by the deliverables.
- **All-pass Rate**: share of tasks where *every* criterion passes (no partial credit).
- Secondary charts: **Cost per Task (USD)**, **Token Usage** (output tokens per task), **Speed** (avg time per task), **Turns per Task**, **Score vs. Release Date**.
- Per-practice-area criterion scores exist in the embedded data (`byPracticeArea` per model) — top of table varies widely by area ("jagged intelligence"; e.g. Fable 5's per-area spread is visible in the JSON).

## 2. Full model ranking (all 35 models; n=120 tasks each)

| # | Model | Creator | Criterion Pass | All-pass | Avg turns/task |
|---|-------|---------|---------------|----------|----------------|
| 1 | Kimi K3 (max) | Kimi (Moonshot) | 94.6% | 26.7% | 94 |
| 2 | Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback) | Anthropic | 93.6% | 14.2% | 64 |
| 3 | Muse Spark 1.1 (xhigh) | Meta | 93.1% | 8.3% | 24 |
| 4 | Grok 4.5 (high) | xAI | 92.4% | 13.3% | 20 |
| 5 | Claude Opus 4.8 (Adaptive Reasoning, Max Effort) | Anthropic | 91.1% | 7.5% | 56 |
| 6 | GLM-5.2 (max) | Z AI | 91.0% | 7.5% | 60 |
| 7 | Claude Sonnet 5 (Adaptive Reasoning, Max Effort) | Anthropic | 90.1% | 5.0% | 161 |
| 8 | MiniMax-M3 | MiniMax | 88.4% | 6.7% | 64 |
| 9 | GPT-5.6 Luna (max) | OpenAI | 87.9% | 5.0% | 73 |
| 10 | GPT-5.6 Sol (max) | OpenAI | 87.2% | 1.7% | 81 |
| 11 | GPT-5.5 (xhigh) | OpenAI | 86.3% | 4.2% | 50 |
| 12 | Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort) | Anthropic | 86.0% | 4.2% | 18 |
| 13 | GPT-5.6 Terra (max) | OpenAI | 85.2% | 2.5% | 76 |
| 14 | Kimi K2.7 Code | Kimi | 85.0% | 0.8% | 46 |
| 15 | Claude Sonnet 4.6 (Non-reasoning, High Effort) | Anthropic | 84.4% | 3.3% | 15 |
| 16 | DeepSeek V4 Pro (Reasoning, Max Effort) | DeepSeek | 84.4% | 3.3% | 20 |
| 17 | Kimi K2.6 | Kimi | 84.1% | 0.0% | 38 |
| 18 | Qwen3.7 Max | Alibaba | 83.4% | 0.0% | 14 |
| 19 | Qwen3.6 27B (Reasoning) | Alibaba | 82.3% | 2.5% | 24 |
| 20 | Gemini 3.5 Flash (high) | Google | 82.1% | 1.7% | 57 |
| 21 | Qwen3.7 Plus | Alibaba | 81.8% | 1.7% | 14 |
| 22 | Nemotron 3 Ultra 550B A55B (Reasoning) | NVIDIA | 81.7% | 3.3% | 22 |
| 23 | DeepSeek V4 Flash (Reasoning, Max Effort) | DeepSeek | 81.3% | 1.7% | 19 |
| 24 | MiMo-V2.5-Pro | Xiaomi | 73.3% | 0.0% | 25 |
| 25 | Step 3.7 Flash | StepFun | 72.7% | 0.0% | 27 |
| 26 | Qwen3.5 397B A17B (Reasoning) | Alibaba | 72.4% | 0.0% | 24 |
| 27 | Mistral Medium 3.5 | Mistral | 69.1% | 0.8% | 28 |
| 28 | Grok 4.3 (high) | xAI | 68.4% | 0.0% | 16 |
| 29 | Claude 4.5 Haiku (Reasoning) | Anthropic | 61.1% | 0.0% | 17 |
| 30 | GPT-5.4 mini (xhigh) | OpenAI | 60.7% | 0.0% | 19 |
| 31 | Gemini 3.1 Pro Preview | Google | 58.9% | 0.0% | 20 |
| 32 | GPT-5.4 nano (xhigh) | OpenAI | 52.2% | 0.0% | 44 |
| 33 | Gemma 4 31B (Reasoning) | Google | 47.2% | 0.0% | 14 |
| 34 | Gemini 3.1 Flash-Lite | Google | 31.1% | 0.0% | 12 |
| 35 | gpt-oss-120b (high) | OpenAI | 13.9% | 0.0% | 97 |

Caveat: creator attributions were inferred from adjacent embedded-JSON `name` fields ("Muse Spark 1.1 → Meta" and the Grok → xAI label came from that data) — treat the Creator column as high-confidence but heuristic.

## 3. Cost / tokens / speed data points (launch article)

- Launch context: 28 models at launch; **13 of 28 fully passed zero tasks**; cost spread **~950x**.
- **Cost per task:** Claude Fable 5 ~$18.9, Claude Sonnet 5 ~$11.8, Claude Opus 4.8 ~$8.2, GLM-5.2 ~$1.3, Gemini 3.1 Flash-Lite ~$0.02.
- **Output tokens per task:** Sonnet 5 ~179k (highest), Fable 5 ~117k, Opus 4.8 ~111k, GLM-5.2 ~78k.
- **Speed (avg time per task):** DeepSeek V4 Flash ~4.4 min, GLM-5.2 ~5.0 min, Fable 5 ~16.9 min, Opus 4.8 ~18.5 min, Sonnet 5 ~22.8 min.
- Post-launch drift: the launch article listed Fable 5 as the all-pass leader (14.2%); the live page now includes Kimi K3 (26.7% all-pass / 94.6% criterion), added after launch.
- Corroborating coverage: https://cryptobriefing.com/harvey-lab-aa-legal-ai-benchmark/

## 4. AA methodology

- **120 private tasks** from Harvey spanning **24 legal practice areas**. Embedded data confirms exactly 24: antitrust-competition, arbitration-international-dispute-resolution, banking-finance, bankruptcy-restructuring, capital-markets, corporate-governance, corporate-ma, data-privacy-cybersecurity, emerging-companies-venture-capital, employment-labor, energy-natural-resources, environmental-esg, funds-asset-management, healthcare-life-sciences, immigration, insurance, intellectual-property, international-trade-sanctions, litigation-dispute-resolution, real-estate, structured-finance-securitization, tax, trusts-estates-private-client, white-collar-defense-investigations.
- Agent receives partner-style instructions + case documents in a sandbox; produces deliverables (memos, disclosure schedules, deposition summaries).
- Run on AA's **Stirrup agent harness**: context compaction instead of failure at context limits; simplified AA prompts; a code-execution tool is provided (no Harvey custom document-generation scripts); **exact filename matching required** for deliverables.
- **Grading:** criterion-by-criterion by a **single LLM judge** against task-specific rubrics — the launch article states a single **Gemini 3.1 Pro** judge. (Contrast: Harvey's own evaluation averages grades across multiple judge model families.)

## 5. Page structure / sections (for modeling our leaderboard)

1. Headline callout of top-3 (Kimi K3 94.6%, Claude Fable 5 93.6%, Muse Spark 1.1 93.1%) with a metric toggle (Criterion Pass Rate / All-pass Rate)
2. Main bar-chart leaderboard with an "18 of 35 models" show-more control
3. Cost per Task chart
4. Token Usage chart
5. Speed chart
6. Turns per Task chart
7. Score vs. Release Date scatter
8. **Example Tasks & Submissions** gallery (M&A change-of-control analysis, deposition outlines, arbitration agreements, commercial lease reviews) with real model deliverables
9. Methodology notes / differences from Harvey's own implementation

## 6. Underlying Harvey LAB benchmark context

- Official announcement (https://www.harvey.ai/blog/introducing-harveys-legal-agent-benchmark): LAB = open-source benchmark of agentic legal work structured as client matters. **1,200+ agent tasks**, **24 practice areas**, **75,000+ expert-written rubric criteria**. Each task = Instructions (partner-to-associate, ~50 words avg) + Environment (matter files: contracts, templates, communications) + Output (reviewable deliverable). **All-pass grading**: atomic binary pass/fail criteria (facts, citations, severity ratings, recommendations, formatting); "no partial credit for catching most of the issues." 18 research collaborators listed incl. Anthropic, OpenAI, Google DeepMind.
- Initial results on Harvey's held-out set (https://www.harvey.ai/blog/legal-agent-benchmark-initial-results): Claude Opus 4.7 **7.1%**, Sonnet 4.6 **5.4%**, Opus 4.6 **4.2%**, GPT-5.5 **2.1%**, Gemini 3.5 Flash **0.8%** all-pass. Practice-area leaders ("jagged intelligence"): GPT-5.5 leads Regulated & Emerging Company (retrieval-heavy); Opus 4.7 leads Corporate Transactions & Funds (synthesis); Sonnet 4.6 leads Privacy/Tax/Private-Client (statute comparison). Grading QC: agent runs graded multiple times across judge model families and averaged. Agent action space: Read, Search, Execute, Write, Validate, Edit. Cost/latency: Opus 4.7 ~$50.90/task ~22 min; GPT-5.5 ~$16.97/task; Gemini 3.5 Flash <6 min. "Frontier models complete less than 10% of tasks end-to-end."
- GitHub (https://github.com/harveyai/harvey-labs): repo = task dataset (instructions, documents, rubrics) + execution harness; v1.0; badge shows **1,671 tasks**, 24+ practice areas; 897 stars / 182 forks / 12 open issues; docs include M&A data-room tutorial, architecture, evaluation methodology (all-pass rubric scoring, LLM judge), contributing guide.
- Third-party trackers: benchlm.ai lists LAB all-pass (Harvey held-out) with Claude Opus 5 at 11.7% (only entry; updated 2026-08-07; quarterly refresh). Vals hosts an HLAB leaderboard (vals.ai/benchmarks/hlab, last updated 2026-08-07); per llm-stats, 12 models evaluated, Claude Fable 5 leading at 0.133 all-pass (July 2026 update).

## 7. Discrepancy notes

- **Task counts differ by source:** AA runs **120 private tasks**; Harvey's public release is **1,200+ tasks**; the GitHub badge shows **1,671 tasks** (public repo has grown past the blog figure); AA uses a smaller private subset. Our vendored clone contains 1,760 task.json (1,492 unique task dirs).
- **Judging differs:** AA uses a single Gemini 3.1 Pro judge; Harvey averages across multiple judge model families; the open-source harness defaults to claude-sonnet-4-6 at temperature 0.0 with optional dual-judge (gpt-5.5).
- **Score levels differ accordingly:** AA all-pass tops out at 26.7% (Kimi K3) on its 120-task subset, while Harvey's held-out set tops out around 7–12%, and Vals' HLAB hosting shows top ~0.133 (13.3%) — the same benchmark family produces different absolute numbers under different harnesses, subsets, and judges. Any leaderboard we publish must pin harness + task subset + judge to be comparable across runs.

## 8. Design implications for the lawfirm-qwen leaderboard

Derived from the AA page (not sourced claims):

1. Two-metric system (criterion pass rate for a smooth signal + all-pass for a hard headline) with a UI toggle; keep n_passed/n_criteria diagnostics.
2. Report cost, output tokens, wall-clock time, and turns per task alongside score — the ~950x cost spread is a core part of the AA story.
3. Per-practice-area (for us: per-task-family / per-flakiness-boundary) breakdowns to expose jagged capability profiles.
4. Score-vs-release-date scatter to show progress over time.
5. An example-tasks-and-submissions gallery with real deliverables builds trust in rubric grading.
6. Publish methodology deltas explicitly (harness, prompts, tools, judge model, filename matching), since these visibly change absolute scores across LAB implementations.
