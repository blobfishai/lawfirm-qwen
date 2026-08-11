#!/usr/bin/env node
/**
 * Retire the "recipe" tasks — the ones whose prompt hands over the answer.
 *
 * A recipe prompt reads, in full:
 *
 *   Complete the "harvey_lab: antitrust-competition matter workflow" workflow
 *   for Law Firm Company: list legal matters -> get legal matters -> create
 *   legal matters amount history. Use the matters record with id
 *   "legal_matters_001".
 *
 * It names the tool sequence and the target record, and its verifier pins no
 * value — so there is nothing to find, nothing to derive, and nothing to get
 * wrong. The discrimination sweep confirmed it: a corrupted write payload
 * passes with reward 1.0 (docs/DISCRIMINATION.md).
 *
 * These are replaced one-for-one by packs-v4, which keeps each family, anchor
 * and terminal write tool but adds documents, a firm rule, and a pinned answer.
 *
 * Retired task ids are NOT reused — archived traces referencing them stay
 * interpretable as history, and the retirement is recorded in the world so the
 * count is auditable rather than a silent shrink.
 *
 * Run: node world/expansion/retire-recipe-tasks.mjs \
 *        [--in world/blobfish/world-v5.json] [--out world/blobfish/world-v5-pruned.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const abs = (p) => (isAbsolute(p) ? p : join(ROOT, p));

const IN = abs(opt("--in", "world/blobfish/world-v5.json"));
const OUT = abs(opt("--out", "world/blobfish/world-v5-pruned.json"));

const raw = JSON.parse(readFileSync(IN, "utf8"));
const world = raw.world ?? raw;

// A recipe prompt spells its own walk out with arrows. That is the signature —
// no real task prompt in this world enumerates its tool sequence.
const isRecipe = (t) => /->/.test(String(t.prompt ?? ""));
const retired = world.tasks.filter(isRecipe);
const retiredIds = new Set(retired.map((t) => t.task_id));

if (!retired.length) {
  console.log("no recipe tasks found — nothing to retire");
  process.exit(0);
}

world.tasks = world.tasks.filter((t) => !retiredIds.has(t.task_id));
world.verifiers = (world.verifiers ?? []).filter((v) => !retiredIds.has(v.task_id));

world.retired_tasks = [
  ...(world.retired_tasks ?? []),
  ...retired.map((t) => ({
    task_id: t.task_id,
    family: (t.provenance?.source_workflow ?? "").split(":")[1]?.trim() ?? "",
    terminal_write: (t.walk ?? []).slice(-1)[0] ?? null,
    reason: "recipe prompt: names its own tool walk and target id; verifier pins no value " +
      "(discrimination sweep: corrupted write payload passes with reward 1.0)",
    replaced_by_pack: "packs-v4",
  })),
];

writeFileSync(OUT, JSON.stringify(raw, null, 2 - 1));
const byWrite = {};
for (const t of retired) {
  const w = (t.walk ?? []).slice(-1)[0] ?? "(none)";
  byWrite[w] = (byWrite[w] ?? 0) + 1;
}
console.log(`retired ${retired.length} recipe tasks -> ${world.tasks.length} remain`);
for (const [w, n] of Object.entries(byWrite).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${w}`);
}
console.log(`out: ${OUT}`);
