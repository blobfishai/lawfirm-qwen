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

    _path = ["matters_get","time_entries_create","bills_update"]
    _cur = 0
    for _t in tools:
        if _cur < len(_path) and _t == _path[_cur]:
            _cur += 1
    chk("required_workflow_path", _cur == len(_path),
        "completed: " + " -> ".join(_path) if _cur == len(_path)
        else "INCOMPLETE: missing " + " -> ".join(_path[_cur:]))

    _bi_0 = _ids(initial_state.get("pm_time_entries", []))
    _af_0 = final_state.get("pm_time_entries", [])
    _new_0 = [r for r in _af_0 if str(r.get("id")) not in _bi_0]
    chk("rows_inserted_into_pm_time_entries", len(_new_0) >= 1,
        f"pm_time_entries: {len(_bi_0)} -> {len(_af_0)} rows")
    _p0_0 = [r for r in _new_0 if _norm(r.get("utbms_task_code")) == _norm("L240") and _norm(r.get("quantity_hours")) == _norm("2.5") and _norm(r.get("total")) == _norm("1000.0")]
    chk("pm_time_entries_new_row_utbms_task_code_is_L240", len(_p0_0) > 0,
        f"expected one new pm_time_entries row matching every declared pin (including utbms_task_code=L240); saw " + str([_norm(r.get("utbms_task_code")) for r in _new_0][:6]))
    _p0_1 = [r for r in _new_0 if _norm(r.get("utbms_task_code")) == _norm("L240") and _norm(r.get("quantity_hours")) == _norm("2.5") and _norm(r.get("total")) == _norm("1000.0")]
    chk("pm_time_entries_new_row_quantity_hours_is_2.5", len(_p0_1) > 0,
        f"expected one new pm_time_entries row matching every declared pin (including quantity_hours=2.5); saw " + str([_norm(r.get("quantity_hours")) for r in _new_0][:6]))
    _p0_2 = [r for r in _new_0 if _norm(r.get("utbms_task_code")) == _norm("L240") and _norm(r.get("quantity_hours")) == _norm("2.5") and _norm(r.get("total")) == _norm("1000.0")]
    chk("pm_time_entries_new_row_total_is_1000.0", len(_p0_2) > 0,
        f"expected one new pm_time_entries row matching every declared pin (including total=1000.0); saw " + str([_norm(r.get("total")) for r in _new_0][:6]))

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
