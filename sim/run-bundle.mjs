#!/usr/bin/env node
/**
 * Generic runner for any deterministic port bundle.
 *
 * LegalBench got a bespoke runner, then CUAD and MAUD arrived and would have
 * needed two more. They do not: every deterministic bundle has the same shape —
 * tasks with instances, each instance carrying `expected` and some fields — so
 * one runner covers all of them and every future one.
 *
 * Grading is per bundle kind:
 *   label      exact match against `expected`, with the label extractor that
 *              tolerates "Option A: ..." for a gold of "A"
 *   span       `expected` must APPEAR in the response (normalised), except when
 *              expected is __abstain__, where the response must decline
 *
 * The abstain case is why CUAD needs its own comparison: 70% of its test set is
 * a clause that is not there, and "NONE" must be scored as correct while a
 * confident quotation of absent language must not.
 *
 * Run: node sim/run-bundle.mjs --bundle cuad --engine deepseek-chat [--limit N]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const BUNDLE = opt("--bundle", "");
const ENGINE_ID = opt("--engine", "deepseek-chat");
const LIMIT = Number(opt("--limit", "0"));
const CONC = Math.max(1, Number(opt("--concurrency", "8")));
if (!BUNDLE) { console.error("--bundle required (cuad|maud|legalbench|…)"); process.exit(1); }

const bundlePath = join(ROOT, "world/port/bundles", `${BUNDLE}.json`);
if (!existsSync(bundlePath)) { console.error(`no bundle ${BUNDLE} — run world/port/port.mjs`); process.exit(1); }
const b = JSON.parse(readFileSync(bundlePath, "utf8"));
if (b.grading.kind === "judge") {
  console.error(`bundle ${BUNDLE} is judge-graded; this runner only handles deterministic keys`);
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(join(ROOT, "config/world.config.json"), "utf8"));
const spec = (cfg.models ?? cfg.engines)[ENGINE_ID];
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

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/^["'\s]+|["'.\s]+$/g, "");
const ABSTAIN = /^(none|no such clause|not present|n\/a|absent|no)\b/i;

function extractLabel(resp, labels) {
  const text = String(resp ?? ""), flat = norm(text);
  if (!labels?.length) return norm(text.split("\n").find((x) => x.trim()) ?? "");
  const cand = labels.map(norm);
  if (cand.includes(flat)) return flat;
  for (const pat of [/answer\s+is[:\s*"']*([^\s*"'.,:;\n]+)/i, /option\s+([^\s*"'.,:;\n]+)/i,
                     /\*\*\s*([^*\s:]+)\s*[:*]/, /^\s*([^\s*"'.,:;\n]+)\s*[:.\-]/]) {
    const m = pat.exec(text);
    if (m) { const c = norm(m[1]); if (cand.includes(c)) return c; }
  }
  const hits = cand.filter((c) => new RegExp(`(^|[^a-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(flat));
  return hits.length === 1 ? hits[0] : norm(text.split("\n").find((x) => x.trim()) ?? "");
}

function score(expected, resp, labels) {
  if (expected === "__abstain__") {
    // Correct only if the model declines. A confident quotation of language that
    // is not in the contract is the failure this class of instance exists to catch.
    return ABSTAIN.test(String(resp).trim()) ? { correct: true, mode: "abstained" }
                                             : { correct: false, mode: "fabricated" };
  }
  if (labels?.length) {
    return { correct: extractLabel(resp, labels) === norm(expected), mode: "label" };
  }
  const hay = norm(resp), needle = norm(expected).slice(0, 160);
  if (!needle) return { correct: false, mode: "empty-key" };
  // span containment, and an abstention on an answerable item is a miss
  if (ABSTAIN.test(String(resp).trim())) return { correct: false, mode: "over-abstained" };
  return { correct: hay.includes(needle), mode: "span" };
}

const FORMAT = (t) => t.label_space?.length
  ? `Answer with the label only. Reply with exactly one of: ${t.label_space.join(", ")}.`
  : "Quote the operative language verbatim, or reply exactly NONE if it is absent. No commentary.";

async function ask(system, user) {
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: spec.model, temperature: 0, max_tokens: 300,
      messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  }).then((x) => x.json());
  return r.choices?.[0]?.message?.content ?? "";
}

let list = b.tasks.filter((t) => (t.instances ?? []).length);
if (LIMIT) list = list.slice(0, LIMIT);
const OUT = join(ROOT, "data", "bundles", BUNDLE, ENGINE_ID);
mkdirSync(OUT, { recursive: true });
console.log(`${BUNDLE}: ${list.length} tasks · ` +
  `${list.reduce((a, t) => a + t.instances.length, 0)} instances on ${ENGINE_ID}\n`);

const results = [];
let done = 0;
async function worker(q) {
  for (;;) {
    const t = q.shift();
    if (!t) return;
    const marks = [];
    for (const inst of t.instances) {
      const body = inst.fields
        ? Object.entries(inst.fields).map(([k, v]) => `${k}:\n${v}`).join("\n\n")
        : String(inst.context ?? "");
      const user = `${t.prompt}\n\n${body}`;
      let got = "";
      try { got = await ask(FORMAT(t), user); } catch (e) { got = `__error__${e}`.slice(0, 60); }
      const s = score(inst.expected, got, t.label_space);
      marks.push({ expected: String(inst.expected).slice(0, 80), got: String(got).slice(0, 120), ...s });
    }
    const correct = marks.filter((m) => m.correct).length;
    const rec = { task_id: t.id, title: t.title ?? t.id, instances: marks.length, correct,
                  accuracy: correct / marks.length,
                  fabricated: marks.filter((m) => m.mode === "fabricated").length,
                  over_abstained: marks.filter((m) => m.mode === "over-abstained").length };
    results.push(rec);
    writeFileSync(join(OUT, `${t.id}.json`), JSON.stringify({ ...rec, marks }, null, 1));
    if (++done % 10 === 0 || done === list.length) {
      console.log(`  [${String(done).padStart(3)}/${list.length}] ${String(t.title ?? t.id).slice(0, 46).padEnd(46)} ${(100 * rec.accuracy).toFixed(0).padStart(3)}%`);
    }
  }
}
// ONE queue shared by every worker. Handing each worker its own copy ran the
// whole bundle CONC times — 196 instances reported as 1,568, with each task
// appearing eight times in the results.
const queue = [...list];
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, () => worker(queue)));
results.sort((a, b2) => a.accuracy - b2.accuracy);

const inst = results.reduce((a, r) => a + r.instances, 0);
const corr = results.reduce((a, r) => a + r.correct, 0);
const fab = results.reduce((a, r) => a + r.fabricated, 0);
const over = results.reduce((a, r) => a + r.over_abstained, 0);
console.log(`\n${BUNDLE}: ${corr}/${inst} instances = ${(100 * corr / inst).toFixed(1)}%`);
if (fab || over) {
  console.log(`  fabricated (answered when the correct action was to abstain): ${fab}`);
  console.log(`  over-abstained (declined when an answer existed):             ${over}`);
}
console.log("\nweakest 6:");
for (const r of results.slice(0, 6)) console.log(`  ${(100 * r.accuracy).toFixed(0).padStart(3)}%  ${r.title}`);
writeFileSync(join(OUT, "_summary.json"), JSON.stringify({ bundle: BUNDLE, engine: ENGINE_ID,
  adaptations: b.source.adaptations ?? [], instances: inst, correct: corr, fabricated: fab,
  over_abstained: over, results }, null, 1));
console.log(`\n-> ${OUT}`);
