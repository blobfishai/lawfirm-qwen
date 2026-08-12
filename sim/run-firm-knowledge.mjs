#!/usr/bin/env node
/**
 * Run the Calderwood & Harkness firm-knowledge tasks against our world.
 *
 * The agent gets the DMS surface only — corpus_matters_list, corpus_files_list,
 * corpus_search, corpus_read — over 9,288 files and ~133M characters. It cannot
 * read the whole corpus; that is the point of the environment.
 *
 * GRADING is deterministic on the matter ids Harvey's own rubric names (see
 * world/expansion/import-firm-knowledge.mjs). We report:
 *
 *   recall     — the fraction of required matters the answer names. This is
 *                what an all-pass rubric measures, one criterion at a time.
 *   precision  — of the matters the answer names, the fraction that qualify.
 *                An all-pass rubric of REQUIRED criteria cannot see this: an
 *                answer naming every right matter plus twelve wrong ones scores
 *                perfectly. On a sanctions sweep those twelve are false
 *                positives with real cost.
 *   all_pass   — every keyed criterion satisfied, for comparability with LAB.
 *
 * And one instrument the rubric cannot provide at all:
 *
 *   stopped_with_more — the agent received has_more:true from a search and then
 *                stopped searching. Harvey's stated finding is that failures are
 *                "not a failure of search strategy... a failure to know when to
 *                keep looking." Our tools say `has_more` in plain words, so we
 *                can measure whether the agent was TOLD there was more and
 *                ignored it, rather than inferring it from the score.
 *
 * Run: node sim/run-firm-knowledge.mjs --engine deepseek-chat --limit 5 \
 *        [--local-base http://localhost:8791] [--max-turns 60]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ENGINE_ID = opt("--engine", "deepseek-chat");
const BASE = opt("--local-base", "http://localhost:8791");
const LIMIT = Number(opt("--limit", "5"));
const MAX_TURNS = Number(opt("--max-turns", "60"));
const ONLY = opt("--tasks", "");
const CONC = Math.max(1, Number(opt("--concurrency", "1")));
const GRADING = opt("--grading", "");   // deterministic | mixed
const OUT_DIR = join(ROOT, "data", "firm-knowledge", ENGINE_ID);

// ---- engine ---------------------------------------------------------------
const cfg = JSON.parse(readFileSync(join(ROOT, "config/world.config.json"), "utf8"));
const spec = (cfg.models ?? cfg.engines)[ENGINE_ID];
if (!spec) { console.error(`unknown engine ${ENGINE_ID}`); process.exit(1); }
const env = { ...process.env };
if (existsSync(join(ROOT, ".env"))) {
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}
const API_KEY = env[spec.apiKeyEnv];
const BASE_URL = spec.baseUrl ?? env[spec.baseUrlEnv];
if (!API_KEY || !BASE_URL) { console.error(`engine ${ENGINE_ID} needs ${spec.apiKeyEnv}`); process.exit(1); }

const CORPUS_TOOLS = ["corpus_matters_list", "corpus_files_list", "corpus_search", "corpus_read"];

async function rpc(path, body, sid) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(sid ? { "X-Blobfish-Session": sid } : {}) },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function toolSchemas() {
  const r = await rpc("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  return (r.result?.tools ?? [])
    .filter((t) => CORPUS_TOOLS.includes(t.name))
    .map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
}

const SYSTEM = `You are a knowledge-management associate at Calderwood & Harkness.
You answer questions about the firm's own prior work by searching the document
management system. The corpus is far too large to read exhaustively — 9,288
files across 266 matters — so you must search, then read what matters.

Every search result reports "count" (total matches), "returned", and "has_more".
If has_more is true you have NOT seen every match. Page with "offset" until you
have, or narrow the query. An answer that omits qualifying matters is wrong even
if everything it does say is correct.

Cite matters by their id, in the form 1234-56789. Your final message must list
every qualifying matter id. Do not list matters that do not qualify.`;

async function runEpisode(task, tools) {
  const sid = (await rpc("/sessions", {})).session_id;
  const messages = [{ role: "system", content: SYSTEM },
                    { role: "user", content: task.prompt }];
  const steps = [];
  let usage = { prompt_tokens: 0, completion_tokens: 0 }, sawHasMore = false, lastSawHasMore = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: spec.model, messages, tools, temperature: 0, max_tokens: 4096 }),
    }).then((r) => r.json());
    const choice = res.choices?.[0];
    if (!choice) return { error: JSON.stringify(res).slice(0, 200), steps, sid };
    usage.prompt_tokens += res.usage?.prompt_tokens ?? 0;
    usage.completion_tokens += res.usage?.completion_tokens ?? 0;
    const msg = choice.message;
    messages.push(msg);

    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      return { answer: msg.content ?? "", steps, usage, sid, turns: turn + 1,
               sawHasMore, stoppedWithMore: lastSawHasMore };
    }
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse(c.function.arguments || "{}"); } catch { /* keep {} */ }
      const r = await rpc("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call",
                                    params: { name: c.function.name, arguments: args } }, sid);
      const text = (r.result?.content ?? []).map((x) => x.text ?? "").join("");
      let more = false;
      try { more = JSON.parse(text).has_more === true; } catch { /* not json */ }
      if (more) { sawHasMore = true; lastSawHasMore = true; } else { lastSawHasMore = false; }
      steps.push({ turn, tool: c.function.name, args, has_more: more, chars: text.length });
      messages.push({ role: "tool", tool_call_id: c.id, content: text.slice(0, 20000) });
    }
  }
  return { answer: "", steps, usage, sid, turns: MAX_TURNS, turnExhausted: true,
           sawHasMore, stoppedWithMore: lastSawHasMore };
}

function grade(task, answer) {
  const found = new Set([...String(answer).matchAll(/\b(\d{4}-\d{5})\b/g)].map((m) => m[1]));
  const expected = new Set(task.expected_matter_ids);
  const hit = [...expected].filter((id) => found.has(id));
  const extra = [...found].filter((id) => !expected.has(id));
  const keyed = task.criteria.filter((c) => !c.judge_required);
  const perCriterion = keyed.map((c) => ({
    id: c.id, passed: c.matter_ids.every((id) => found.has(id)), title: c.title,
  }));
  return {
    recall: expected.size ? hit.length / expected.size : null,
    precision: found.size ? hit.length / found.size : null,
    all_pass: perCriterion.length > 0 && perCriterion.every((c) => c.passed),
    expected: expected.size, found: found.size, hit: hit.length, over_included: extra.length,
    missed: [...expected].filter((id) => !found.has(id)).slice(0, 12),
    criteria_passed: perCriterion.filter((c) => c.passed).length,
    criteria_total: perCriterion.length,
    ungraded_prose_criteria: task.criteria.length - keyed.length,
  };
}

// ---- main -----------------------------------------------------------------
// --bank lets the same runner grade any matter-id-keyed set: Harvey's 250 and
// the generated corpus waves share an answer shape, so they share a grader.
const BANK = opt("--bank", "world/blobfish/firm-knowledge-tasks.json");
const bank = JSON.parse(readFileSync(join(ROOT, BANK), "utf8"));
let list = bank.taskList.filter((t) => t.grading !== "judge_only");
// Tasks whose answer key is known-wrong. Measuring them buys nothing but a
// number that looks like a model result — see docs/AUDIT.md Bug 12. --all
// includes them for anyone re-checking the keys themselves.
const quarantined = list.filter((t) => t.quarantined);
if (!argv.includes("--all") && quarantined.length) {
  list = list.filter((t) => !t.quarantined);
  console.log(`quarantined: skipping ${quarantined.length} task(s) with known-bad keys `
    + `(--all to include): ${quarantined.slice(0, 4).map((t) => t.task_id).join(", ")}`
    + `${quarantined.length > 4 ? ", …" : ""}`);
}
if (GRADING) list = list.filter((t) => t.grading === GRADING);
if (ONLY) { const want = new Set(ONLY.split(",")); list = list.filter((t) => want.has(t.task_id)); }
else list = list.slice(0, LIMIT);

const tools = await toolSchemas();
if (tools.length !== CORPUS_TOOLS.length) {
  console.error(`expected ${CORPUS_TOOLS.length} corpus tools, server offered ${tools.length} — is world-v15 served?`);
  process.exit(1);
}

/**
 * ABORT IF THE WORLD GOES AWAY MID-RUN.
 *
 * A previous run lost its server partway through (I killed it myself from
 * another shell) and the runner cheerfully finished all 201 tasks: every
 * remaining episode made ZERO tool calls, answered nothing, and was scored
 * recall 0. Those are indistinguishable from genuine failures in the output —
 * 186 of 202 episodes were fabricated misses, and the summary reported mean
 * recall 4.8 as if it were a result.
 *
 * A harness that manufactures failures when its backend disappears is worse
 * than one that crashes. Episodes now verify the world is reachable, and an
 * episode that completes without a single successful tool call aborts the run
 * rather than being recorded.
 */
async function worldAlive() {
  try {
    const r = await fetch(`${BASE}/health`);
    const j = await r.json();
    return j && j.ok === true;
  } catch { return false; }
}
if (!(await worldAlive())) { console.error("world /health is not ok — refusing to start"); process.exit(1); }
mkdirSync(OUT_DIR, { recursive: true });
console.log(`firm-knowledge: ${list.length} tasks on ${ENGINE_ID}, ${tools.length} corpus tools, max ${MAX_TURNS} turns\n`);

const results = [];
let done = 0, spentTokens = 0;
// Episodes are independent — each opens its own session — so they run
// concurrently. Wall clock at concurrency 1 is ~14h for the full set.
async function worker(queue) {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    const [i, task] = item;
    const t0 = Date.now();
    let ep;
    try { ep = await runEpisode(task, tools); }
    catch (e) { ep = { error: String(e).slice(0, 160), steps: [], usage: {} }; }
    if (!ep.steps.length) {
      const alive = await worldAlive();
      if (!alive) {
        console.error(`\nABORT: ${task.task_id} made no tool calls and the world is unreachable. ` +
          `Refusing to record fabricated failures — fix the world and resume.`);
        process.exit(2);
      }
    }
    const g = grade(task, ep.answer ?? "");
    const secs = (Date.now() - t0) / 1000;
    const rec = { task_id: task.task_id, title: task.title, grading: task.grading,
                  ...g, turns: ep.turns, tool_calls: ep.steps.length,
                  saw_has_more: ep.sawHasMore, stopped_with_more: ep.stoppedWithMore,
                  turn_exhausted: !!ep.turnExhausted, seconds: Math.round(secs),
                  usage: ep.usage, error: ep.error };
    results.push(rec);
    spentTokens += (ep.usage?.prompt_tokens ?? 0) + (ep.usage?.completion_tokens ?? 0);
    writeFileSync(join(OUT_DIR, `${task.task_id}.json`),
      JSON.stringify({ ...rec, answer: ep.answer, steps: ep.steps }, null, 1));
    done++;
    console.log(`[${String(done).padStart(3)}/${list.length}] ${task.task_id} ` +
      `${String(task.title ?? task.kind ?? task.task_id).slice(0, 42).padEnd(42)} ` +
      `recall ${g.recall === null ? " —" : (100 * g.recall).toFixed(0).padStart(3)} ` +
      `prec ${g.precision === null ? " —" : (100 * g.precision).toFixed(0).padStart(3)} ` +
      `${g.all_pass ? "PASS" : "    "} ` +
      `| ${g.hit}/${g.expected} +${g.over_included} ` +
      `| ${String(ep.steps.length).padStart(3)}c ${String(Math.round(secs)).padStart(3)}s ` +
      `| $${(spentTokens / 1e6 * 0.5).toFixed(2)}` +
      `${ep.turnExhausted ? " EXHAUSTED" : ep.stoppedWithMore ? " STOPPED-MORE" : ""}`);
  }
}
// Resume: a task already recorded WITH tool calls is kept; zero-call records are
// treated as absent so a poisoned run self-heals instead of needing a manual purge.
const kept = [];
list = list.filter((t) => {
  const f = join(OUT_DIR, `${t.task_id}.json`);
  if (!existsSync(f)) return true;
  try {
    const prev = JSON.parse(readFileSync(f, "utf8"));
    if ((prev.tool_calls ?? 0) > 0) { kept.push(t.task_id); return false; }
  } catch { /* unreadable -> rerun */ }
  return true;
});
if (kept.length) console.log(`resuming: ${kept.length} valid episodes kept, ${list.length} to run\n`);
const queue = [...list.entries()];
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, () => worker(queue)));
results.sort((a, b) => a.task_id.localeCompare(b.task_id));

const n = results.length;
const avg = (f) => results.map(f).filter((x) => x !== null && x !== undefined).reduce((a, b) => a + b, 0) / n;
console.log(`\n${n} tasks · mean recall ${(100 * avg((r) => r.recall)).toFixed(1)} · ` +
  `mean precision ${(100 * avg((r) => r.precision)).toFixed(1)} · ` +
  `all-pass ${results.filter((r) => r.all_pass).length}/${n} · ` +
  `stopped-with-more ${results.filter((r) => r.stopped_with_more).length}/${n} · ` +
  `mean ${Math.round(avg((r) => r.seconds))}s`);
writeFileSync(join(OUT_DIR, "_summary.json"), JSON.stringify(results, null, 1));
console.log(`-> ${OUT_DIR}`);
