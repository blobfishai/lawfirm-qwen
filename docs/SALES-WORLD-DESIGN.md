# Sales World — Detail Design (Harbor format)

The playbook (`docs/WORLD-CREATION-PLAYBOOK.md`) instantiated for the sales
vertical, designed so the studio's two live sales-generation failures and the
"ERP/GitHub/PagerDuty tools in a sales world" disease cannot recur. Every
section states its evidence source; nothing here is a template default.

## 0 · Question ledger (Stage 0 — stored, not one-shot)

`data/research/questions.md` opens with, minimum:

1. Who are the stakeholders? (SDR, AE, AM/CSM, sales manager, RevOps, deal
   desk, marketing ops, finance for comp/billing.)
2. What does each do all day, and what counts as *done*? (SDR: qualified
   meeting booked + logged with disposition. AE: stage-true pipeline, closed
   won with signed order form + handoff. Manager: forecast submitted, 1:1
   pipeline reviews. RevOps: routing rules, dedupe, dashboard integrity.)
3. What is the business value per workflow? (pipeline coverage, win rate,
   cycle time, forecast accuracy, data hygiene.)
4. Where does the data live, and where does it disagree? (the chaos map, §3)
5. Which scenarios stress which tools? (quarter-end, territory carve,
   duplicate merge, sequence compliance, churn save.)

Answered via a 4-angle sweep (GitHub workflows, agent arenas/evals,
practitioner articles, product docs), links stored under `data/research/`.

## 1 · Thesis (Stage 1)

Meridian Cloud (SIMULATED), ~120-rep B2B SaaS sales org, two segments (SMB
velocity, mid-market/enterprise), CRM-of-record plus a marketing-automation
CRM that half-syncs, prospecting and conversation-intelligence side systems,
and the unkillable quota spreadsheet. Definition of done is always a record
state in a specific system — never prose.

## 2 · Tool census → one MCP server per product (Stage 2)

**Banned by the sales domain lint** (tier-1 foreign anywhere): ERP, GitHub,
PagerDuty, Jira, Kubernetes, warehouse/shipment/PO vocabulary. A sales org's
systems are:

| MCP server | Product analog (SIMULATED) | Owns | Surface mocked from |
|---|---|---|---|
| `crm` | Salesforce-class CRM of record | accounts, contacts, leads, opportunities (stage/amount/close-date), activities, quotes/CPQ, cases | Salesforce REST/SOQL docs + its MCP servers + GitHub CLI usage |
| `marketing-crm` | HubSpot-class | its OWN contacts/companies/deals (overlapping, half-synced), forms, email campaigns, lifecycle stages | HubSpot CRM API docs |
| `prospecting` | Apollo-class | people/company enrichment DB, sequences, email finder credits | Apollo API docs |
| `conversation-intel` | Gong-class | call recordings→transcripts, trackers, deal warnings | Gong API docs |
| `meeting-notes` | Granola-class | meeting notes tied to calendar events, action items | product docs |
| `sequencer` | Outreach-class | cadences, touches, opt-outs, bounce states | Outreach API |
| `sheets` | Google-Sheets-class | THE quota/forecast workbook, comp calc, territory tabs | Sheets API semantics (ranges, tabs) |
| `drive` | Drive-class | order forms, MSAs, security questionnaires, decks | Drive API |
| `email` | Gmail-class | threads with prospects (commit evidence, verbal agreements) | Gmail API |
| `chat` | Slack-class | #deal-desk approvals, #wins, manager pings | Slack API |
| `billing` | Stripe/CPQ-lite | closed-won → subscriptions/invoices (finance truth) | Stripe API |
| `calendar` | Calendar-class | demos, QBRs — the activity ground truth | Calendar API |

Each is a real stdio MCP server over its OWN storage namespace (the
`mcp/serve-system.mjs` pattern, but with per-system databases — the law
world's single-substrate shortcut is explicitly not carried over). Tool
names/params mirror the real product's API nouns (`crm.soql_query`,
`marketing_crm.crm_v3_objects_search`, `sheets.values_get`…), harvested from
each product's MCP/API docs per the creation workflow.

## 3 · Data chaos map (Stage 2/3 — every pattern evidence-sourced)

Fragmentation is the realism. Entity placement + designed disagreements:

1. **Contacts** exist in `crm`, `marketing-crm`, and `prospecting` with
   different emails/titles for ~15% (job changes; enrichment staleness).
2. **Opportunities** in `crm` are the "official" pipeline; 3 late-stage deals
   exist only in the manager's `sheets` forecast tab (not yet in CRM); 2 CRM
   deals are dead but not closed-lost (stage rot).
3. **Closed-won ≠ billed**: `billing` has 2 subscriptions with no matching
   closed-won opp, and 1 closed-won opp never provisioned — "what's total
   sales this week?" has three defensible answers (CRM closed-won, billing
   invoiced, spreadsheet forecast actuals) and the task pins WHICH definition
   and the exact reconciliation.
4. **Duplicate accounts** (Acme Corp / Acme Corporation) split activity
   history; the merge task is a classic RevOps chore.
5. **Currency + period traps**: sheets in EUR for EMEA tab; CRM in USD;
   week-vs-fiscal-week off-by-one.
6. **Sync lag**: marketing-crm lifecycle says MQL for contacts already in
   stage 3 in crm.
7. **Meeting evidence split**: the verbal discount agreement lives only in a
   `conversation-intel` transcript + an `email` thread — not in CRM fields.

Sources: CRMArena/-Pro's sandbox design (vendored), tau-bench's policy-bound
service shapes, RevOps practitioner writing on CRM hygiene, HubSpot↔SFDC
sync-conflict documentation. Each chaos row keeps its citation in
`data/research/`.

## 4 · Tables and verifier-pinnable outcomes (Stage 3)

Per-system schemas follow the real products' object models (CRM:
Lead/Contact/Account/Opportunity/OpportunityLineItem/Task/Case + audit
fields; marketing-crm: its object model; billing: customer/subscription/
invoice). Every workflow's definition-of-done is a pinnable row:
stage change with required fields, meeting logged with disposition, dedupe
merge (loser marked, activities re-parented), forecast cell updated, invoice
matched. The verifier grammar is reused unchanged from the law world
(ordered checkpoints, pinned fields, required reads — here "required reads"
includes transcript/email evidence — fabrication traps, scope guards,
friction).

## 5 · Task seeding (Stage 4 — from evals, arena, articles)

- **CRMArena / CRMArena-Pro** (vendored): lead qualification & routing,
  quote approval, wrong-stage rectification, activity prioritization,
  sales-insight aggregation (best region, monthly trend, conversion rate),
  named-entity disambiguation, policy-violation identification, plus its
  confidentiality-refusal shapes (private customer info must be refused —
  maps to our abstention traps).
- **tau-bench retail/airline shapes**: policy-bound user-facing changes
  (refund/exchange ≈ discount-approval within authority limits; escalate
  beyond limit — authority-cap traps like the law world's write caps).
- **WorkArena/OfficeBench shapes**: cross-app clerical chains (sheet → CRM →
  email).
- **Practitioner scenarios**: quarter-end forecast roll-up (the flagship
  cross-system reconciliation), duplicate merge, sequence-compliance sweep,
  churn-save motion, deal-desk approval chain, handoff-to-CS checklist.
- **Chaos-born tasks**: every §3 disagreement spawns a task whose pinned
  answer is the reconciled truth, with the naive per-system answers as
  forbidden values (the same trap discipline as the law world's
  superseded-draft numbers).

Growth (Stage 5) inherits the law world's loop *with the r1 finding
applied*: escalate ambiguity (withheld ids, unstated procedure, derived
values), not just chain length.

## 6 · Harbor organization

```
sales-world/
  task.yaml                     # domain, systems, counts, fidelity oracle
  environment/
    server.py                   # runtime (multi-namespace)
    <system>.sqlite × 12        # per-system storage (fragmentation is real)
    world.json
  mcp/systems.json + serve-system per product
  tasks/task_NNN/               # per-task folders (law-world catalog layout)
    task.json · verifier.py
    seed/{documents/, input-documents.json, core-data.json, mcp.json}
  verifiers/ · traces/ · reports/
  data/research/                # question ledger, sweep registry, chaos citations
```

## 7 · Generation gates (what the studio failures teach)

The two live sales-generation failures (2026-08-10) become admission gates:

1. **s05 semantic-integrity failure → repair loop, not hard fail.** The
   pipeline rejected its own DB (12 issues) and died; the gate should feed
   the issue list back into a bounded repair cycle before failing, and the
   failure must surface in the user's world page (today `/w/<failed-id>`
   404s — the honesty contract breaks exactly when it matters).
2. **Degenerate-verifier refusal → task repair, not world refusal.** One
   impossible task (`reference reward=0`) killed the whole world; the
   oracle-admission pattern here (drop/repair the failing task, ship the
   rest, label honestly) is the proven alternative — lawfirm shipped 231/231
   only because admission is per-task.
3. **Domain lint at generation time** (sales vocabulary): no ERP/GitHub/
   PagerDuty tool may survive into a sales world; foreign business vocab in
   firm systems fails the build (client/contract documents exempt).
4. **Task-level seed bundles from birth** (documents, input docs, core data,
   per-MCP seeding) — retrofitted in the law world, native here.
```
