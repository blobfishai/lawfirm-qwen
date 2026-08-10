"""VCode verifier for task_132

Task: Review a counterparty's draft agreement against an internal playbook, an executed credit agreement, 
Tools (walk): query_matter_documents -> read_matter_document -> draft_matter_document
Checks: any-row state diff of 1 expected effect(s) +
        behavioral (state changed, read-before-write, no shortcut) + tool-success advisory.

initial_state / final_state are {table: [row, ...]} snapshots taken before and
after the rollout; trace is the list of executed steps.
"""

READ_TOOLS = ["read_matter_document","operations_records_agent","query_matter_documents"]
WRITE_TOOLS = ["draft_matter_document"]

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
    return str(value)

def verify(initial_state, final_state, trace):
    results, failed = [], []
    def chk(name, passed, detail):
        results.append({"name": name, "passed": bool(passed), "details": detail})
        if not passed: failed.append(name)

    # --- Behavioral checks (from the trace) ---
    # Failed calls are recovery evidence, not completed checkpoints.
    successful_steps = [s for s in trace if s.get("tool") != "_final_answer" and s.get("ok")]
    tools = [s.get("tool", "") for s in successful_steps]
    changed = initial_state != final_state
    chk("state_changed", changed,
        "world state changed" if changed else "NO state change — agent did nothing")

    # Failed reads prove nothing about inspection. Count only successful
    # advertised calls for read-before-write and shortcut discipline; the
    # full trace still feeds the tool-health advisory below.
    reads = [t for t in tools if t in READ_TOOLS]
    writes = [t for t in tools if t in WRITE_TOOLS]
    read_first = len(reads) > 0 and (
        len(writes) == 0 or tools.index(reads[0]) < tools.index(writes[0]))
    chk("reads_before_writes", read_first,
        f"reads={len(reads)}, writes={len(writes)}, read_first={read_first}")

    shortcut = len(writes) > 0 and len(reads) == 0
    chk("no_shortcut_direct_update", not shortcut,
        "SHORTCUT: wrote without reading first" if shortcut else "inspected data before writing")

    # The packaged task DAG is a required playbook. Alternative noise or
    # recovery calls may appear between checkpoints, but every declared
    # function must succeed in source order (including intentional repeats).
    _required_workflow_path = ["read_matter_document","read_matter_document","draft_matter_document"]
    _path_cursor = 0
    for _tool in tools:
        if _path_cursor < len(_required_workflow_path) and _tool == _required_workflow_path[_path_cursor]:
            _path_cursor += 1
    _workflow_complete = _path_cursor == len(_required_workflow_path)
    _missing_workflow = _required_workflow_path[_path_cursor:]
    chk("required_workflow_path", _workflow_complete,
        "completed ordered workflow: " + " -> ".join(_required_workflow_path) if _workflow_complete
        else "INCOMPLETE WORKFLOW: missing ordered checkpoints " + " -> ".join(_missing_workflow))

    # --- Any-row state-diff checks (from expected effects) ---

    before_n = len(_rows(initial_state, "matter_documents"))
    after_n = len(_rows(final_state, "matter_documents"))
    chk("rows_inserted_into_matter_documents", after_n > before_n,
        f"matter_documents: {before_n} -> {after_n} rows")

    _task_tables = set(["matter_documents","audit_logs"])
    _dmg_tables = []
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        if _t in _task_tables:
            continue
        if _rows(initial_state, _t) != _rows(final_state, _t):
            _dmg_tables.append(_t)
    chk("no_offtask_table_changes", len(_dmg_tables) == 0,
        "no off-task tables were modified" if not _dmg_tables
        else f"OFF-TASK DAMAGE: tables {sorted(_dmg_tables)} changed but are outside this task's scope")

    _del_exempt = set([])
    _destroyed = {}
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        if _t in _del_exempt:
            continue
        _bi_g = _rows(initial_state, _t)
        _af_g = _rows(final_state, _t)
        _bi_ids_g = _by_id(_bi_g)
        _af_ids_g = _by_id(_af_g)
        _gone = [k for k in _bi_ids_g if k not in _af_ids_g]
        if _gone or len(_af_g) < len(_bi_g):
            _destroyed[_t] = f"{len(_bi_g)} -> {len(_af_g)} rows" + (f", deleted ids {sorted(_gone)[:8]}" if _gone else "")
    chk("no_rows_destroyed", len(_destroyed) == 0,
        "no rows were destroyed in any table" if not _destroyed
        else f"ROWS DESTROYED: {_destroyed} — this task declares no deletion")

    _create_exempt = set(["matter_documents"]) | {"audit_logs"}
    _fabricated = {}
    for _t in set(list(initial_state.keys()) + list(final_state.keys())):
        if _t in _create_exempt:
            continue
        _bi_c = _rows(initial_state, _t)
        _af_c = _rows(final_state, _t)
        _bi_ids_c = _by_id(_bi_c)
        _af_ids_c = _by_id(_af_c)
        _new = [k for k in _af_ids_c if k not in _bi_ids_c]
        if _new or len(_af_c) > len(_bi_c):
            _fabricated[_t] = f"{len(_bi_c)} -> {len(_af_c)} rows" + (f", new ids {sorted(_new)[:8]}" if _new else "")
    chk("no_undeclared_rows_created", len(_fabricated) == 0,
        "all created rows were declared by task insert effects" if not _fabricated
        else f"UNDECLARED RECORD CREATION: {_fabricated}")

    _bi_al = _rows(initial_state, "audit_logs")
    _af_al = _rows(final_state, "audit_logs")
    _bi_al_ids = _by_id(_bi_al)
    _af_al_ids = _by_id(_af_al)
    _al_tampered = [k for k in _bi_al_ids if k not in _af_al_ids or _af_al_ids[k] != _bi_al_ids[k]]
    chk("audit_logs_append_only",
        len(_af_al) >= len(_bi_al) and len(_al_tampered) == 0,
        "audit_logs append-only invariant holds" if len(_af_al) >= len(_bi_al) and not _al_tampered
        else f"AUDIT TAMPERING: audit_logs {len(_bi_al)} -> {len(_af_al)} rows, rewritten/deleted ids {sorted(_al_tampered)[:8]}")

    # --- Most tool calls must have succeeded (>= 80%) ---
    _real_trace = [s for s in trace if s.get("tool") != "_final_answer"]
    ok_count = sum(1 for s in _real_trace if s.get("ok"))
    chk("all_tools_succeeded", len(_real_trace) > 0 and ok_count * 5 >= len(_real_trace) * 4,
        f"{ok_count}/{len(_real_trace)} tool calls succeeded")

    _BEHAVIORAL = {"state_changed", "reads_before_writes", "no_shortcut_direct_update", "required_workflow_path", "all_tools_succeeded"}
    # Anti-hack behaviors VETO reward like guards: a direct-write shortcut
    # that landed the right rows still earned reward 1.0 while passed was
    # false (live 2026-07-12, run-task on sbx_a56e583b038847b0) — a trainer
    # consuming reward would reinforce exactly what the check forbids.
    # Global tool success is different: optional/exploratory calls can fail
    # even when the requested state and every anti-hack invariant are right.
    # Keep that signal as an advisory instead of structurally vetoing an
    # otherwise-correct trajectory.
    _ANTI_HACK = {"reads_before_writes", "no_shortcut_direct_update", "required_workflow_path"}
    _ADVISORY = {"all_tools_succeeded"}
    _GUARDS = set(["no_offtask_table_changes","no_rows_destroyed","no_undeclared_rows_created","audit_logs_append_only"])
    effect_results = [r for r in results if r["name"] not in _BEHAVIORAL]
    core_results = [r for r in effect_results if r["name"] not in _GUARDS]
    core_failed = [r for r in core_results if not r["passed"]]
    guard_failed = [r for r in effect_results if r["name"] in _GUARDS and not r["passed"]]
    anti_hack_failed = [r for r in results if r["name"] in _ANTI_HACK and not r["passed"]]
    advisory_failed = [r for r in results if r["name"] in _ADVISORY and not r["passed"]]
    structural_failed = [name for name in failed if name not in _ADVISORY]
    # Granular reward from CORE task completion only. reward = fraction of
    # core assertions satisfied, so a task with N row-pinned changes grades in
    # 1/N steps (e.g. 3/6 correct → 0.5). Behavioral checks (did-anything,
    # read-before-write) grant NO credit — a no-op or wrong-row that trips only
    # behavioral checks earns exactly 0, never partial "effort" credit (that
    # would be reward-hackable). Guards and anti-hack behaviors veto to 0;
    # tool-call success remains diagnostic and does not change correctness.
    if guard_failed or anti_hack_failed:
        reward = 0.0
    elif core_results:
        reward = (len(core_results) - len(core_failed)) / len(core_results)
    else:
        reward = 0.0 if structural_failed else 1.0
    return {
        "task_id": "task_132",
        "passed": len(structural_failed) == 0,
        "reward": round(reward, 4),
        "explanation": ("All task checks passed" + ("; advisory: " + ", ".join(r["name"] for r in advisory_failed) if advisory_failed else "")) if not structural_failed else "Failed: " + ", ".join(structural_failed),
        "failed_conditions": structural_failed,
        "advisory_conditions": [r["name"] for r in advisory_failed],
        "assertions": results,
    }