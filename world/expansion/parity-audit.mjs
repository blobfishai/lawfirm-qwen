#!/usr/bin/env node
/**
 * Parity audit — how much of the downloaded corpus do we actually HOST?
 *
 * This exists because the project was built in the wrong order. The world had
 * 156 tasks before a single repo was cloned; the 46-repo corpus landed at
 * commit 7ea6ad3, after 250+ tasks already existed. So the research became
 * retrospective justification rather than upfront specification, and
 * "eval-anchored" came to mean two very different things that were never
 * separated:
 *
 *   HOSTED   we read the eval's own task definitions and/or documents from
 *            research/repos/ and run them. Their data, their ground truth.
 *   INSPIRED we wrote tasks in the shape of that eval from our own knowledge.
 *            Defensible content; NOT parity, and it must not be counted as
 *            coverage of that benchmark.
 *
 * The cost of not separating them: we anchored tasks to
 * `harvey_lab/diligence/aerospace-vertical-integration` by name for months. The
 * real thing is a 4,061-document data room. Ours was a handful of text rows.
 * The anchor named a shape we had never reproduced, and nothing in the
 * pipeline could notice, because coverage was measured against a registry of
 * URLs rather than against downloaded task definitions.
 *
 * This audit reports parity as a number per benchmark, so the gap is visible
 * on every run instead of surfacing when someone asks the right question.
 *
 * Run: node world/expansion/parity-audit.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPOS = join(ROOT, "research", "repos");

/** Count a benchmark's own task definitions, however that benchmark stores them. */
const SOURCES = [
  { name: "harvey-labs (practice + contracts)", repo: "harveyai@harvey-labs",
    count: (d) => walkCount(join(d, "tasks"), (p) => p.endsWith("task.json") && !p.includes("firm-knowledge")) },
  { name: "harvey-labs firm-knowledge (C&H)", repo: "harveyai@harvey-labs",
    count: (d) => walkCount(join(d, "tasks", "firm-knowledge", "tasks"), (p) => p.endsWith("task.json")) },
  { name: "LegalBench", repo: "HazyResearch@legalbench",
    count: (d) => existsSync(join(d, "tasks")) ? readdirSync(join(d, "tasks"))
      .filter((x) => statSync(join(d, "tasks", x)).isDirectory()).length : 0 },
  { name: "CUAD", repo: "TheAtticusProject@cuad",
    count: () => 41 },   // 41 expert clause categories
  { name: "MAUD", repo: "TheAtticusProject@maud",
    count: () => 92 },   // 92 distinct deal-point questions in the test split
  { name: "ACORD", repo: "TheAtticusProject@acord", count: () => 1 },
  { name: "ObliQA", repo: "RegNLP@ObliQADataset", count: () => 1 },
  { name: "LawFlow", repo: "minnesotanlp@LawFlow", count: () => 1 },
  { name: "LawBench", repo: "open-compass@LawBench", count: () => 1 },
  { name: "lex-glue", repo: "coastalcph@lex-glue", count: () => 1 },
];

function walkCount(dir, pred) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  const walk = (d) => {
    let es; try { es = readdirSync(d); } catch { return; }
    for (const e of es) {
      if (e === "documents" || e === ".git") continue;
      const p = join(d, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (pred(p)) n++;
    }
  };
  walk(dir);
  return n;
}

// ---- what do WE host, and from where? -------------------------------------
// A pack is HOSTED parity only if its generator reads research/repos/.
const PACK_DIRS = readdirSync(join(ROOT, "world", "expansion"))
  .filter((d) => d.startsWith("packs"));
const packSource = {};   // family -> "hosted" | "inspired"
for (const pd of PACK_DIRS) {
  const dir = join(ROOT, "world", "expansion", pd);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".mjs")) continue;
    const src = readFileSync(join(dir, f), "utf8");
    const readsCorpus = /research\/repos\//.test(src);
    for (const j of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const fam = JSON.parse(readFileSync(join(dir, j), "utf8")).family;
      if (fam) packSource[fam] = readsCorpus ? "hosted" : "inspired";
    }
  }
  // static packs with no generator are inspired by definition
  for (const j of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const fam = JSON.parse(readFileSync(join(dir, j), "utf8")).family;
    if (fam && !(fam in packSource)) packSource[fam] = "inspired";
  }
}

const raw = JSON.parse(readFileSync(join(ROOT, "world/blobfish/world-v14.json"), "utf8"));
const world = raw.world ?? raw;
const famOf = (t) => (t.provenance?.source_workflow ?? "").split(":")[1]?.split("/")[0]?.trim()
  || t.expansion?.family || "";
const ourTasks = world.tasks.length;
let hosted = 0, inspired = 0, other = 0;
for (const t of world.tasks) {
  const s = packSource[famOf(t)];
  if (s === "hosted") hosted++; else if (s === "inspired") inspired++; else other++;
}

// C&H is hosted outside the world document (its own task bank + corpus)
const fkPath = join(ROOT, "world/blobfish/firm-knowledge-tasks.json");
const fk = existsSync(fkPath) ? JSON.parse(readFileSync(fkPath, "utf8")).tasks : 0;

// world/port/bundles/*.json are written by world/port/port.mjs. A source counts
// as hosted only for tasks we can actually RUN and GRADE, so judge-only bundles
// contribute 0 until a judge exists — claiming otherwise is the error this file
// was written to prevent.
const BUNDLES = join(ROOT, "world", "port", "bundles");
const BUNDLE_HOSTED = {};
if (existsSync(BUNDLES)) {
  for (const f of readdirSync(BUNDLES).filter((x) => x.endsWith(".json"))) {
    const b = JSON.parse(readFileSync(join(BUNDLES, f), "utf8"));
    const runnable = b.grading?.kind === "judge" ? 0 : (b.tasks ?? []).length;
    const label = { legalbench: "LegalBench", cuad: "CUAD", maud: "MAUD",
                    "harvey-firm-knowledge": "harvey-labs firm-knowledge (C&H)",
                    "harvey-practice": "harvey-labs (practice + contracts)" }[b.meta?.id];
    if (label) BUNDLE_HOSTED[label] = runnable;
  }
}

const rows = SOURCES.map((s) => {
  const d = join(REPOS, s.repo);
  const available = existsSync(d) ? s.count(d) : 0;
  // Hosted counts come from the PORT BUNDLES — the pipeline's own output — so
  // this scoreboard cannot drift from what was actually ported.
  const hostedN = BUNDLE_HOSTED[s.name] ?? 0;
  return { ...s, available, hosted: hostedN,
           parity: available ? hostedN / available : 0 };
});

const out = [];
out.push("# Parity audit — how much of the downloaded corpus do we host?");
out.push("");
out.push("`HOSTED` means we read the benchmark's own task definitions and/or documents out of");
out.push("`research/repos/` and run them: their data, their ground truth. `INSPIRED` means we wrote");
out.push("tasks in that benchmark's shape from our own knowledge — defensible content, but **not**");
out.push("coverage of that benchmark, and it is not counted as such here.");
out.push("");
out.push("| Benchmark | Task definitions available | Hosted | Parity |");
out.push("|---|---|---|---|");
for (const r of rows.sort((a, b) => b.available - a.available)) {
  out.push(`| ${r.name} | ${r.available.toLocaleString()} | ${r.hosted.toLocaleString()} | ` +
    `${(100 * r.parity).toFixed(1)}% |`);
}
const availTot = rows.reduce((a, r) => a + r.available, 0);
const hostTot = rows.reduce((a, r) => a + r.hosted, 0);
out.push(`| **total** | **${availTot.toLocaleString()}** | **${hostTot.toLocaleString()}** | ` +
  `**${(100 * hostTot / availTot).toFixed(1)}%** |`);
out.push("");
out.push("## Our own tasks, by provenance");
out.push("");
out.push(`| Source | Tasks |`);
out.push(`|---|---|`);
out.push(`| hosted (generator reads research/repos/) | ${hosted} |`);
out.push(`| inspired (authored from knowledge) | ${inspired} |`);
out.push(`| original world / graph-walk | ${other} |`);
out.push(`| **world total** | **${ourTasks}** |`);
out.push("");
out.push("## What this corrects");
out.push("");
out.push("`docs/COVERAGE.md` reports 24 covered / 17 partial / 0 hostable-gap against a registry of");
out.push("101 items. That registry is a list of URLs and descriptions; the verdicts were reached by");
out.push("reading abstracts, not by running the benchmarks' own tasks. It measures *whether the world");
out.push("could express a shape*, which is a real question, but it is not parity and should never");
out.push("have been read as parity. This file measures parity.");

writeFileSync(join(ROOT, "docs", "PARITY.md"), out.join("\n") + "\n");
console.log(`parity: ${hostTot.toLocaleString()} hosted of ${availTot.toLocaleString()} available ` +
  `(${(100 * hostTot / availTot).toFixed(1)}%)`);
console.log(`  our tasks: ${hosted} hosted · ${inspired} inspired · ${other} original`);
console.log("  -> docs/PARITY.md");
