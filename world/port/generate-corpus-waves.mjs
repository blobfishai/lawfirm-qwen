#!/usr/bin/env node
/**
 * Wave generator — deeper tasks over the C&H corpus, with COMPUTED ground truth.
 *
 * Harvey ships 250 questions over this corpus. The corpus supports far more,
 * and the reason we can generate them safely is that the answer is computed
 * from the corpus itself rather than authored: SQL over the index plus
 * full-text scans of the extracted text. If the corpus changes, the key
 * changes with it. No judge, no hand-written answer that can drift from the
 * documents — the defect class that produced Bug 7 (a scenario contradicting
 * its own prompt) and Bug 8 (a key contradicting the world).
 *
 * The generators go beyond single-hop lookup, which is where Harvey's own
 * finding says models break — enumeration and cross-matter reasoning:
 *
 *   conjunction   matters where term A appears AND term B appears — in
 *                 DIFFERENT documents of the same matter, so a single search
 *                 cannot answer it
 *   exclusion     matters where A appears and B never does; the failure mode
 *                 is stopping at the first hit
 *   client_roll   which client has the most matters containing a term — needs
 *                 enumeration then aggregation, and a partial search gives a
 *                 confidently wrong winner
 *   structural    matters holding folder X but not folder Y; the answer is in
 *                 the shape of the file system, not in any document
 *   superlative   the matter with the most documents mentioning a term; a
 *                 model that stops at "has_more" gets this wrong by design
 *
 * Every generated task records `expected` (the matter id set), how it was
 * computed, and a difficulty estimate from the size of the answer set — which
 * is the axis Harvey reports as driving all-pass to zero.
 *
 * Run: node world/port/generate-corpus-waves.mjs [--wave 1] [--per-kind 12]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";


const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CORPUS = join(ROOT, "world", "corpus", "ch");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const WAVE = Number(opt("--wave", "1"));
const PER_KIND = Number(opt("--per-kind", "12"));

if (!existsSync(join(CORPUS, "index.sqlite"))) {
  console.error("corpus index missing — run world/corpus/build-corpus-index.py");
  process.exit(1);
}

// ---- load the corpus into memory once (text is ~534MB; we index by matter) --
const require = createRequire(import.meta.url);
let db;
try { db = require("node:sqlite"); } catch { db = null; }

// node:sqlite is not available everywhere; read the index via a tiny shim over
// the text tree instead, which is what we actually need (matter -> [text]).
const matters = new Map();   // matter_id -> [{ file, text }]
const textRoot = join(CORPUS, "text");
for (const m of readdirSync(textRoot)) {
  const dir = join(textRoot, m);
  let files;
  try { files = readdirSync(dir); } catch { continue; }
  matters.set(m, files.map((f) => ({ file: f, path: join(dir, f) })));
}
console.log(`corpus: ${matters.size} matters, ${[...matters.values()].reduce((a, v) => a + v.length, 0)} files`);

const lower = new Map();     // matter -> [{file, body}] lazily lowercased
function bodies(m) {
  if (!lower.has(m)) {
    lower.set(m, (matters.get(m) ?? []).map((f) => {
      let t = "";
      try { t = readFileSync(f.path, "utf8").toLowerCase(); } catch { /* unreadable */ }
      return { file: f.file, body: t };
    }));
  }
  return lower.get(m);
}

const clientOf = (m) => (m.includes("-") ? m.split("-")[0] : "");
const mattersWith = (term) => {
  const t = term.toLowerCase();
  const out = [];
  for (const m of matters.keys()) {
    const hits = bodies(m).filter((f) => f.body.includes(t));
    if (hits.length) out.push({ matter: m, files: hits.length });
  }
  return out;
};

// Terms drawn from the domain, not from inspecting answers — the point is that
// we do NOT know the answer until the corpus is scanned.
// Mined from the corpus when available (world/port/mine-corpus-terms.mjs): 400
// legally-salient phrases that discriminate, versus the 24 written by hand
// below. The hand list stays as the fallback so the generator still runs on a
// fresh checkout, but it was the reason six waves produced only 106 distinct
// questions — the vocabulary, not the generators, was the ceiling.
const MINED = join(ROOT, "world", "port", "corpus-terms.json");
const TERMS = existsSync(MINED)
  ? JSON.parse(readFileSync(MINED, "utf8")).terms.map((t) => t.term)
  : [
  "second request", "material adverse effect", "indemnification", "escrow",
  "non-compete", "change of control", "earn-out", "springing lien",
  "most favored nation", "liquidated damages", "force majeure", "arbitration",
  "OFAC", "FCPA", "data protection", "termination for convenience",
  "exclusivity", "right of first refusal", "tag-along", "drag-along",
  "management fee", "carried interest", "maintenance covenant", "incurrence covenant",
];
console.log(`vocabulary: ${TERMS.length} terms ${existsSync(MINED) ? "(mined from corpus)" : "(hand-written fallback)"}`);
/**
 * Real folder taxonomy, read from index.sqlite.
 *
 * The first version matched folder names against the FLATTENED filenames in
 * world/corpus/ch/text/, which drop the folder path entirely — so structural
 * generation produced 11 tasks out of 518 and most of those by accident. The
 * folder is a column in the index; use it.
 */
const folderByMatter = new Map();   // matter -> Set(folder)
let FOLDERS = ["Diligence", "Closing", "Correspondence", "Engagement",
               "Transaction Documents", "Pleadings", "Financing", "Discovery"];
try {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(join(CORPUS, "index.sqlite"));
  for (const r of db.prepare("SELECT matter_id, folder FROM files WHERE folder <> ''").all()) {
    const top = String(r.folder).split("/")[0].trim();
    if (!top) continue;
    if (!folderByMatter.has(r.matter_id)) folderByMatter.set(r.matter_id, new Set());
    folderByMatter.get(r.matter_id).add(top);
  }
  const counts = {};
  for (const set of folderByMatter.values()) for (const f of set) counts[f] = (counts[f] ?? 0) + 1;
  FOLDERS = Object.entries(counts)
    .filter(([, n]) => n >= 8 && n <= matters.size * 0.8)
    .sort((a, b) => b[1] - a[1]).slice(0, 16).map(([f]) => f);
  console.log(`folders: ${FOLDERS.length} from the index (${folderByMatter.size} matters mapped)`);
} catch (e) {
  console.log(`folders: falling back to the hard-coded list (${String(e).slice(0, 60)})`);
}

const rng = (seed) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const rand = rng(WAVE * 7919);
const sample = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);

const tasks = [];
const add = (kind, t) => tasks.push({ ...t, kind, wave: WAVE });

// ---- 1. conjunction across DIFFERENT documents of one matter ---------------
for (const [a, b] of sample(TERMS, PER_KIND * 2).reduce((acc, t, i, arr) =>
  (i % 2 ? acc : [...acc, [t, arr[i + 1]]]), []).slice(0, PER_KIND)) {
  if (!a || !b) continue;
  const A = new Map(mattersWith(a).map((x) => [x.matter, x]));
  const B = new Map(mattersWith(b).map((x) => [x.matter, x]));
  const both = [...A.keys()].filter((m) => B.has(m)).filter((m) => {
    // require the two terms in DIFFERENT files, or a single search answers it
    const fs2 = bodies(m);
    const fa = fs2.filter((f) => f.body.includes(a.toLowerCase())).map((f) => f.file);
    const fb = fs2.filter((f) => f.body.includes(b.toLowerCase())).map((f) => f.file);
    return fa.some((x) => !fb.includes(x)) || fb.some((x) => !fa.includes(x));
  }).sort();
  if (both.length < 2 || both.length > 40) continue;
  add("conjunction", {
    id: `w${WAVE}_conj_${a}_${b}`.replace(/[^a-z0-9_]+/gi, "_").toLowerCase(),
    prompt: `Find every matter in the firm's files that addresses BOTH "${a}" and "${b}". `
      + `The two topics are documented separately, so a matter only qualifies if both appear `
      + `somewhere in its file set. List every qualifying matter id.`,
    expected: both, computed: `matters containing "${a}" AND "${b}" in different documents`,
  });
}

// ---- 2. exclusion ----------------------------------------------------------
for (const [a, b] of sample(TERMS, PER_KIND * 2).reduce((acc, t, i, arr) =>
  (i % 2 ? acc : [...acc, [t, arr[i + 1]]]), []).slice(0, PER_KIND)) {
  if (!a || !b) continue;
  const A = mattersWith(a).map((x) => x.matter);
  const B = new Set(mattersWith(b).map((x) => x.matter));
  const only = A.filter((m) => !B.has(m)).sort();
  if (only.length < 2 || only.length > 40) continue;
  add("exclusion", {
    id: `w${WAVE}_excl_${a}_${b}`.replace(/[^a-z0-9_]+/gi, "_").toLowerCase(),
    prompt: `List every matter that addresses "${a}" but contains NO reference anywhere to `
      + `"${b}". A matter that mentions "${b}" even once does not qualify.`,
    expected: only, computed: `matters with "${a}" minus matters with "${b}"`,
  });
}

// ---- 3. client roll-up -----------------------------------------------------
for (const term of sample(TERMS, PER_KIND)) {
  const hits = mattersWith(term);
  if (hits.length < 4) continue;
  const byClient = {};
  for (const h of hits) byClient[clientOf(h.matter)] = (byClient[clientOf(h.matter)] ?? 0) + 1;
  const ranked = Object.entries(byClient).sort((x, y) => y[1] - x[1]);
  if (ranked.length < 2 || ranked[0][1] === ranked[1][1]) continue;   // no tie-breaks
  add("client_roll", {
    id: `w${WAVE}_client_${term}`.replace(/[^a-z0-9_]+/gi, "_").toLowerCase(),
    prompt: `Across the firm's files, which CLIENT has the most matters addressing "${term}"? `
      + `Answer with the four-digit client number and list the qualifying matter ids for it.`,
    expected: hits.filter((h) => clientOf(h.matter) === ranked[0][0]).map((h) => h.matter).sort(),
    answer_client: ranked[0][0],
    computed: `client with most matters containing "${term}" (${ranked[0][1]} vs runner-up ${ranked[1][1]})`,
  });
}

// ---- 4. structural (file system shape, not document content) ---------------
for (const [f1, f2] of sample(FOLDERS, PER_KIND * 2).reduce((acc, t, i, arr) =>
  (i % 2 ? acc : [...acc, [t, arr[i + 1]]]), []).slice(0, PER_KIND)) {
  if (!f1 || !f2) continue;
  const out = [];
  for (const m of matters.keys()) {
    const set = folderByMatter.get(m);
    if (!set) continue;
    if (set.has(f1) && !set.has(f2)) out.push(m);
  }
  if (out.length < 2 || out.length > 40) continue;
  add("structural", {
    id: `w${WAVE}_struct_${f1}_${f2}`.replace(/[^a-z0-9_]+/gi, "_").toLowerCase(),
    prompt: `Which matters contain ${f1} material but no ${f2} material at all? List the matter ids.`,
    expected: out.sort(), computed: `filename evidence of ${f1} without ${f2}`,
  });
}

// ---- 5. superlative --------------------------------------------------------
for (const term of sample(TERMS, PER_KIND)) {
  const hits = mattersWith(term).sort((a, b) => b.files - a.files);
  if (hits.length < 3 || hits[0].files === hits[1].files) continue;   // no ties
  add("superlative", {
    id: `w${WAVE}_top_${term}`.replace(/[^a-z0-9_]+/gi, "_").toLowerCase(),
    prompt: `Which single matter contains the most documents referencing "${term}"? `
      + `Answer with that matter id.`,
    expected: [hits[0].matter],
    computed: `most files containing "${term}" (${hits[0].files} vs runner-up ${hits[1].files})`,
  });
}

for (const t of tasks) {
  t.answer_size = t.expected.length;
  t.difficulty = t.answer_size >= 15 ? "high" : t.answer_size >= 6 ? "medium" : "low";
}

const byKind = tasks.reduce((a, t) => { a[t.kind] = (a[t.kind] ?? 0) + 1; return a; }, {});
mkdirSync(join(ROOT, "world", "port", "waves"), { recursive: true });
const out = join(ROOT, "world", "port", "waves", `wave-${WAVE}.json`);
writeFileSync(out, JSON.stringify({
  wave: WAVE, corpus: "world/corpus/ch", tasks: tasks.length, byKind,
  note: "Ground truth COMPUTED from the corpus, not authored. Every `expected` is the result of "
    + "a scan recorded in `computed`, so the key cannot drift from the documents.",
  taskList: tasks,
}, null, 1));

console.log(`\nwave ${WAVE}: ${tasks.length} tasks`);
for (const [k, n] of Object.entries(byKind)) console.log(`  ${k.padEnd(12)} ${n}`);
const d = tasks.reduce((a, t) => { a[t.difficulty] = (a[t.difficulty] ?? 0) + 1; return a; }, {});
console.log(`  answer-set size: ${JSON.stringify(d)} (high = 15+ matters to enumerate)`);
console.log(`-> ${out}`);
