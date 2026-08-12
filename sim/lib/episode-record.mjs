/** Deterministic JSON/JSON.GZ episode-record helpers. */
import {
  existsSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { join } from "node:path";

export function readJsonRecordFile(path) {
  const bytes = readFileSync(path);
  const json = path.endsWith(".json.gz") ? gunzipSync(bytes) : bytes;
  return JSON.parse(json.toString("utf8"));
}

/** Resolve a logical .json record, accepting either raw JSON or JSON.GZ. */
export function findJsonRecord(jsonPath) {
  if (!jsonPath.endsWith(".json")) {
    throw new Error(`logical episode path must end in .json: ${jsonPath}`);
  }
  const gzipPath = `${jsonPath}.gz`;
  const raw = existsSync(jsonPath);
  const gzip = existsSync(gzipPath);
  if (raw && gzip) {
    throw new Error(`duplicate raw/compressed episode record: ${jsonPath}`);
  }
  return raw ? jsonPath : gzip ? gzipPath : null;
}

/** List one physical file per logical record and reject raw/gzip collisions. */
export function listJsonRecordFiles(directory) {
  if (!existsSync(directory)) return [];
  const names = readdirSync(directory)
    .filter((name) => name.endsWith(".json") || name.endsWith(".json.gz"))
    .sort();
  const logical = new Map();
  for (const name of names) {
    const key = name.endsWith(".json.gz") ? name.slice(0, -3) : name;
    if (logical.has(key)) {
      throw new Error(`duplicate raw/compressed episode record: ${join(directory, key)}`);
    }
    logical.set(key, join(directory, name));
  }
  return [...logical.values()];
}

/** Replace a complete JSON record with deterministic gzip bytes. */
export function compressJsonRecord(jsonPath) {
  const bytes = readFileSync(jsonPath);
  JSON.parse(bytes.toString("utf8")); // never archive a partial child write
  const gzipPath = `${jsonPath}.gz`;
  const compressed = gzipSync(bytes, { level: 9, mtime: 0 });
  writeFileSync(gzipPath, compressed);
  rmSync(jsonPath);
  return gzipPath;
}

export function removeJsonRecord(jsonPath) {
  rmSync(jsonPath, { force: true });
  rmSync(`${jsonPath}.gz`, { force: true });
}
