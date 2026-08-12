"""VCode verifier for task_v3_001 (v3 workflow: clio-intake-conflicts-open)
Walk: contacts_search -> contacts_create -> matters_create -> tasks_create
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

    _path = ["contacts_search","contacts_create","matters_create","tasks_create"]
    _cur = 0
    for _t in tools:
        if _cur < len(_path) and _t == _path[_cur]:
            _cur += 1
    chk("required_workflow_path", _cur == len(_path),
        "completed: " + " -> ".join(_path) if _cur == len(_path)
        else "INCOMPLETE: missing " + " -> ".join(_path[_cur:]))

    _bi_0 = _ids(initial_state.get("pm_contacts", []))
    _af_0 = final_state.get("pm_contacts", [])
    _new_0 = [r for r in _af_0 if str(r.get("id")) not in _bi_0]
    chk("rows_inserted_into_pm_contacts", len(_new_0) >= 1,
        f"pm_contacts: {len(_bi_0)} -> {len(_af_0)} rows")
    _p0_0 = [r for r in _new_0 if _norm(r.get("name")) == _norm("Elena Voss") and _norm(r.get("title")) == _norm("GC")]
    chk("pm_contacts_new_row_name_is_Elena Voss", len(_p0_0) > 0,
        f"expected one new pm_contacts row matching every declared pin (including name=Elena Voss); saw " + str([_norm(r.get("name")) for r in _new_0][:6]))
    _p0_1 = [r for r in _new_0 if _norm(r.get("name")) == _norm("Elena Voss") and _norm(r.get("title")) == _norm("GC")]
    chk("pm_contacts_new_row_title_is_GC", len(_p0_1) > 0,
        f"expected one new pm_contacts row matching every declared pin (including title=GC); saw " + str([_norm(r.get("title")) for r in _new_0][:6]))

    _bi_1 = _ids(initial_state.get("pm_matters", []))
    _af_1 = final_state.get("pm_matters", [])
    _new_1 = [r for r in _af_1 if str(r.get("id")) not in _bi_1]
    chk("rows_inserted_into_pm_matters", len(_new_1) >= 1,
        f"pm_matters: {len(_bi_1)} -> {len(_af_1)} rows")
    _p1_0 = [r for r in _new_1 if _norm(r.get("display_name")) == _norm("Corvess Analytics Securities Matter") and _norm(r.get("client_id")) == _norm("20.0")]
    chk("pm_matters_new_row_display_name_is_Corvess Analytics Securities Matter", len(_p1_0) > 0,
        f"expected one new pm_matters row matching every declared pin (including display_name=Corvess Analytics Securities Matter); saw " + str([_norm(r.get("display_name")) for r in _new_1][:6]))
    _p1_1 = [r for r in _new_1 if _norm(r.get("display_name")) == _norm("Corvess Analytics Securities Matter") and _norm(r.get("client_id")) == _norm("20.0")]
    chk("pm_matters_new_row_client_id_is_20.0", len(_p1_1) > 0,
        f"expected one new pm_matters row matching every declared pin (including client_id=20.0); saw " + str([_norm(r.get("client_id")) for r in _new_1][:6]))

    _bi_2 = _ids(initial_state.get("pm_tasks", []))
    _af_2 = final_state.get("pm_tasks", [])
    _new_2 = [r for r in _af_2 if str(r.get("id")) not in _bi_2]
    chk("rows_inserted_into_pm_tasks", len(_new_2) >= 1,
        f"pm_tasks: {len(_bi_2)} -> {len(_af_2)} rows")
    _p2_0 = [r for r in _new_2 if _norm(r.get("name")) == _norm("Circulate engagement letter") and _norm(r.get("assignee_user_id")) == _norm("3.0")]
    chk("pm_tasks_new_row_name_is_Circulate engagement letter", len(_p2_0) > 0,
        f"expected one new pm_tasks row matching every declared pin (including name=Circulate engagement letter); saw " + str([_norm(r.get("name")) for r in _new_2][:6]))
    _p2_1 = [r for r in _new_2 if _norm(r.get("name")) == _norm("Circulate engagement letter") and _norm(r.get("assignee_user_id")) == _norm("3.0")]
    chk("pm_tasks_new_row_assignee_user_id_is_3.0", len(_p2_1) > 0,
        f"expected one new pm_tasks row matching every declared pin (including assignee_user_id=3.0); saw " + str([_norm(r.get("assignee_user_id")) for r in _new_2][:6]))


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
    return {"task_id": "task_v3_001", "passed": len(failed) == 0, "reward": round(reward, 4),
            "explanation": "All checks passed" if not failed else "Failed: " + ", ".join(failed),
            "failed_conditions": failed, "advisory_conditions": [], "assertions": results}
