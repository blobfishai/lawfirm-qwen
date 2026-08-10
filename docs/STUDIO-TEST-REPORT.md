# blobfish.ai/studio — Critical Live Test Report (2026-08-10)

Product QA of the live studio generation path, run against the user's seven
acceptance criteria. Method: direct API driving of the same endpoints the
studio UI calls (`POST /api/v1/worlds`, prompt-only quick-preview path),
headless-Chrome screenshots of the user-facing pages, and source reading in
the blobfish repo. Interactive chat tests (interruption, live narration)
require the Claude-in-Chrome extension, which was not connected — those two
criteria are marked BLOCKED with what the API evidence shows instead.

## Verdict matrix

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Happy path works | **FAIL — 0/3 worlds generated** | Three prompt-only generations, three distinct hard failures (bugs 1–3 below) across two domains (sales ×2, accounting ×1) |
| 2 | Creation not hardcoded | **PASS (with caveat)** | Pipeline genuinely runs research→modeling→db→tools per world (stage telemetry differs per run; sales failed in s05, accounting reached s07); the API self-labels the path `quick_preview_ungrounded_prototype` — honest, but it means prompt-grounding of TOOLS is weak by design on this path (the ERP-tools-in-sales-world complaint is this path's known gap) |
| 3 | Tasks relevant to domain | **UNTESTABLE live** (no world completed); the failed sales retry's degenerate task was at least domain-shaped (`task_update_lead_status`) — naming suggests domain grounding reaches task names; quality unverifiable until generation completes |
| 4 | Richer than open-source evals | **NOT on this path.** Quick-preview settings cap at 6 generated tasks/150 rows (visible in generation settings); depth lives in the deep path (`/api/v1/sandbox/jobs mode=deep` — what produced the 156-task law world). The studio-default path cannot beat OSS evals on depth by configuration |
| 5 | Interruption/feedback updates world without regeneration | **BLOCKED** (needs interactive session; extension disconnected) |
| 6 | No cross-domain leakage (accounting test) | **UNTESTABLE live** (accounting world died in s07 before tasks); the leakage risk is real — the law world itself carries ERP remnants (see `docs/DOMAIN-AUDIT.md`), and the studio sales screenshot showed ERP/GitHub/PagerDuty tools |
| 7 | Chat narrates progress/stages/plan | **PARTIAL (data exists; UI blocked)** | The API exposes full per-stage telemetry (input_ingestion→research→…→task_generation with statuses and timings) — the raw material for narration is real; whether the chat surfaces it needs the interactive session |

## Bugs found (live, reproducible ids)

1. **`wld_c8dedcad60c94854` (sales #1): s05 semantic-integrity hard fail.**
   `DatabaseBuildError: generated database failed semantic integrity: 12 issue(s)`
   — the pipeline rejects its own database and dies instead of running a
   bounded repair loop (a `toolRepairCycles` setting exists but the DB stage
   has no equivalent). 76s wasted, world unusable.
2. **(sales #2): world-level refusal for one degenerate task.**
   `anchor_generation_failed: world has no task with a discriminating verifier —
   refusing to publish. Degenerate: task_update_lead_status: Reference trace got
   reward=0 — task is impossible.` One impossible task kills the entire world.
   The proven alternative is per-task admission (drop/repair the failing task,
   ship the rest, label honestly) — the pattern that got the law world to
   231/231. Also: the error returned synchronously despite `async:true`.
3. **`wld_884008f091d34d97` (accounting): deployment-level ImportError in s07.**
   `s07_tasks.py → causal_evidence.py → from fleet_quality.mutation_necessity import …`
   crashes — a missing module in the deployed image. Until fixed, *no* world
   on this service can complete task_generation. Sev-1.
4. **Failed worlds 404 on their user-facing page.** `/w/wld_c8dedcad60c94854`
   renders "Shared world not found" while `/api/v1/worlds/{id}` returns full
   failed status + error for the same id (screenshot `studio-failed-world.png`).
   The honesty-first contract ("generating → ready | failed shown honestly")
   breaks exactly when it matters most. A user's link to their failed world is
   a dead end with no error, no stages, no retry.
5. **API worlds invisible to the studio session.** Worlds created via the API
   don't appear in the studio's project list for the browser session
   (`GET /api/v1/worlds` → `{"worlds":[]}` anonymous). Expected for
   auth-scoping, but combined with bug 4 there is NO surface where an
   anonymous user can see what happened to their generation.
6. **Known-by-design gap, restated as the root complaint:** the quick-preview
   path is explicitly `ungrounded_prototype` — this is the path that produces
   sales worlds with ERP/GitHub/PagerDuty tools. The studio front door runs
   the weakest generator; the deep path that produces grounded worlds isn't
   what a studio user gets.

## What this session already contributes as fixes

- **Per-task admission instead of world refusal** — implemented and proven in
  this repo (`world/local/oracle.py` gate; 231/231 + 9/9 grown).
- **Domain-fidelity lint** (`world/expansion/domain-lint.mjs`) — two-tier
  vocabulary gate, ran against the law world (found the ERP remnants),
  parameterized for any vertical; belongs in s05/s06 as a generation gate.
- **Task-level seed bundles + task-aware sessions** — the structure the
  generator should emit natively (retrofitted here).
- **The sales-world design** (`docs/SALES-WORLD-DESIGN.md`) — the grounded
  tool census + chaos map + gates that make criterion-2/3 failures
  structurally impossible for the sales vertical.

## Remaining to test once the Chrome extension is connected

Criteria 5 and 7 (interruption mid-generation; conversational feedback
updating rather than regenerating; live narration quality), plus the visual
tools-list check that triggered this audit. One session with the extension
connected covers all three.
