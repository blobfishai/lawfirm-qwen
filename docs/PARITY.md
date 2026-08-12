# Parity audit — how much of the downloaded corpus do we host?

`HOSTED` means we read the benchmark's own task definitions and/or documents out of
`research/repos/` and run them: their data, their ground truth. `INSPIRED` means we wrote
tasks in that benchmark's shape from our own knowledge — defensible content, but **not**
coverage of that benchmark, and it is not counted as such here.

| Benchmark | Task definitions available | Hosted | Parity |
|---|---|---|---|
| harvey-labs (practice + contracts) | 1,760 | 0 | 0.0% |
| harvey-labs firm-knowledge (C&H) | 250 | 250 | 100.0% |
| LegalBench | 162 | 160 | 98.8% |
| MAUD | 92 | 92 | 100.0% |
| CUAD | 41 | 41 | 100.0% |
| ACORD | 1 | 0 | 0.0% |
| ObliQA | 1 | 0 | 0.0% |
| LawFlow | 1 | 0 | 0.0% |
| LawBench | 1 | 0 | 0.0% |
| lex-glue | 1 | 0 | 0.0% |
| **total** | **2,310** | **543** | **23.5%** |

## Our own tasks, by provenance

| Source | Tasks |
|---|---|
| hosted (generator reads research/repos/) | 4 |
| inspired (authored from knowledge) | 155 |
| original world / graph-walk | 132 |
| **world total** | **291** |

## What this corrects

`docs/COVERAGE.md` reports 24 covered / 17 partial / 0 hostable-gap against a registry of
101 items. That registry is a list of URLs and descriptions; the verdicts were reached by
reading abstracts, not by running the benchmarks' own tasks. It measures *whether the world
could express a shape*, which is a real question, but it is not parity and should never
have been read as parity. This file measures parity.
