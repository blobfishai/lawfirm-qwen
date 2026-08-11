# D — The systems: what the agent actually calls

**Status:** partial. D1 (product/competitor census) is running as a corpus-wide
vendor grep; D2 (API surfaces) is answered for the six products we mirror; D3
(multi-system disagreement) and D4 (real usage workflows) are open.

**Evidence:** `research/repos/harveyai@harvey-labs` (harness),
`research/repos/agentic-ops@legal-mcp`, `research/repos/grafana@mcp-grafana`,
`research/repos/freelawproject@courtlistener`.

---

## D2a — The two agent surfaces in this domain are radically different

### Harvey LAB: six filesystem tools in a container

`harness/tools.py` exposes exactly six: **`bash`, `read`, `write`, `edit`,
`glob`, `grep`**. `sandbox/sandbox.py` runs each episode in a Docker container
with one bind-mounted workspace:

- `$DOCUMENTS_DIR` — task documents, **read-only**
- `$OUTPUT_DIR` — deliverables; relative `write`/`edit` paths route here
- `$WORKSPACE_DIR/skills/<name>/scripts/` — format manuals for producing binary
  `.docx` / `.xlsx` / `.pptx` deliverables (`harness/skills/`)

`read` parses `.docx`, `.xlsx`, `.pptx`, `.pdf` and plain text
(`harness/system_prompt.md`). There is **no domain API at all** — no matter
records, no docket calls, no billing. The legal system is the *filesystem*.

LAB also ships an anti-hack rule of exactly the kind our verifiers implement:

> Task configuration (`task.json`) — contains the task definition and the
> grading rubric. Do not read, search, or reference it. Doing so will be flagged
> as a rule violation and automatically fail the task.

### `agentic-ops/legal-mcp`: a domain MCP server

58 functions across `tools/` — `contract_tools.py`, `citation_tools.py`,
`privilege_tools.py`, `brief_tools.py`, `research_tools.py`,
`document_tools.py`, `deep_analysis_tools.py`, `analysis_queue_tools.py`,
`integration_tools.py` — backed by SQLite (`_init_db`, `_get_conn`, `_db_path`),
with 204 PACER and 180 CourtListener references and an async analysis queue
(`get_analysis_status`, `list_analysis_jobs`, `get_analysis_result`).

This is the shape our world implements, and it independently confirms two of our
choices: **CourtListener/PACER as the docket surface**, and **SQL-backed tools
rather than stubbed returns**.

### `grafana/mcp-grafana`: the density bar

**111 `MustTool` registrations.** Our largest single product surface is
`practice-management.json` at 36 tools; our whole v3 census is 88 across six
products. Per-product, we are well under the bar a mature MCP server sets.

## D2b — The six products we mirror, and their real counterparts

| Our simulated product | Mirrors | Tools | Dialect |
|---|---|---|---|
| LexOperis PM | Clio Manage API v4 | 36 | `clio` |
| CourtDock Records | CourtListener REST v4 | 13 | `courtlistener` |
| DiscoParse | Relativity REST (Object Manager + productions) | 11 | `relativity` |
| MatterVault DMS | iManage Work API | 10 | `imanage` |
| Fieldstone Workspace | Google Workspace (Sheets/Drive/Gmail/Calendar) | 10 | `google` |
| LedgerBill | LEDES 1998B e-billing exchange | 8 | `ledes` |

CourtListener's real router registrations, from
`freelawproject@courtlistener/cl/api/`: `alerts`, `audio`, `courts`, `debts`,
`dockets`, `gifts`, `opinions`, `parties`, `people`, `prayers`, `recap`,
`recap-email`, `recap-fetch`, `schools`, `search`, `sources`, `tag`, `tags`.
Our 13-tool mirror covers the litigation-relevant subset (courts, dockets,
opinions, parties, people, search, recap) and omits the site-specific ones
(gifts, debts, prayers, schools, audio) — a defensible scope, now checkable
against source rather than memory.

## D1 — The gap: one product per category, no competitors

The creation workflow calls for the competitor set in each category, because
that is what produces the data chaos that makes reconciliation tasks real. We
have **exactly one product per category**:

| Category | We mirror | Real competitors NOT mirrored |
|---|---|---|
| practice management | Clio | Litify, Smokeball, PracticePanther, MyCase, Filevine, Actionstep |
| document management | iManage | NetDocuments, SharePoint |
| eDiscovery | Relativity | Everlaw, Logikcull, DISCO, Nuix, Reveal |
| legal research | CourtListener | Westlaw, Lexis, vLex/Fastcase, Casetext |
| e-billing | LEDES | Legal Tracker, TyMetrix, Brightflag, Onit |
| workspace | Google | Microsoft 365 |
| **CLM** | *(nothing)* | Ironclad, Icertis, Agiloft, Evisort, Conga |
| **contract AI review** | *(nothing)* | Kira, Luminance, Zuva |
| **IP management** | *(nothing)* | Anaqua, CPA Global |
| **entity management** | *(nothing)* | Diligent Entities, Athennian |
| **firm financials** | *(nothing)* | Aderant, Intapp, Elite |

Two consequences:

1. **No intra-category disagreement.** Our three-system reconciliation (PM +
   e-billing + spreadsheet) works, but we cannot pose the sharper question —
   *the matter exists in Clio and in Litify with different responsible
   attorneys; which governs?* — because the second system does not exist.
2. **Whole categories of work are unhostable.** The contracting lifecycle that
   is 498 of LAB's tasks (`C2-input-documents.md`) runs on CLM systems we do not
   model at all.

### The census refuted my own list

I ran the corpus-wide vendor grep to confirm those names. It did not confirm
them — and the failure is more informative than a confirmation would have been
(`research/answers/data/vendor-census.json`).

| name | raw file hits | after word-boundary + reading the hits |
|---|---|---|
| pacer | 2,338 | genuine, dominant |
| courtlistener | 378 | genuine |
| lexis | 101 | 46 — genuine LexisNexis references |
| westlaw | 34 | genuine |
| imanage | 24 | genuine |
| **disco** | 2,184 | **8** — the rest was `discovery` / `disclosure` |
| **ironclad** | 76 | **0 as a vendor** — the hits are a case name, *Kenai Ironclad v. CP Marine Services*, in juriscraper's PACER fixtures |
| **clio** | 13 | **1 as a vendor** — the others are a province name in lexnlp address data and a PACER docket fixture |
| everlaw / netdocuments / docusign | 3 / 4 / 8 | negligible |

**The conclusion is structural, not incidental.** This corpus is open-source
legal tooling, and open-source legal tooling is built on *free public court
data*. The commercial SaaS ecosystem a firm actually runs on is absent from it
by construction. So:

- the competitor table above is **category knowledge, asserted and
  uncorroborated by the corpus** — it is labelled as such and must not be cited
  as evidence-driven;
- confirming and mocking those surfaces needs each vendor's **published API
  documentation** as a separate evidence source, which is what the creation
  workflow's tool-census step actually calls for ("searching up each of their
  mcp documents, apis");
- what the corpus *does* corroborate — PACER, CourtListener, Westlaw, Lexis,
  iManage — is exactly the set we already mirror or that is public-data-backed.

This is the LLM-judge test from `research/QUESTIONS.md` applied to my own
output, and the claim failed test 1 (grounding). Recording the failure is the
point of running it.

## Still open

- **D3** — where the same fact lives in two systems and what makes them
  disagree. Needs the competitor products to exist first.
- **D4** — what a GitHub workflow of someone *actually using* these APIs looks
  like: call order, pagination, retry, error handling. `juriscraper` (350 MB of
  court-scraper code) and `courtlistener` itself are the best available sources
  and are on disk, unread.
