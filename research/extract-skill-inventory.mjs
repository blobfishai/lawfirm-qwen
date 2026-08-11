#!/usr/bin/env node
/**
 * Extract the task taxonomy from the cloned automation corpus.
 *
 * `CSlawyer1985/claude-for-legal-ZH` ships 175 SKILL.md files across 13 practice
 * areas plus 10 watcher agents — a practitioner's taxonomy of what a legal agent
 * is actually asked to do, with each skill's inputs, workflow and output path
 * written down. That is the evidence base for questions C1–C4 in
 * research/QUESTIONS.md (task families, input documents, definition of done,
 * difficulty variations).
 *
 * The corpus is Chinese; skill names, paths, argument hints and output
 * filenames are English, which is what the taxonomy needs. Prose is kept
 * verbatim as evidence — we cite it, we do not translate it into a claim.
 *
 * Emits research/answers/data/skill-inventory.json.
 * Run: node research/extract-skill-inventory.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "repos", "CSlawyer1985@claude-for-legal-ZH");
if (!existsSync(REPO)) {
  console.error("corpus missing — run bash research/clone-repos.sh first");
  process.exit(1);
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === ".git" || e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(REPO);
const skillFiles = files.filter((f) => f.endsWith("SKILL.md"));
const agentFiles = files.filter((f) => /\/agents\/[^/]+\.md$/.test(f));

const frontmatter = (src) => {
  const m = /^---\n([\s\S]*?)\n---/.exec(src);
  if (!m) return {};
  const fm = {};
  let key = null;
  for (const line of m[1].split("\n")) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (kv) { key = kv[1]; fm[key] = kv[2].replace(/^>\s*$/, "").trim(); }
    else if (key && line.trim()) fm[key] = (fm[key] ? fm[key] + " " : "") + line.trim();
  }
  return fm;
};

// Output artifacts a skill writes — the "what does done look like" signal.
const OUT_RE = /([a-z0-9_\-]+\.(?:md|docx|xlsx|csv|pdf|json))/gi;
// Gate/guard language: the workflow's own guardrails, in any language.
const GUARDS = [
  ["confidentiality_gate", /保密门禁|privilege screen|confidential/i],
  ["source_attribution", /来源标注|需复核|需验证|source attribution|cite the source/i],
  ["versioning_diff", /版本号递增|diff|版本/i],
  ["gap_disclosure", /缺口|gap|unreachable|无法访问/i],
  ["human_confirmation", /确认[:：]|confirm|复核/i],
  ["posture_dependent", /进攻框架|防御框架|原告|被告|plaintiff|defendant/i],
];

const skills = skillFiles.map((f) => {
  const src = readFileSync(f, "utf8");
  const fm = frontmatter(src);
  const rel = relative(join(HERE, ".."), f);
  const area = relative(REPO, f).split("/")[0];
  const name = fm.name || relative(REPO, f).split("/").slice(-2)[0];
  const outputs = [...new Set([...src.matchAll(OUT_RE)].map((m) => m[1].toLowerCase()))];
  const guards = GUARDS.filter(([, re]) => re.test(src)).map(([k]) => k);
  // numbered workflow steps in the command block = the reference walk shape
  const steps = (src.match(/^\d+\.\s/gm) ?? []).length;
  return {
    area, name,
    argument_hint: fm["argument-hint"] ?? null,
    description: (fm.description ?? "").slice(0, 400),
    outputs, guards, steps,
    bytes: src.length,
    evidence_path: rel,
  };
});

const agents = agentFiles.map((f) => {
  const src = readFileSync(f, "utf8");
  const fm = frontmatter(src);
  return {
    area: relative(REPO, f).split("/")[0],
    name: fm.name ?? relative(REPO, f).split("/").pop().replace(/\.md$/, ""),
    description: (fm.description ?? "").slice(0, 300),
    evidence_path: relative(join(HERE, ".."), f),
  };
});

// roll-ups
const byArea = {};
for (const s of skills) (byArea[s.area] ??= []).push(s.name);
const guardCounts = {};
for (const s of skills) for (const g of s.guards) guardCounts[g] = (guardCounts[g] ?? 0) + 1;
const outputCounts = {};
for (const s of skills) for (const o of s.outputs) outputCounts[o] = (outputCounts[o] ?? 0) + 1;

const DEST = join(HERE, "answers", "data");
mkdirSync(DEST, { recursive: true });
writeFileSync(join(DEST, "skill-inventory.json"), JSON.stringify({
  source_repo: "CSlawyer1985/claude-for-legal-ZH",
  extracted_from: relative(join(HERE, ".."), REPO),
  skills: skills.length, agents: agents.length, areas: Object.keys(byArea).length,
  byArea, guardCounts, outputCounts, skillList: skills, agentList: agents,
}, null, 1));

console.log(`skills: ${skills.length} across ${Object.keys(byArea).length} practice areas · agents: ${agents.length}`);
console.log("\nworkflow guards present across skills (the domain's own guardrails):");
for (const [g, n] of Object.entries(guardCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${g}`);
}
console.log("\nmost common output artifacts (what 'done' produces):");
for (const [o, n] of Object.entries(outputCounts).sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(`  ${String(n).padStart(4)}  ${o}`);
}
const deep = skills.filter((s) => s.steps >= 8).length;
console.log(`\nskills whose command block has >= 8 numbered steps: ${deep}/${skills.length}`);
