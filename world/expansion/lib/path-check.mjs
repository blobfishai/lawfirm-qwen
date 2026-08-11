/**
 * The `required_workflow_path` assertion, in one place.
 *
 * Single source of truth for both the assembler (which emits verifiers for new
 * packs) and the rewriter (which migrated the 232 already-shipped ones). They
 * drifted once — the assembler kept emitting the strict-subsequence rule after
 * the rewrite, so re-assembling any pack silently reverted the fix.
 *
 * The rule: every declared checkpoint must succeed, declared repeats require
 * that many successful calls, write checkpoints occur in declared relative
 * order, and every read occurs before the write it justifies. Reads are
 * unordered among themselves — the reference walk's browsing order is not a
 * legal or procedural requirement, and grading it fails agents that reached
 * identical evidence by a different route (see docs/AUDIT.md, Bug 5).
 */

/**
 * @param {string[]} walk        ordered checkpoint tool names
 * @param {(name:string)=>boolean} isWrite
 * @param {string} indent        leading whitespace for each emitted line
 * @returns {string} Python source for the assertion
 */
export function pathCheckPython(walk, isWrite, indent = "    ") {
  const names = JSON.stringify(walk);
  const flags = "[" + walk.map((w) => (isWrite(w) ? "True" : "False")).join(",") + "]";
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
