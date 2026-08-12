#!/usr/bin/env node
/** Deterministically compress every raw episode JSON in one directory. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { compressJsonRecord, listJsonRecordFiles } from "../sim/lib/episode-record.mjs";

const argv = process.argv.slice(2);
const opt = (name) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : null;
const directory = resolve(opt("--directory") ?? "");
if (!opt("--directory") || !existsSync(directory)) {
  console.error("--directory must name an existing episode directory");
  process.exit(1);
}

let rawBytes = 0;
let storedBytes = 0;
let compressed = 0;
let existing = 0;
for (const path of listJsonRecordFiles(directory)) {
  if (path.endsWith(".json.gz")) {
    storedBytes += readFileSync(path).length;
    existing++;
    continue;
  }
  rawBytes += readFileSync(path).length;
  const gzipPath = compressJsonRecord(path);
  storedBytes += readFileSync(gzipPath).length;
  compressed++;
}
const leftovers = readdirSync(directory).filter((name) => name.endsWith(".json"));
if (leftovers.length) throw new Error(`raw JSON remains: ${leftovers.join(", ")}`);
console.log(JSON.stringify({ directory, compressed, existing, rawBytes, storedBytes }));
