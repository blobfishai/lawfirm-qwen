"""VCode verifier for task_v3_002 (v3 workflow: clio-time-and-bill)
Walk: matters_get -> time_entries_create -> bills_update
Grades v3 product tables (real-API-mirrored surfaces)."""

def _ids(rows):
    return {str(r.get("id")) for r in rows if isinstance(r, dict)}

def _norm(v):
    if v is None: return "null"
    if v is True: return "true"
    if v is False: return "false"
    s = str(v).strip().lower()
    try:
        return repr(float(s))  # numeric-affinity-proof: "20" == "20.0"
    except ValueError:
        return s

def verify(initial_state, final_state, trace):
    results, failed = [], []
    def chk(name, passed, detail):
        results.append({"name": name, "passed": bool(passed), "details": detail})
        if not passed: failed.append(name)

    steps = [s for s in trace if s.get("tool") != "_final_answer" and s.get("ok")]
    tools = [s.get("tool", "") for s in steps]
    chk("state_changed", initial_state != final_state,
        "world state changed" if initial_state != final_state else "NO state change")

    _required_workflow_path = ["matters_get","time_entries_create","bills_update"]
    _path_is_write = [False,True,True]
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

    _bi_0 = _ids(initial_state.get("pm_time_entries", []))
    _af_0 = final_state.get("pm_time_entries", [])
    _new_0 = [r for r in _af_0 if str(r.get("id")) not in _bi_0]
    chk("rows_inserted_into_pm_time_entries", len(_new_0) >= 1,
        f"pm_time_entries: {len(_bi_0)} -> {len(_af_0)} rows")
    _p0_0 = [r for r in _new_0 if _norm(r.get("utbms_task_code")) == _norm("L240")]
    chk("pm_time_entries_new_row_utbms_task_code_is_L240", len(_p0_0) > 0,
        f"expected new pm_time_entries row with utbms_task_code=L240; saw " + str([_norm(r.get("utbms_task_code")) for r in _new_0][:6]))
    _p0_1 = [r for r in _new_0 if _norm(r.get("quantity_hours")) == _norm("2.5")]
    chk("pm_time_entries_new_row_quantity_hours_is_2.5", len(_p0_1) > 0,
        f"expected new pm_time_entries row with quantity_hours=2.5; saw " + str([_norm(r.get("quantity_hours")) for r in _new_0][:6]))
    _p0_2 = [r for r in _new_0 if _norm(r.get("total")) == _norm("1000.0")]
    chk("pm_time_entries_new_row_total_is_1000.0", len(_p0_2) > 0,
        f"expected new pm_time_entries row with total=1000.0; saw " + str([_norm(r.get("total")) for r in _new_0][:6]))

    _row_u0 = next((r for r in final_state.get("pm_bills", []) if str(r.get("id")) == "3"), None)
    chk("pm_bills_3_state_is_awaiting_approval",
        _row_u0 is not None and _norm(_row_u0.get("state")) == _norm("awaiting_approval"),
        f"pm_bills[3].state = " + (_norm(_row_u0.get("state")) if _row_u0 else "(row missing)") + ", expected awaiting_approval")

    _destroyed = []
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        if len(final_state.get(_t, [])) < len(initial_state.get(_t, [])):
            _destroyed.append(_t)
    chk("no_rows_destroyed", not _destroyed,
        "no rows destroyed" if not _destroyed else f"ROWS DESTROYED in {_destroyed}")

    _ANTI = {"required_workflow_path"}
    core = [r for r in results if r["name"] not in _ANTI | {"state_changed", "no_rows_destroyed"}]
    core_failed = [r for r in core if not r["passed"]]
    anti_failed = [r for r in results if r["name"] in _ANTI and not r["passed"]]
    guard_failed = [r for r in results if r["name"] == "no_rows_destroyed" and not r["passed"]]
    if anti_failed or guard_failed:
        reward = 0.0
    elif core:
        reward = (len(core) - len(core_failed)) / len(core)
    else:
        reward = 0.0 if failed else 1.0
    return {"task_id": "task_v3_002", "passed": len(failed) == 0, "reward": round(reward, 4),
            "explanation": "All checks passed" if not failed else "Failed: " + ", ".join(failed),
            "failed_conditions": failed, "advisory_conditions": [], "assertions": results}
