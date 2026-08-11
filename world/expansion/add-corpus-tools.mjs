#!/usr/bin/env node
/**
 * Register the corpus tools — the document-management surface over C&H.
 *
 * The world's own documents live inline in the world JSON. That cannot hold
 * 108M tokens, so the C&H corpus lives on disk (world/corpus/ch/, built by
 * build-corpus-index.py) and these four tools read it. They are the DMS an
 * agent actually gets at a firm: browse matters, list a matter's files, search
 * across everything, open one document.
 *
 * Every read tool pages and reports `count` (total matches), `returned`,
 * `has_more` and `next_offset`. That is not decoration here. Harvey's finding
 * on this corpus is that agents fail "to know when to keep looking" — they
 * satisfy about half the criteria and regress to 0% all-pass as the number of
 * things needing enumeration grows. `has_more` is the world telling the agent,
 * in plain terms, that it has not seen everything. Whether the agent acts on it
 * is the measurement.
 *
 * Run: node world/expansion/add-corpus-tools.mjs [--in <world>] [--out <world>]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const abs = (p) => (isAbsolute(p) ? p : join(ROOT, p));
const IN = abs(opt("--in", "world/blobfish/world-v13.json"));
const OUT = abs(opt("--out", "world/blobfish/world-v14.json"));

if (!existsSync(join(ROOT, "world/corpus/ch/index.sqlite"))) {
  console.error("corpus index missing — run world/corpus/build-corpus-index.py first");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(IN, "utf8"));
const world = raw.world ?? raw;

const TOOLS = [
  {
    name: "corpus_matters_list",
    type: "read",
    description:
      "Browse the firm's matters in the document management system. Returns matter ids, the "
      + "client they belong to, and how many files each holds. Paged: check has_more.",
    parameters: { client_id: "TEXT", limit: "INTEGER", offset: "INTEGER" },
  },
  {
    name: "corpus_files_list",
    type: "read",
    description:
      "List the files filed under a matter, optionally within one folder or of one file type. "
      + "Returns paths you can pass to corpus_read. Paged: check has_more.",
    parameters: { matter_id: "TEXT", folder: "TEXT", ext: "TEXT", limit: "INTEGER", offset: "INTEGER" },
  },
  {
    name: "corpus_search",
    type: "read",
    description:
      "Full-text search across every document in the firm's DMS. Returns matching files with a "
      + "snippet around the first hit, the total number of matching FILES, and has_more. A "
      + "result set that reports has_more:true means you have NOT seen every matching document.",
    parameters: { query: "TEXT", matter_id: "TEXT", client_id: "TEXT", limit: "INTEGER", offset: "INTEGER" },
  },
  {
    name: "corpus_read",
    type: "read",
    description:
      "Read one document from the DMS by its path. Long documents are paged by character "
      + "offset; the response reports chars (total), returned, has_more and next_offset.",
    parameters: { path: "TEXT", offset: "INTEGER", limit: "INTEGER" },
  },
];

const existing = new Set(world.tools.map((t) => t.name));
let added = 0;
for (const t of TOOLS) {
  if (existing.has(t.name)) continue;
  world.tools.push({
    ...t,
    purpose: "Read the firm document corpus.",
    target_tables: ["corpus_files"],
    source: `def ${t.name}(**kwargs):\n    '''${t.description}'''\n`,
    validated: true,
    source_basis: "Calderwood & Harkness corpus (harveyai/harvey-labs tasks/firm-knowledge), "
      + "filesystem-backed via world/corpus/ch/index.sqlite",
  });
  added++;
}

// A read-only index table so verifiers and snapshots can see the corpus exists
// without the world document carrying 108M tokens of bodies.
if (!world.tables.some((t) => t.name === "corpus_files")) {
  world.tables.push({
    name: "corpus_files",
    description: "Index of the firm DMS corpus. Bodies live on disk under world/corpus/ch/; "
      + "this table is the catalogue, not the content.",
    columns: [
      { name: "id", type: "INTEGER", pk: true },
      { name: "matter_id", type: "TEXT" },
      { name: "client_id", type: "TEXT" },
      { name: "folder", type: "TEXT" },
      { name: "filename", type: "TEXT" },
      { name: "ext", type: "TEXT" },
      { name: "chars", type: "INTEGER" },
    ],
    sample_rows: [],
    external_store: "world/corpus/ch/index.sqlite",
  });
}

writeFileSync(OUT, JSON.stringify(raw, null, 1));
console.log(`corpus tools: +${added} tools, corpus_files table -> ${OUT}`);
console.log(`world tools: ${world.tools.length}, tables: ${world.tables.length}`);
