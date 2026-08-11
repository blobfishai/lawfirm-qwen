# C1 — What are the task families, taken from evidence rather than invented?

**Status:** partial — answered from the automation corpus and the legal MCP
server, both on disk. The eval side (harvey-labs and the benchmark repos) is
still cloning and will extend this document; the sections below are marked with
what they rest on.

**Primary evidence:** `research/repos/CSlawyer1985@legal-ZH` — 175 `SKILL.md`
files across 14 practice areas plus 10 watcher agents, extracted by
`research/extract-skill-inventory.mjs` into
`research/answers/data/skill-inventory.json`.

**Secondary evidence:** `research/repos/agentic-ops@legal-mcp` — 58 functions
across `tools/`, SQLite-backed (`_init_db`, `_get_conn`, `_db_path`).

---

## The taxonomy that is actually shipped

Practice areas, by skill count:

| Practice area | Skills | Representative skills |
|---|---|---|
| employment-legal | 20 | hiring-review, internal-investigation, handbook-updates, leave-tracker |
| litigation-legal | 19 | chronology, claim-chart, privilege-log-review, subpoena-triage, legal-hold, demand-draft, deposition-prep, matter-close |
| legal-clinic | 16 | client-intake, client-letter, client-comms-log, build-guide |
| corporate-legal | 13 | diligence-issue-extraction, closing-checklist, board-minutes, written-consent, material-contract-schedule, tabular-review, entity-compliance |
| law-student | 13 | case-brief, irac-practice, exam-forecast, bar-prep-questions |
| commercial-legal | 12 | nda-review, saas-msa-review, vendor-agreement-review, renewal-tracker, escalation-flagger, amendment-history |
| ip-legal | 12 | clearance, fto-triage, infringement-triage, cease-desist, portfolio |
| ai-governance-legal | 10 | ai-inventory, aia-generation, vendor-ai-review, reg-gap-analysis |
| privacy-legal | 9 | dpa-review, dsar-response, pia-generation |
| regulatory-legal | 9 | gap-surfacer, policy-redraft, comments |
| criminal-legal | 7 | bail-application, case-analysis, defense-strategy |
| product-legal | 7 | launch-review, feature-risk-assessment, marketing-claims-review |

Ten **watcher agents** run continuously rather than on request:
`docket-watcher`, `dataroom-watcher`, `renewal-watcher`, `ip-renewal-watcher`,
`reg-change-monitor`, `playbook-monitor`, `leave-tracker`, `launch-watcher`,
`deal-debrief`, `registry-sync`
(`research/repos/CSlawyer1985@legal-ZH/*/agents/*.md`).

## What this corrects about our world

Our 270 tasks are drawn from benchmark anchors — which biases toward what is
*easy to score*, not what is *frequently done*. Three families are heavily
represented in the shipped corpus and thin or absent in our world:

1. **Matter lifecycle** — `matter-intake`, `matter-workspace`, `matter-update`,
   `matter-briefing`, `matter-close`, `portfolio-status`, `oc-status`. Present
   in nearly every practice area (`matter-workspace` appears in 6 areas at 17
   steps each). Our world has matters as *rows*, but no task that opens, briefs,
   updates or closes one as a workflow.
2. **Standing monitors** — the 10 watcher agents. Work that is triggered by a
   change in the world rather than by a prompt. Our world has no task of this
   shape at all; every task is a one-shot request.
3. **Client-facing correspondence** — `client-letter`, `client-comms-log`,
   `demand-intake` / `demand-received` / `demand-draft` as a three-stage chain.
   We host drafting, but not the received→triage→respond chain.

## Where the corpus confirms what we already built

- `privilege-log-review`, `subpoena-triage`, `legal-hold`, `deposition-prep`
  (litigation) — we host all four shapes.
- `diligence-issue-extraction`, `closing-checklist`, `material-contract-schedule`
  (corporate) — we host diligence and closing-binder.
- `nda-review`, `saas-msa-review`, `vendor-agreement-review` (commercial) — we
  host clause-level contract review via the ACORD-anchored pack.
- The MCP server's function list (`tools/contract_tools.py`,
  `citation_tools.py`, `privilege_tools.py`, `brief_tools.py`) maps onto our
  clause-extraction, citation-audit and privilege families.

## The depth finding

72 of 175 skills have **≥8 numbered workflow steps**; the deepest is
`litigation-legal/demand-draft` at **40**. Others at 17–21:
`legal-clinic/cold-start-interview` (21), `law-student/bar-prep-questions` (19),
`ip-legal/cease-desist` (18), `ip-legal/portfolio` (18),
`regulatory-legal/policy-redraft` (18), `corporate-legal/written-consent` (17),
and `matter-workspace` in six areas (17).

Our world, for comparison:

| | shipped corpus | our world |
|---|---|---|
| median workflow length | 8+ steps for 41% of skills | 3 tool calls |
| mean | — | 3.5 |
| ≥8 steps | 72 / 175 (41%) | **3 / 270 (1%)** |
| longest | 40 | 13 |

This is the sharpest gap the corpus exposes, and it is exactly the axis the
creation workflow calls for ("instead of 3 tools, we can do 10 tools... making
the tasks more long horizon"). It is not a claim that our tasks are wrong — a
3-call task with a derived answer key still discriminates. It is that the *shape
distribution* of our world does not match the shape distribution of the work.

## Open, pending the eval corpus

- Which of these families appear in **harvey-labs** and with what scoring
  method — the families a benchmark scores are the ones with a defensible
  answer key, and that is the intersection we most want.
- Whether the benchmark corpora carry input documents we can host verbatim
  rather than synthesize.
