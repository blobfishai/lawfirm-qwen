#!/usr/bin/env node
/**
 * The porter — run every adapter, emit uniform bundles, report what is portable.
 *
 * Adding a source is now one file under adapters/ rather than a bespoke
 * importer. Each adapter answers the same five questions (tasks, seeded data,
 * tools, verifier, workflow) and declares its gaps; the porter enforces the
 * shape, writes the bundle, and prints a table that makes an unportable
 * benchmark obvious instead of quietly absent.
 *
 * Run: node world/port/port.mjs [--id legalbench] [--instances 5]
 */
import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const REPOS = join(ROOT, "research", "repos");
const OUT = join(HERE, "bundles");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ONLY = opt("--id", "");
const INSTANCES = Number(opt("--instances", "5"));

mkdirSync(OUT, { recursive: true });

/** Every bundle must answer the five questions; a missing answer is a gap, not a blank. */
function validate(id, b) {
  const problems = [];
  if (!Array.isArray(b.tasks)) problems.push("tasks must be an array");
  if (!b.grading?.kind) problems.push("grading.kind is required (deterministic|mixed|judge)");
  if (!["deterministic", "mixed", "judge"].includes(b.grading?.kind ?? ""))
    problems.push(`grading.kind '${b.grading?.kind}' is not one of deterministic|mixed|judge`);
  if (!b.source?.repo) problems.push("source.repo is required");
  if (!Array.isArray(b.tools)) problems.push("tools must be an array ([] means none needed)");
  if (!Array.isArray(b.gaps)) problems.push("gaps must be an array (declare them, do not omit)");
  if (problems.length) throw new Error(`adapter ${id}: ${problems.join("; ")}`);
}

const adapters = readdirSync(join(HERE, "adapters")).filter((f) => f.endsWith(".mjs"));
const rows = [];
for (const file of adapters.sort()) {
  const mod = await import(pathToFileURL(join(HERE, "adapters", file)).href);
  const { meta, port } = mod;
  if (ONLY && meta.id !== ONLY) continue;
  const repoDir = join(REPOS, meta.repo);
  if (!existsSync(repoDir)) {
    rows.push({ id: meta.id, status: "REPO MISSING", tasks: 0, kind: "-", tools: 0, gaps: 1 });
    continue;
  }
  let bundle;
  try { bundle = port(repoDir, { instances: INSTANCES }); }
  catch (e) { rows.push({ id: meta.id, status: `FAILED: ${String(e).slice(0, 60)}`, tasks: 0, kind: "-", tools: 0, gaps: 1 }); continue; }
  validate(meta.id, bundle);
  writeFileSync(join(OUT, `${meta.id}.json`), JSON.stringify({ meta, ...bundle }, null, 1));
  const inst = bundle.tasks.reduce((a, t) => a + (t.instances?.length ?? 0), 0);
  rows.push({ id: meta.id, status: "ok", tasks: bundle.tasks.length, instances: inst,
              kind: bundle.grading.kind, ungraded: bundle.grading.ungraded ?? 0,
              tools: bundle.tools.length, docs: Array.isArray(bundle.documents)
                ? bundle.documents.length : (bundle.documents?.external_store ? "external" : 0),
              gaps: bundle.gaps.length,
              adaptations: (bundle.source.adaptations ?? []).length });
}

console.log("| source | tasks | instances | grading | ungraded | tools | documents | gaps | adaptations |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  if (r.status !== "ok") { console.log(`| ${r.id} | — | — | ${r.status} | | | | | |`); continue; }
  console.log(`| ${r.id} | ${r.tasks} | ${r.instances || "—"} | ${r.kind} | ${r.ungraded || "—"} | ` +
    `${r.tools || "none"} | ${r.docs} | ${r.gaps || "—"} | ${r.adaptations || "—"} |`);
}
const ok = rows.filter((r) => r.status === "ok");
console.log(`\n${ok.length} sources ported · ` +
  `${ok.reduce((a, r) => a + r.tasks, 0).toLocaleString()} tasks · ` +
  `deterministic ${ok.filter((r) => r.kind === "deterministic").length}, ` +
  `mixed ${ok.filter((r) => r.kind === "mixed").length}, ` +
  `judge ${ok.filter((r) => r.kind === "judge").length}`);
console.log(`-> ${OUT}`);
