#!/usr/bin/env node
/**
 * Run LegalBench — their prompt, their instance, their gold label.
 *
 * LegalBench is a prompting benchmark, not an agentic one: each instance is a
 * classification from text with a fixed label space. So this runner uses their
 * base_prompt.txt verbatim, substitutes the instance fields into their
 * {{placeholders}}, and grades exact match on their `answer` column. No tools,
 * no judge, no interpretation.
 *
 * Splits are reported SEPARATELY and never pooled. Only 16 of the 160 tasks
 * ship an official test split in the repo; the other 144 are train-split
 * instances, and a train-split number is not a LegalBench test score.
 *
 * Run: node sim/run-legalbench.mjs --engine deepseek-chat [--split test]
 *        [--limit N] [--concurrency 6]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ENGINE_ID = opt("--engine", "deepseek-chat");
const SPLIT = opt("--split", "");
const LIMIT = Number(opt("--limit", "0"));
const CONC = Math.max(1, Number(opt("--concurrency", "6")));
const OUT_DIR = join(ROOT, "data", "legalbench", ENGINE_ID);

const cfg = JSON.parse(readFileSync(join(ROOT, "config/world.config.json"), "utf8"));
const spec = (cfg.models ?? cfg.engines)[ENGINE_ID];
if (!spec) { console.error(`unknown engine ${ENGINE_ID}`); process.exit(1); }
const env = { ...process.env };
if (existsSync(join(ROOT, ".env"))) {
  for (const l of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
    if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}
const API_KEY = env[spec.apiKeyEnv];
const BASE_URL = spec.baseUrl ?? env[spec.baseUrlEnv];
if (!API_KEY || !BASE_URL) { console.error(`engine needs ${spec.apiKeyEnv}`); process.exit(1); }

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/^["'\s]+|["'.\s]+$/g, "");

/**
 * Extract the asserted label from a free-form response.
 *
 * Exact match on the first line is wrong for multiple-choice tasks: gold "A"
 * against a response of `Option A: "All or substantially all"` is CORRECT and
 * scored it as a miss, which put five MAUD tasks at a spurious 0%. Prefer an
 * explicit assertion, fall back to an unambiguous standalone mention, and score
 * a miss when two labels are equally asserted rather than guessing.
 */
function extractLabel(resp, labels) {
  const text = String(resp ?? "");
  const flat = norm(text);
  if (!labels || !labels.length) return norm(text.split("\n").find((x) => x.trim()) ?? "");
  const cand = labels.map(norm);
  if (cand.includes(flat)) return flat;
  for (const pat of [/answer\s+is[:\s*"']*([^\s*"'.,:;\n]+)/i,
                     /option\s+([^\s*"'.,:;\n]+)/i,
                     /\*\*\s*([^*\s:]+)\s*[:*]/,
                     /^\s*([^\s*"'.,:;\n]+)\s*[:.\-]/]) {
    const m = pat.exec(text);
    if (m) { const c = norm(m[1]); if (cand.includes(c)) return c; }
  }
  const hits = cand.filter((c) => new RegExp(`(^|[^a-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(flat));
  return hits.length === 1 ? hits[0] : norm(text.split("\n").find((x) => x.trim()) ?? "");
}

function fill(template, fields) {
  // Their templates end with "A:" and expect the model to continue.
  let out = template;
  for (const [k, v] of Object.entries(fields)) {
    out = out.replaceAll(`{{${k}}}`, String(v));
  }
  return out.replace(/\{\{[a-z_]+\}\}/g, "");   // any field this instance lacks
}

/**
 * DISCLOSED ADAPTATION. LegalBench prompts target COMPLETION models: they end in
 * "A:" and expect the next token to be the label. A chat model answers in prose
 * instead — "the clause **requires consent**" where the gold label is "Yes" —
 * which is substantively correct and unscoreable, and put every cuad_* and
 * learned_hands_* task at 0%. We keep their prompt VERBATIM and add one system
 * line constraining the output format. That changes how the answer is expressed,
 * not what is asked, and it is recorded in the results file.
 */
function FORMAT_RULE(labels) {
  var base = "Answer with the label only - no explanation, no punctuation, no restatement.";
  if (labels && labels.length) {
    base += " Reply with exactly one of: " + labels.join(", ") + ".";
  }
  return base;
}

async function classify(prompt, labels) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: spec.model, temperature: 0, max_tokens: 32,
      messages: [{ role: "system", content: FORMAT_RULE(labels) },
                 { role: "user", content: prompt }],
    }),
  }).then((r) => r.json());
  return res.choices?.[0]?.message?.content ?? "";
}

const bank = JSON.parse(readFileSync(join(ROOT, "world/blobfish/legalbench-tasks.json"), "utf8"));
let list = bank.taskList;
if (SPLIT) list = list.filter((t) => t.split === SPLIT);
if (LIMIT) list = list.slice(0, LIMIT);
mkdirSync(OUT_DIR, { recursive: true });
console.log(`LegalBench: ${list.length} tasks on ${ENGINE_ID}` +
  `${SPLIT ? ` (${SPLIT} split only)` : ""}, ${list.reduce((a, t) => a + t.instances.length, 0)} instances\n`);

const results = [];
let done = 0;
async function worker(q) {
  for (;;) {
    const t = q.shift();
    if (!t) return;
    const marks = [];
    for (const inst of t.instances) {
      const prompt = fill(t.prompt_template, inst.fields);
      let got = "";
      try { got = await classify(prompt, t.label_space); } catch (e) { got = `__error__ ${e}`.slice(0, 60); }
      // their answers are single tokens/short phrases; take the first line
      const picked = extractLabel(got, t.label_space);
      marks.push({ index: inst.index, gold: inst.answer, got: String(got).slice(0, 80),
                   picked, correct: picked === norm(inst.answer) });
    }
    const acc = marks.filter((m) => m.correct).length / marks.length;
    const rec = { task_id: t.task_id, legalbench_task: t.legalbench_task, split: t.split,
                  instances: marks.length, correct: marks.filter((m) => m.correct).length,
                  accuracy: acc, label_space: t.label_space };
    results.push(rec);
    writeFileSync(join(OUT_DIR, `${t.task_id}.json`), JSON.stringify({ ...rec, marks }, null, 1));
    done++;
    if (done % 10 === 0 || done === list.length) {
      console.log(`  [${String(done).padStart(3)}/${list.length}] ${t.legalbench_task.slice(0, 38).padEnd(38)} ` +
        `${(100 * acc).toFixed(0).padStart(3)}%  (${t.split})`);
    }
  }
}
const q = [...list];
await Promise.all(Array.from({ length: Math.min(CONC, q.length) }, () => worker(q)));
results.sort((a, b) => a.accuracy - b.accuracy);

const bySplit = {};
for (const r of results) {
  const s = (bySplit[r.split] ??= { tasks: 0, inst: 0, correct: 0 });
  s.tasks++; s.inst += r.instances; s.correct += r.correct;
}
console.log("\nby split (never pooled — a train-split number is not a LegalBench test score):");
for (const [s, v] of Object.entries(bySplit)) {
  console.log(`  ${s.padEnd(6)} ${v.tasks} tasks · ${v.correct}/${v.inst} instances · ` +
    `${(100 * v.correct / v.inst).toFixed(1)}%`);
}
console.log("\nweakest 8 tasks:");
for (const r of results.slice(0, 8)) {
  console.log(`  ${(100 * r.accuracy).toFixed(0).padStart(3)}%  ${r.legalbench_task} (${r.split})`);
}
writeFileSync(join(OUT_DIR, "_summary.json"), JSON.stringify({ adaptation: FORMAT_RULE(null), bySplit, results }, null, 1));
console.log(`\n-> ${OUT_DIR}`);
