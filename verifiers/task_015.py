"""Generated v16 verifier for task_015.

Source: explicit check_grammar embedded beside this VCode. Regenerate with
world/migrate/gen1_to_v16.py; never patch this string directly.
"""
import json

READ_TOOLS = ['matters_list', 'matters_get']
WRITE_TOOLS = ['notes_create']

def _rows(state, table):
    return state.get(table, []) if isinstance(state, dict) else []

def _ids(rows):
    return {str(r.get("id")) for r in rows if isinstance(r, dict) and r.get("id") is not None}

def _new_rows(initial_state, final_state, table):
    before = _ids(_rows(initial_state, table))
    return [r for r in _rows(final_state, table) if str(r.get("id")) not in before]

def _norm(value):
    if value is None: return "null"
    if value is True: return "true"
    if value is False: return "false"
    text = str(value).strip().lower()
    try:
        return repr(float(text))
    except (TypeError, ValueError):
        return text

def _payload(row, field):
    value = row.get(field)
    if isinstance(value, dict): return value
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}

def _payload_text(row, payload_field, field):
    return str(_payload(row, payload_field).get(field) or "")

def verify(initial_state, final_state, trace):
    results, failed = [], []
    def chk(name, passed, detail):
        results.append({"name": name, "passed": bool(passed), "details": detail})
        if not passed: failed.append(name)

    successful_steps = [s for s in trace if s.get("tool") != "_final_answer" and s.get("ok")]
    tools = [s.get("tool", "") for s in successful_steps]
    changed = initial_state != final_state
    chk("state_changed", changed, "world state changed" if changed else "NO state change")

    reads = [tool for tool in tools if tool in READ_TOOLS]
    writes = [tool for tool in tools if tool in WRITE_TOOLS]
    read_first = bool(reads) and (not writes or tools.index(reads[0]) < tools.index(writes[0]))
    chk("reads_before_writes", read_first,
        f"reads={len(reads)}, writes={len(writes)}, read_first={read_first}")
    chk("no_shortcut_direct_update", not (writes and not reads),
        "inspected data before writing" if reads else "SHORTCUT: wrote without reading")

    required_path = ['matters_list', 'matters_get', 'notes_create', 'notes_create']
    cursor = 0
    for tool in tools:
        if cursor < len(required_path) and tool == required_path[cursor]:
            cursor += 1
    chk("required_workflow_path", cursor == len(required_path),
        "completed: " + " -> ".join(required_path) if cursor == len(required_path)
        else "INCOMPLETE: missing " + " -> ".join(required_path[cursor:]))


    _new_0 = _new_rows(initial_state, final_state, 'pm_notes')
    chk('rows_inserted_into_pm_notes', len(_new_0) >= 2,
        f"pm_notes: {len(_new_0)} new row(s), need >= 2")
    _effect_rows_0 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_0 = [r for r in _effect_rows_0 if True]
    _effect_rows_1 = _new_rows(initial_state, final_state, 'pm_notes')
    _effect_match_1 = [r for r in _effect_rows_1 if True]


    allowed_tables = set(['pm_notes'])
    damaged = []
    fabricated = []
    destroyed = []
    for table in set(initial_state) | set(final_state):
        before = _rows(initial_state, table)
        after = _rows(final_state, table)
        if before != after and table not in allowed_tables:
            damaged.append(table)
        before_ids, after_ids = _ids(before), _ids(after)
        if len(after) < len(before) or before_ids - after_ids:
            destroyed.append(table)
        if table not in allowed_tables and (len(after) > len(before) or after_ids - before_ids):
            fabricated.append(table)
    chk("no_offtask_table_changes", not damaged,
        "no off-task tables changed" if not damaged else "OFF-TASK DAMAGE: " + str(sorted(damaged)))
    chk("no_rows_destroyed", not destroyed,
        "no rows destroyed" if not destroyed else "ROWS DESTROYED: " + str(sorted(destroyed)))
    chk("no_undeclared_rows_created", not fabricated,
        "all created rows declared" if not fabricated else "UNDECLARED CREATION: " + str(sorted(fabricated)))

    real_trace = [s for s in trace if s.get("tool") != "_final_answer"]
    ok_count = sum(1 for s in real_trace if s.get("ok"))
    chk("all_tools_succeeded", bool(real_trace) and ok_count * 5 >= len(real_trace) * 4,
        f"{ok_count}/{len(real_trace)} calls succeeded")

    anti = {"reads_before_writes", "no_shortcut_direct_update", "required_workflow_path", "required_documents_read"}
    guards = {"no_offtask_table_changes", "no_rows_destroyed", "no_undeclared_rows_created"}
    veto = {r["name"] for r in results if "grounded" in r["name"] or "unsupported" in r["name"]}
    advisory = {"all_tools_succeeded"}
    structural = [name for name in failed if name not in advisory]
    core = [r for r in results if r["name"] not in anti | guards | advisory | {"state_changed"}]
    core_failed = [r for r in core if not r["passed"]]
    if any(name in anti | guards | veto for name in failed):
        reward = 0.0
    elif core:
        reward = (len(core) - len(core_failed)) / len(core)
    else:
        reward = 0.0 if structural else 1.0
    return {
        "task_id": 'task_015',
        "passed": not structural,
        "reward": round(reward, 4),
        "explanation": "All task checks passed" if not structural else "Failed: " + ", ".join(structural),
        "failed_conditions": structural,
        "advisory_conditions": [name for name in failed if name in advisory],
        "assertions": results,
    }
