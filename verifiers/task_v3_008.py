"""VCode verifier for task_v3_008 (v3 workflow: imanage-version-cycle)
Walk: documents_get -> documents_checkout -> documents_checkin -> document_versions_list
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

    _path = ["documents_get","documents_checkout","documents_checkin","document_versions_list"]
    _cur = 0
    for _t in tools:
        if _cur < len(_path) and _t == _path[_cur]:
            _cur += 1
    chk("required_workflow_path", _cur == len(_path),
        "completed: " + " -> ".join(_path) if _cur == len(_path)
        else "INCOMPLETE: missing " + " -> ".join(_path[_cur:]))


    _row_u0 = next((r for r in final_state.get("dm_documents", []) if str(r.get("id")) == "5"), None)
    chk("dm_documents_5_latest_version_is_2.0",
        _row_u0 is not None and _norm(_row_u0.get("latest_version")) == _norm("2.0"),
        f"dm_documents[5].latest_version = " + (_norm(_row_u0.get("latest_version")) if _row_u0 else "(row missing)") + ", expected 2.0")

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
    return {"task_id": "task_v3_008", "passed": len(failed) == 0, "reward": round(reward, 4),
            "explanation": "All checks passed" if not failed else "Failed: " + ", ".join(failed),
            "failed_conditions": failed, "advisory_conditions": [], "assertions": results}
