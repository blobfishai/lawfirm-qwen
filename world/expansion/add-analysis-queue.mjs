#!/usr/bin/env node
/**
 * Add the asynchronous analysis queue to the world.
 *
 * `research/repos/agentic-ops@legal-mcp` exposes an async job surface —
 * `get_analysis_status`, `list_analysis_jobs`, `get_analysis_result` alongside
 * `_run_analysis` — because real document analysis over a review set does not
 * return inside one call. Every tool in our world answers immediately, so the
 * competency the queue tests (submit work, poll until it is ready, then read the
 * result, without fabricating the answer while you wait) is untested here.
 *
 * This adds:
 *   table  analysis_jobs
 *   tools  analysis_job_submit (write) · analysis_job_status (read)
 *          analysis_job_result (read)  · analysis_jobs_list (read)
 *
 * The state machine lives in world/local/server.py and is deterministic: a job
 * is `queued` on submission, `running` on the first status poll, and `complete`
 * from the second. `analysis_job_result` refuses to answer until then — which is
 * the point, since the failure mode being graded is answering early.
 *
 * Run: node world/expansion/add-analysis-queue.mjs [--in <world>] [--out <world>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const abs = (p) => (isAbsolute(p) ? p : join(ROOT, p));
const IN = abs(opt("--in", "world/blobfish/world-v10.json"));
const OUT = abs(opt("--out", "world/blobfish/world-v11.json"));

const raw = JSON.parse(readFileSync(IN, "utf8"));
const world = raw.world ?? raw;

if (world.tables.some((t) => t.name === "analysis_jobs")) {
  console.log("analysis_jobs already present — nothing to do");
  process.exit(0);
}

world.tables.push({
  name: "analysis_jobs",
  description:
    "Asynchronous document-analysis jobs. Submitting enqueues work over a review set; the " +
    "result is not available until the job reaches status 'complete'.",
  columns: [
    { name: "id", type: "INTEGER", pk: true },
    { name: "analysis_type", type: "TEXT" },
    { name: "scope", type: "TEXT" },
    { name: "status", type: "TEXT" },
    { name: "poll_count", type: "INTEGER" },
    { name: "submitted_by_role", type: "TEXT" },
    { name: "documents_scanned", type: "INTEGER" },
    { name: "findings_count", type: "INTEGER" },
  ],
  sample_rows: [],
});

const TOOLS = [
  {
    name: "analysis_job_submit",
    type: "write",
    description:
      "Submit an asynchronous analysis job over a review set. Returns a job id immediately; the " +
      "job is NOT finished. Poll analysis_job_status until it reports complete, then read " +
      "analysis_job_result. Mirrors the async analysis queue in agentic-ops/legal-mcp.",
    purpose: "Enqueue an analysis job.",
    target_tables: ["analysis_jobs"],
    parameters: { analysis_type: "TEXT", scope: "TEXT", submitted_by_role: "TEXT" },
    input_format: 'analysis_type e.g. "privilege_screen"; scope is the review set key; submitted_by_role is your role',
  },
  {
    name: "analysis_job_status",
    type: "read",
    description:
      "Poll an analysis job. Status advances queued -> running -> complete as the job is " +
      "polled. The result is not readable before complete.",
    purpose: "Check job progress.",
    target_tables: ["analysis_jobs"],
    parameters: { id: "INTEGER" },
  },
  {
    name: "analysis_job_result",
    type: "read",
    description:
      "Read a completed analysis job's findings. Returns an error while the job is queued or " +
      "running — poll analysis_job_status first.",
    purpose: "Retrieve job findings.",
    target_tables: ["analysis_jobs"],
    parameters: { id: "INTEGER" },
  },
  {
    name: "analysis_jobs_list",
    type: "read",
    description: "List analysis jobs with their current status.",
    purpose: "Enumerate jobs.",
    target_tables: ["analysis_jobs"],
    parameters: { status: "TEXT", analysis_type: "TEXT", limit: "INTEGER" },
  },
];

for (const t of TOOLS) {
  world.tools.push({
    ...t,
    source: `def ${t.name}(db_path='state.db', **kwargs):\n    '''${t.description}'''\n`
      + `    _missing = [p for p in ${JSON.stringify(Object.keys(t.parameters))} if kwargs.get(p) is None]\n`,
    validated: true,
    source_basis: "agentic-ops/legal-mcp tools/analysis_queue_tools.py (async analysis queue)",
  });
}

writeFileSync(OUT, JSON.stringify(raw, null, 1));
console.log(`analysis queue added: 1 table + ${TOOLS.length} tools -> ${OUT}`);
console.log(`world tools: ${world.tools.length}, tables: ${world.tables.length}`);
