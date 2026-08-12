#!/usr/bin/env node
/** Pure gate for deterministic episode compression and resume discovery. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compressJsonRecord, findJsonRecord, listJsonRecordFiles, readJsonRecordFile,
} from "../sim/lib/episode-record.mjs";

const root = mkdtempSync(join(tmpdir(), "episode-compression-"));
try {
  const record = { taskId: "fixture", worldVersion: 19, passed: true, steps: [{ tool: "x" }] };
  const raw = join(root, "fixture-t1.json");
  const bytes = JSON.stringify(record, null, 1) + "\n";
  writeFileSync(raw, bytes);
  const gzip = compressJsonRecord(raw);
  const first = readFileSync(gzip);
  if (JSON.stringify(readJsonRecordFile(gzip)) !== JSON.stringify(record)) throw new Error("gzip round-trip failed");
  if (findJsonRecord(raw) !== gzip) throw new Error("resume did not discover gzip record");
  if (listJsonRecordFiles(root).length !== 1) throw new Error("logical listing count wrong");

  rmSync(gzip);
  writeFileSync(raw, bytes);
  compressJsonRecord(raw);
  const second = readFileSync(gzip);
  if (!first.equals(second)) throw new Error("gzip output is not byte-identical");

  writeFileSync(raw, bytes);
  try {
    listJsonRecordFiles(root);
    throw new Error("raw/gzip collision was accepted");
  } catch (error) {
    if (!String(error).includes("duplicate raw/compressed")) throw error;
  }
  console.log("episode-compression gate: deterministic gzip, round-trip, resume, and collision rejection clean");
} finally {
  rmSync(root, { recursive: true, force: true });
}
