#!/usr/bin/env node
/**
 * Catalog builder — materializes browsable per-file folders from the
 * canonical sources (world-v5.json, data/leaderboard/episodes/,
 * data/flake/flaky-trajectories.json). Idempotent: wipes and rebuilds.
 *
 *   tasks/       task_001.json … one file per task definition
 *   verifiers/   task_001.py  … the shipped VCode, verbatim, per task
 *   traces/      <model>/passed/*.json + <model>/failed/*.json — every
 *                episode of every measured model, plus the historical
 *                hosted-push trajectories (deepseek-v4-flash-hosted)
 *   reports/     failure report per model (written by build-failure-report)
 *
 * Run: node sim/build-catalog.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const worldRaw = JSON.parse(readFileSync(join(ROOT, "world", "blobfish", "world-v5.json"), "utf8"));
const world = worldRaw.world ?? worldRaw;

const counts = { tasks: 0, verifiers: 0, traces: 0, failed: 0 };

// ------------------------------------------------------------------ tasks/
// One FOLDER per task: definition, verifier, and the task's own seed bundle
// (seeded documents as readable .md, special input documents, special core
// data rows, and the per-MCP-system seeding map).
const TASKS = join(ROOT, "tasks");
rmSync(TASKS, { recursive: true, force: true });
mkdirSync(TASKS, { recursive: true });
const verifierByTask = Object.fromEntries(world.verifiers.map((v) => [v.task_id, v]));
const mdTable = world.tables.find((t) => t.name === "matter_documents");
const mdById = new Map(mdTable.sample_rows.map((r) => [r.id, r]));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

for (const t of world.tasks) {
  const dir = join(TASKS, t.task_id);
  const seedDir = join(dir, "seed");
  const docsDir = join(seedDir, "documents");
  mkdirSync(docsDir, { recursive: true });

  const { seed, ...taskDef } = t;
  writeFileSync(join(dir, "task.json"), JSON.stringify(taskDef, null, 1));
  const v = verifierByTask[t.task_id];
  if (v) writeFileSync(join(dir, "verifier.py"), v.vcode);

  const s = seed ?? { documents: [], input_documents: [], core_data: {}, mcp: {} };
  writeFileSync(join(seedDir, "core-data.json"), JSON.stringify(s.core_data, null, 1));
  writeFileSync(join(seedDir, "mcp.json"), JSON.stringify(s.mcp, null, 1));
  writeFileSync(join(seedDir, "input-documents.json"), JSON.stringify(
    s.input_documents.map((id) => ({ id, title: mdById.get(id)?.title ?? null })), null, 1));
  for (const id of s.documents) {
    const row = mdById.get(id);
    if (!row) continue;
    const marker = s.input_documents.includes(id) ? "INPUT (must be read in full)"
      : /distract|unrelated|superseded/i.test(`${row.title} ${row.doc_type}`) ? "distractor/superseded"
      : "cluster material";
    writeFileSync(join(docsDir, `${String(id).padStart(3, "0")}-${slug(row.title)}.md`),
      `<!-- matter_documents id ${id} · doc_type: ${row.doc_type} · role: ${marker} -->\n` +
      `# ${row.title}\n\n${row.body}\n`);
  }
  counts.tasks++;
}
writeFileSync(join(TASKS, "README.md"),
  `# tasks/ — one folder per task: definition, verifier, and its own seed bundle\n\n` +
  `Materialized from \`world/blobfish/world-v5.json\` by \`node sim/build-catalog.mjs\`\n` +
  `(seed bundles derived by \`world/expansion/derive-task-seeds.mjs\`). Do not edit directly.\n\n` +
  `\`\`\`\ntasks/task_NNN/\n  task.json                 the task definition (prompt, walk, provenance, labels)\n` +
  `  verifier.py               the shipped VCode verifier, verbatim\n` +
  `  seed/\n    documents/*.md          seeded documents (header marks INPUT vs distractor vs cluster)\n` +
  `    input-documents.json    the special input documents the task must read in full\n` +
  `    core-data.json          special core data: entity rows the task references/mutates\n` +
  `    mcp.json                special MCP seeding: which system server owns which seeded data\n\`\`\`\n\n` +
  `The runtime applies a task's bundle to its session at creation ` +
  `(\`world/local/server.py\` task-aware sessions; sessions carry \`task_id\`).\n`);

// -------------------------------------------------------------- verifiers/
const VERIF = join(ROOT, "verifiers");
rmSync(VERIF, { recursive: true, force: true });
mkdirSync(VERIF, { recursive: true });
for (const v of world.verifiers) {
  writeFileSync(join(VERIF, `${v.task_id}.py`), v.vcode);
  counts.verifiers++;
}
writeFileSync(join(VERIF, "README.md"),
  `# verifiers/ — all ${counts.verifiers} VCode verifiers, verbatim\n\n` +
  `One Python file per task, extracted from the world document by \`node sim/build-catalog.mjs\`.\n` +
  `Contract: \`verify(initial_state, final_state, trace) -> {passed, reward, failed_conditions, assertions}\`\n` +
  `where the states are \`{table: [row, ...]}\` snapshots and trace is the rollout's step list.\n` +
  `Structural conditions decide pass/fail; anti-hack conditions (workflow shortcuts, fabricated rows,\n` +
  `collateral damage) veto reward to 0; \`all_tools_succeeded\` is advisory.\n`);

// ---------------------------------------------------------------- traces/
const TRACES = join(ROOT, "traces");
rmSync(TRACES, { recursive: true, force: true });
const EP_ROOT = join(ROOT, "data", "leaderboard", "episodes");
const engines = existsSync(EP_ROOT) ? readdirSync(EP_ROOT) : [];
const perModel = [];
for (const engine of engines) {
  const src = join(EP_ROOT, engine);
  let passed = 0, failed = 0;
  for (const f of readdirSync(src).filter((x) => x.endsWith(".json"))) {
    let ep;
    try { ep = JSON.parse(readFileSync(join(src, f), "utf8")); } catch { continue; }
    const bucket = ep.passed ? "passed" : "failed";
    const dst = join(TRACES, engine, bucket);
    mkdirSync(dst, { recursive: true });
    copyFileSync(join(src, f), join(dst, f));
    counts.traces++;
    if (ep.passed) passed++; else { failed++; counts.failed++; }
  }
  perModel.push(`- \`${engine}\`: ${passed} passed / ${failed} failed`);
}

// historical hosted trajectories (the original boundary pushes)
const flakyPath = join(ROOT, "data", "flake", "flaky-trajectories.json");
if (existsSync(flakyPath)) {
  const hosted = JSON.parse(readFileSync(flakyPath, "utf8"));
  let passed = 0, failed = 0;
  for (const t of hosted.trajectories ?? []) {
    const bucket = t.passed ? "passed" : "failed";
    const dst = join(TRACES, "deepseek-v4-flash-hosted", bucket);
    mkdirSync(dst, { recursive: true });
    writeFileSync(join(dst, `${t.task_id}-${t.id}.json`), JSON.stringify(t, null, 1));
    counts.traces++;
    if (t.passed) passed++; else { failed++; counts.failed++; }
  }
  perModel.push(`- \`deepseek-v4-flash-hosted\`: ${passed} passed / ${failed} failed (historical hosted boundary pushes; ` +
    `NOTE: docs/AUDIT.md reclassified this cohort's dominant failure signature as output-cap truncation, a harness artifact)`);
}

mkdirSync(TRACES, { recursive: true });
writeFileSync(join(TRACES, "README.md"),
  `# traces/ — every episode of every measured model, split passed/failed\n\n` +
  `Materialized from \`data/leaderboard/episodes/\` (canonical, written by the runner) and\n` +
  `\`data/flake/flaky-trajectories.json\` (historical hosted pushes) by \`node sim/build-catalog.mjs\`.\n\n` +
  perModel.join("\n") + "\n\n" +
  `Each episode file: full turn-by-turn steps (tool, arguments, argBytes/argParseError, ok,\n` +
  `observation, thought when the API returns one), verifier verdict with per-assertion results,\n` +
  `token usage, cost, and \`preRescore\` where the contamination audit corrected the verdict.\n` +
  `Human-readable views: docs/evidence/traces.html (exemplars) and docs/evidence/all-failed-traces.html (all failures).\n`);

// ---------------------------------------------------------------- reports/
const REPORTS = join(ROOT, "reports");
mkdirSync(REPORTS, { recursive: true });
const oldReports = join(ROOT, "docs", "failure-reports");
if (existsSync(oldReports)) {
  for (const f of readdirSync(oldReports).filter((x) => x.endsWith(".md"))) {
    copyFileSync(join(oldReports, f), join(REPORTS, f));
  }
}
writeFileSync(join(REPORTS, "README.md"),
  `# reports/ — failure-mode report per measured model\n\n` +
  `Generated by \`node sim/build-failure-report.mjs --all\` from the episode corpus: overall score,\n` +
  `flaky-21 boundary score, every failing episode classified into the failure-mode taxonomy\n` +
  `(sim/lib/classify-failure.mjs), worst practice areas/shapes, verifier-condition totals, and an\n` +
  `exemplar trace per mode. The audit separating model failures from harness bugs is docs/AUDIT.md.\n`);

console.log(`catalog: ${counts.tasks} tasks · ${counts.verifiers} verifiers · ` +
  `${counts.traces} traces (${counts.failed} failed) · reports/ ready`);
