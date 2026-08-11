#!/usr/bin/env node
/**
 * Mine discriminating terms from the corpus itself.
 *
 * The wave generator was limited by a hand-written list of 24 legal terms, so
 * six waves produced 181 records for only 106 distinct questions — a
 * superlative on the same term is the same question every wave. The vocabulary
 * was the bottleneck, not the generators.
 *
 * A term is useful for task generation only if it DISCRIMINATES: present in
 * enough matters to make a real answer set, absent from enough to make the
 * question non-trivial. A term in 260 of 266 matters produces "list almost
 * everything"; a term in one produces a lookup. So we keep terms whose matter
 * frequency lands in a band, and we take them from the corpus rather than from
 * my priors — which also removes the risk of picking terms I already know the
 * answers for.
 *
 * Candidates are multi-word phrases, because single words are ambiguous across
 * practice areas ("security" is a lien and a data control) and legal drafting
 * is phrase-heavy.
 *
 * Run: node world/port/mine-corpus-terms.mjs [--min-matters 4] [--max-frac 0.4]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEXT = join(ROOT, "world", "corpus", "ch", "text");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const MIN_MATTERS = Number(opt("--min-matters", "4"));
const MAX_FRAC = Number(opt("--max-frac", "0.4"));
const TOP = Number(opt("--top", "400"));

if (!existsSync(TEXT)) { console.error("corpus text missing"); process.exit(1); }

const STOP = new Set(("the of and to in a for or by is are be as an with that this shall may not "
  + "any all such other under upon which its it from at on if no nor than then there these those "
  + "will would has have had been was were do does did each per was").split(" "));

// Phrases legal drafting actually uses: 2-3 word noun phrases in lower case.
const PHRASE = /\b([a-z]{3,}(?:[ -][a-z]{3,}){1,2})\b/g;

const matterDirs = readdirSync(TEXT);
console.log(`scanning ${matterDirs.length} matters…`);

const matterCount = new Map();   // phrase -> Set(matter)
let scanned = 0;
for (const m of matterDirs) {
  const dir = join(TEXT, m);
  let files; try { files = readdirSync(dir); } catch { continue; }
  const local = new Set();
  for (const f of files) {
    let t; try { t = readFileSync(join(dir, f), "utf8").toLowerCase(); } catch { continue; }
    // sample the head of very long documents; operative language clusters early
    const body = t.length > 120000 ? t.slice(0, 120000) : t;
    for (const mt of body.matchAll(PHRASE)) {
      const p = mt[1].replace(/\s+/g, " ").trim();
      const words = p.split(/[ -]/);
      if (words.some((w) => STOP.has(w))) continue;
      local.add(p);
    }
  }
  for (const p of local) {
    if (!matterCount.has(p)) matterCount.set(p, 0);
    matterCount.set(p, matterCount.get(p) + 1);
  }
  if (++scanned % 50 === 0) console.log(`  ${scanned}/${matterDirs.length}`);
}

const N = matterDirs.length;
const maxMatters = Math.floor(N * MAX_FRAC);
/**
 * SALIENCE. Frequency alone produced "should you wish", "became aware",
 * "communications between" — phrases that discriminate perfectly and that no
 * lawyer would ever search for. A generated task is only realistic if the term
 * is one the firm would actually ask about, so a candidate must contain a
 * legal-domain anchor. This is the one place domain knowledge belongs: naming
 * what counts as a legal concept, not naming which concepts are in the corpus.
 */
const ANCHOR = new RegExp("(" + [
  "indemnif", "covenant", "lien", "escrow", "warrant", "terminat", "breach",
  "arbitrat", "jurisdict", "confidential", "non-compete", "noncompete",
  "assign", "sublicens", "licens", "royalt", "severance", "vesting", "equity",
  "acceler", "earn-?out", "purchase price", "closing condition", "material adverse",
  "due diligence", "representation", "disclosure schedul", "governing law",
  "force majeure", "liquidated damag", "limitation of liability", "insur",
  "regulator", "antitrust", "second request", "hart-?scott", "sanction", "ofac",
  "fcpa", "privileg", "work product", "subpoena", "deposition", "settlement",
  "injunct", "damages", "fiduciar", "board approval", "shareholder", "stockholder",
  "tag-?along", "drag-?along", "right of first", "most favored", "exclusiv",
  "change of control", "restrictive covenant", "solicit", "data protection",
  "personal data", "intellectual property", "patent", "trademark", "trade secret",
  "collateral", "guarant", "default", "maturity", "amortiz", "prepay",
  "management fee", "carried interest", "capital call", "clawback", "waiver",
].join("|") + ")", "i");

const kept = [...matterCount.entries()]
  .filter(([, c]) => c >= MIN_MATTERS && c <= maxMatters)
  .filter(([term]) => ANCHOR.test(term))
  // prefer terms near the middle of the band: biggest answer sets that are still selective
  .sort((a, b) => Math.abs(b[1] - maxMatters / 2) - Math.abs(a[1] - maxMatters / 2))
  .reverse()
  .slice(0, TOP)
  .map(([term, matters]) => ({ term, matters }));

writeFileSync(join(ROOT, "world", "port", "corpus-terms.json"), JSON.stringify({
  scanned_matters: N, min_matters: MIN_MATTERS, max_matters: maxMatters,
  candidates_considered: matterCount.size, kept: kept.length,
  note: "Terms are kept only when they discriminate: present in >= min_matters and <= max_frac of "
    + "matters. Mined from the corpus, so the generator is not limited to terms the author "
    + "already had in mind — and cannot be accused of choosing terms whose answers were known.",
  terms: kept,
}, null, 1));

console.log(`\ncandidate phrases: ${matterCount.size.toLocaleString()}`);
console.log(`kept (in ${MIN_MATTERS}..${maxMatters} matters): ${kept.length}`);
console.log("sample:");
for (const t of kept.slice(0, 12)) console.log(`  ${String(t.matters).padStart(3)} matters  ${t.term}`);
console.log("-> world/port/corpus-terms.json");
