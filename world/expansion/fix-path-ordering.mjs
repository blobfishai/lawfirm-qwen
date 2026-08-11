#!/usr/bin/env node
/**
 * required_workflow_path — stop grading the reference solution's browsing order.
 *
 * THE DEFECT. The check matched the declared checkpoint list as a strictly
 * ordered subsequence over successful calls. That enforces ordering among the
 * *read* checkpoints, which carries no legal or procedural meaning: a path of
 *
 *     legal_matters_list -> legal_matters_get -> legal_matters_evidence_create
 *
 * failed an agent that already had the matter id, fetched it directly, then
 * listed for context — identical evidence, identical write, zero verdict.
 * Eight archived episodes fail on exactly that, and a ninth
 * (task_v3_006-t3) failed only because seeded rate-limiting pushed a retry
 * after the next read.
 *
 * THE RULE THIS INSTALLS. Ordering is enforced where it means something:
 *   - every declared checkpoint must still succeed, with declared repeats
 *     still requiring that many successful calls;
 *   - write checkpoints must occur in declared relative order;
 *   - every read checkpoint must occur before the first write that follows it
 *     in the declared path — evidence before the act it justifies;
 *   - reads are unordered among themselves.
 *
 * `reads_before_writes` and `no_shortcut_direct_update` are untouched and still
 * carry the read-then-write discipline independently.
 *
 * Simulated offline against all 296 archived failures before landing: exactly
 * the 9 read-ordering artifacts satisfy the new rule; 146 path failures stand,
 * including task_086-t3, whose delegation ran *after* its write.
 *
 * Run: node world/expansion/fix-path-ordering.mjs [--world world/blobfish/world-v5.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const wArg = argv.includes("--world") ? argv[argv.indexOf("--world") + 1] : "world/blobfish/world-v5.json";
const WORLD = isAbsolute(wArg) ? wArg : join(ROOT, wArg);
const raw = JSON.parse(readFileSync(WORLD, "utf8"));
const world = raw.world ?? raw;

const TYPE = Object.fromEntries(world.tools.map((t) => [t.name, t.type]));
// v3 product tools live in the contract files, not world.tools
const WRITEISH = /(_create|_update|_submit|_delete|_checkin|_checkout|_upload|_post|_send|_file)$/;
const isWrite = (name) => TYPE[name] ? TYPE[name] === "write" : WRITEISH.test(name);

/** The replacement block. `tools` is the verifier's successful-call tool list. */
function block(pathList, indent = "    ") {
  const names = JSON.stringify(pathList);
  const flags = JSON.stringify(pathList.map(isWrite).map((b) => (b ? "True" : "False")))
    .replace(/"/g, "");
  const L = (s) => indent + s;
  return [
    L(`_required_workflow_path = ${names}`),
    L(`_path_is_write = ${flags}`),
    L(`# Ordering is graded where it carries meaning: writes in declared order,`),
    L(`# and every read before the write it justifies. Reads are unordered among`),
    L(`# themselves — the reference walk's browsing order is not a requirement.`),
    L(`_pos = {}`),
    L(`for _i, _t in enumerate(tools):`),
    L(`    _pos.setdefault(_t, []).append(_i)`),
    L(`_missing_workflow = [t for t in _required_workflow_path if t not in _pos]`),
    L(`_wpos = {}`),
    L(`if not _missing_workflow:`),
    L(`    _cursor = -1`),
    L(`    for _i, _t in enumerate(_required_workflow_path):`),
    L(`        if not _path_is_write[_i]:`),
    L(`            continue`),
    L(`        _nxt = None`),
    L(`        for _x in _pos[_t]:`),
    L(`            if _x > _cursor:`),
    L(`                _nxt = _x`),
    L(`                break`),
    L(`        if _nxt is None:`),
    L(`            _missing_workflow.append(_t)`),
    L(`            break`),
    L(`        _wpos[_i] = _nxt`),
    L(`        _cursor = _nxt`),
    L(`if not _missing_workflow:`),
    L(`    _need, _due = {}, {}`),
    L(`    for _i, _t in enumerate(_required_workflow_path):`),
    L(`        if _path_is_write[_i]:`),
    L(`            continue`),
    L(`        _need[_t] = _need.get(_t, 0) + 1`),
    L(`        _d = None`),
    L(`        for _k in range(_i + 1, len(_required_workflow_path)):`),
    L(`            if _path_is_write[_k] and _k in _wpos:`),
    L(`                _d = _wpos[_k]`),
    L(`                break`),
    L(`        if _d is not None:`),
    L(`            _due[_t] = _d if _t not in _due else min(_due[_t], _d)`),
    L(`    for _t, _n in _need.items():`),
    L(`        _d = _due.get(_t)`),
    L(`        _seen = [_x for _x in _pos.get(_t, []) if _d is None or _x < _d]`),
    L(`        if len(_seen) < _n:`),
    L(`            _missing_workflow.append(_t)`),
    L(`_workflow_complete = not _missing_workflow`),
    L(`chk("required_workflow_path", _workflow_complete,`),
    L(`    "completed ordered workflow: " + " -> ".join(_required_workflow_path) if _workflow_complete`),
    L(`    else "INCOMPLETE WORKFLOW: missing ordered checkpoints " + " -> ".join(_missing_workflow))`),
  ].join("\n");
}

const parseList = (s) =>
  s.split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);

// Anchored to each statement's real terminator — a lookahead for "next line
// that starts with a word" stops inside the chk(...) call at its `else` branch
// and orphans that line.
// Shape A: _required_workflow_path / _path_cursor
const RE_A = /([ \t]*)_required_workflow_path = \[([^\]]*)\][\s\S]*?\.join\(_missing_workflow\)\)\n/;
// Shape B: _path / _cur (v3 verifiers)
const RE_B = /([ \t]*)_path = \[([^\]]*)\][\s\S]*?\.join\(_path\[_cur:\]\)\)\n/;

let a = 0, b = 0, skipped = 0;
for (const v of world.verifiers) {
  const code = v.vcode ?? "";
  if (!code.includes('chk("required_workflow_path"')) { skipped++; continue; }
  let m = RE_A.exec(code);
  if (m) {
    v.vcode = code.slice(0, m.index) + block(parseList(m[2]), m[1]) + "\n" +
      code.slice(m.index + m[0].length);
    a++;
    continue;
  }
  m = RE_B.exec(code);
  if (m) {
    v.vcode = code.slice(0, m.index) + block(parseList(m[2]), m[1]) + "\n" +
      code.slice(m.index + m[0].length);
    b++;
    continue;
  }
  throw new Error(`verifier ${v.task_id}: has a path check but neither block shape matched`);
}

writeFileSync(WORLD, JSON.stringify(raw, null, 1));
console.log(`path rule rewritten: ${a} main-shape + ${b} v3-shape verifiers ` +
  `(${skipped} have no path check) -> ${wArg}`);
