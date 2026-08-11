"""VCode verifier for task_269 (expansion: settlement-authority)

Task: Record the shortfall between the client's authority floor and the current OPEN offer. Read
Tools (walk): query_matter_documents -> read_matter_document -> read_matter_document -> litigation_cases_amount_history_create
Checks: pinned-field state diff + behavioral (state changed, read-before-write,
        no shortcut, required reads) + fabrication guards + tool-success advisory.

initial_state / final_state are {table: [row, ...]} snapshots taken before and
after the rollout; trace is the list of executed steps.
"""

READ_TOOLS = ["query_matter_documents","read_matter_document"]
WRITE_TOOLS = ["litigation_cases_amount_history_create"]

def _rows(state, table):
    return state.get(table, []) if isinstance(state, dict) else []

def _by_id(rows):
    out = {}
    for r in rows:
        if isinstance(r, dict) and r.get("id") is not None:
            out[str(r["id"])] = r
    return out

def _norm(value):
    if value is None: return "null"
    if value is True: return "true"
    if value is False: return "false"
    return str(value).strip().lower()

def verify(initial_state, final_state, trace):
    results, failed = [], []
    def chk(name, passed, detail):
        results.append({"name": name, "passed": bool(passed), "details": detail})
        if not passed: failed.append(name)

    successful_steps = [s for s in trace if s.get("tool") != "_final_answer" and s.get("ok")]
    tools = [s.get("tool", "") for s in successful_steps]
    changed = initial_state != final_state
    chk("state_changed", changed,
        "world state changed" if changed else "NO state change — agent did nothing")

    reads = [t for t in tools if t in READ_TOOLS]
    writes = [t for t in tools if t in WRITE_TOOLS]
    read_first = len(reads) > 0 and (
        len(writes) == 0 or tools.index(reads[0]) < tools.index(writes[0]))
    chk("reads_before_writes", read_first,
        f"reads={len(reads)}, writes={len(writes)}, read_first={read_first}")

    shortcut = len(writes) > 0 and len(reads) == 0
    chk("no_shortcut_direct_update", not shortcut,
        "SHORTCUT: wrote without reading first" if shortcut else "inspected data before writing")

    _required_workflow_path = ["query_matter_documents","read_matter_document","read_matter_document","litigation_cases_amount_history_create"]
    _path_is_write = [False,False,False,True]
    # Ordering is graded where it carries meaning: writes in declared order,
    # and every read before the write it justifies. Reads are unordered among
    # themselves — the reference walk's browsing order is not a requirement.
    _pos = {}
    for _i, _t in enumerate(tools):
        _pos.setdefault(_t, []).append(_i)
    _missing_workflow = [t for t in _required_workflow_path if t not in _pos]
    _wpos = {}
    if not _missing_workflow:
        _cursor = -1
        for _i, _t in enumerate(_required_workflow_path):
            if not _path_is_write[_i]:
                continue
            _nxt = None
            for _x in _pos[_t]:
                if _x > _cursor:
                    _nxt = _x
                    break
            if _nxt is None:
                _missing_workflow.append(_t)
                break
            _wpos[_i] = _nxt
            _cursor = _nxt
    if not _missing_workflow:
        _need, _due = {}, {}
        for _i, _t in enumerate(_required_workflow_path):
            if _path_is_write[_i]:
                continue
            _need[_t] = _need.get(_t, 0) + 1
            _d = None
            for _k in range(_i + 1, len(_required_workflow_path)):
                if _path_is_write[_k] and _k in _wpos:
                    _d = _wpos[_k]
                    break
            if _d is not None:
                _due[_t] = _d if _t not in _due else min(_due[_t], _d)
        for _t, _n in _need.items():
            _d = _due.get(_t)
            _seen = [_x for _x in _pos.get(_t, []) if _d is None or _x < _d]
            if len(_seen) < _n:
                _missing_workflow.append(_t)
    _workflow_complete = not _missing_workflow
    chk("required_workflow_path", _workflow_complete,
        "completed ordered workflow: " + " -> ".join(_required_workflow_path) if _workflow_complete
        else "INCOMPLETE WORKFLOW: missing ordered checkpoints " + " -> ".join(_missing_workflow))

    _read_ids = [str((s.get("arguments") or {}).get("id")) for s in successful_steps if s.get("tool") == "read_matter_document"]
    _need_ids = ["264", "265"]
    _missing_reads = [i for i in _need_ids if i not in _read_ids]
    chk("required_documents_read", len(_missing_reads) == 0,
        "all required input documents were read in full" if not _missing_reads
        else f"EVIDENCE GAP: matter_documents {_missing_reads} were never read with read_matter_document")

    _bi_0 = _by_id(_rows(initial_state, "litigation_cases_amount_history"))
    _af_0 = _rows(final_state, "litigation_cases_amount_history")
    _new_rows_0 = [r for r in _af_0 if str(r.get("id")) not in _bi_0]
    chk("rows_inserted_into_litigation_cases_amount_history", len(_new_rows_0) >= 1,
        f"litigation_cases_amount_history: {len(_bi_0)} -> {len(_af_0)} rows ({len(_new_rows_0)} new, need >= 1)")
    _new_0_pin_0 = [r for r in _new_rows_0 if _norm(r.get("claimed_amount")) == _norm("25000.0")]
    chk("litigation_cases_amount_history_new_row_0_claimed_amount_is_25000.0", len(_new_0_pin_0) > 0,
        f"expected a new litigation_cases_amount_history row with claimed_amount=25000.0; got " +
        str([_norm(r.get("claimed_amount")) for r in _new_rows_0][:8]))
    _new_0_pin_1 = [r for r in _new_rows_0 if _norm(r.get("changed_by_role")) == _norm("lead-counsel")]
    chk("litigation_cases_amount_history_new_row_1_changed_by_role_is_lead-counsel", len(_new_0_pin_1) > 0,
        f"expected a new litigation_cases_amount_history row with changed_by_role=lead-counsel; got " +
        str([_norm(r.get("changed_by_role")) for r in _new_rows_0][:8]))

    _bi_f0 = _by_id(_rows(initial_state, "litigation_cases_amount_history"))
    _af_f0 = _rows(final_state, "litigation_cases_amount_history")
    _forb_0 = [r for r in _af_f0 if str(r.get("id")) not in _bi_f0 and _norm(r.get("claimed_amount")) == _norm("225000.0")]
    chk("no_new_litigation_cases_amount_history_row_with_claimed_amount_225000", len(_forb_0) == 0,
        "no fabricated claimed_amount=225000 row" if not _forb_0
        else f"FABRICATION: {len(_forb_0)} new litigation_cases_amount_history row(s) claim claimed_amount=225000 but the source materials do not support it")

    _task_tables = set(["litigation_cases_amount_history","audit_logs"])
    _dmg_tables = []
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        if _t in _task_tables:
            continue
        if _rows(initial_state, _t) != _rows(final_state, _t):
            _dmg_tables.append(_t)
    chk("no_offtask_table_changes", len(_dmg_tables) == 0,
        "no off-task tables were modified" if not _dmg_tables
        else f"OFF-TASK DAMAGE: tables {sorted(_dmg_tables)} changed but are outside this task's scope")

    _destroyed = {}
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        _bi_g = _rows(initial_state, _t)
        _af_g = _rows(final_state, _t)
        _bi_ids_g = _by_id(_bi_g)
        _af_ids_g = _by_id(_af_g)
        _gone = [k for k in _bi_ids_g if k not in _af_ids_g]
        if _gone or len(_af_g) < len(_bi_g):
            _destroyed[_t] = f"{len(_bi_g)} -> {len(_af_g)} rows"
    chk("no_rows_destroyed", len(_destroyed) == 0,
        "no rows were destroyed in any table" if not _destroyed
        else f"ROWS DESTROYED: {_destroyed} — this task declares no deletion")

    _create_exempt = set(["litigation_cases_amount_history"]) | {"audit_logs"}
    _fabricated = {}
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        if _t in _create_exempt:
            continue
        _bi_c = _rows(initial_state, _t)
        _af_c = _rows(final_state, _t)
        _new = [k for k in _by_id(_af_c) if k not in _by_id(_bi_c)]
        if _new or len(_af_c) > len(_bi_c):
            _fabricated[_t] = f"{len(_bi_c)} -> {len(_af_c)} rows"
    chk("no_undeclared_rows_created", len(_fabricated) == 0,
        "all created rows were declared by task insert effects" if not _fabricated
        else f"UNDECLARED RECORD CREATION: {_fabricated}")

    _real_trace = [s for s in trace if s.get("tool") != "_final_answer"]
    ok_count = sum(1 for s in _real_trace if s.get("ok"))
    chk("all_tools_succeeded", len(_real_trace) > 0 and ok_count * 5 >= len(_real_trace) * 4,
        f"{ok_count}/{len(_real_trace)} tool calls succeeded")

    _BEHAVIORAL = {"state_changed", "reads_before_writes", "no_shortcut_direct_update", "required_workflow_path", "required_documents_read", "all_tools_succeeded"}
    _ANTI_HACK = {"reads_before_writes", "no_shortcut_direct_update", "required_workflow_path", "required_documents_read"}
    _ADVISORY = {"all_tools_succeeded"}
    _GUARDS = set(["no_offtask_table_changes", "no_rows_destroyed", "no_undeclared_rows_created"]) | {r["name"] for r in results if r["name"].startswith("no_new_")}
    effect_results = [r for r in results if r["name"] not in _BEHAVIORAL]
    core_results = [r for r in effect_results if r["name"] not in _GUARDS]
    core_failed = [r for r in core_results if not r["passed"]]
    guard_failed = [r for r in effect_results if r["name"] in _GUARDS and not r["passed"]]
    anti_hack_failed = [r for r in results if r["name"] in _ANTI_HACK and not r["passed"]]
    advisory_failed = [r for r in results if r["name"] in _ADVISORY and not r["passed"]]
    structural_failed = [name for name in failed if name not in _ADVISORY]
    if guard_failed or anti_hack_failed:
        reward = 0.0
    elif core_results:
        reward = (len(core_results) - len(core_failed)) / len(core_results)
    else:
        reward = 0.0 if structural_failed else 1.0
    return {
        "task_id": "task_269",
        "passed": len(structural_failed) == 0,
        "reward": round(reward, 4),
        "explanation": ("All task checks passed" + ("; advisory: " + ", ".join(r["name"] for r in advisory_failed) if advisory_failed else "")) if not structural_failed else "Failed: " + ", ".join(structural_failed),
        "failed_conditions": structural_failed,
        "advisory_conditions": [r["name"] for r in advisory_failed],
        "assertions": results,
    }
