/** Shared helpers for port adapters. */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Walk a tree, yielding files that match. Never descends into a corpus dir. */
export function walkFiles(dir, pred, skip = new Set(["documents", "dms", ".git", "node_modules"])) {
  const out = [];
  const rec = (d) => {
    let es; try { es = readdirSync(d); } catch { return; }
    for (const e of es) {
      if (skip.has(e)) continue;
      const p = join(d, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) rec(p);
      else if (pred(p)) out.push(p);
    }
  };
  rec(dir);
  return out;
}

/** TSV with quoted fields containing tabs/newlines — the naive split loses rows. */
export function parseTsv(text) {
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === "\t") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length >= head.length - 1)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/** Deterministic spread across a list rather than the first k. */
export function spread(rows, k) {
  if (!k || rows.length <= k) return rows;
  const step = rows.length / k;
  return Array.from({ length: k }, (_, i) => rows[Math.floor(i * step)]);
}

export const gitCommit = (dir) => {
  try {
    const head = readFileSync(join(dir, ".git", "HEAD"), "utf8").trim();
    if (head.startsWith("ref: ")) {
      return readFileSync(join(dir, ".git", head.slice(5)), "utf8").trim().slice(0, 9);
    }
    return head.slice(0, 9);
  } catch { return null; }
};

export const has = (p) => existsSync(p);
