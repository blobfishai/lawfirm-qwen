"""Compile v16 task check grammars into deterministic VCode verifiers."""

from __future__ import annotations

from typing import Any


def _j(value: Any) -> str:
    """Render a deterministic Python literal for generated verifier source.

    JSON happens to be valid Python for strings, numbers, lists, and objects,
    but not for ``true``, ``false``, or ``null``.  Verifiers routinely pin
    booleans and nullable fields, so using JSON here would compile and then
    fail at evaluation time with an unbound-name error.
    """
    return repr(value)


def assertion_names(grammar: dict[str, Any]) -> list[str]:
    names = [
        "state_changed",
        "reads_before_writes",
        "no_shortcut_direct_update",
        "required_workflow_path",
    ]
    if grammar.get("required_reads"):
        names.append("required_documents_read")
    counts: dict[str, int] = {}
    for row in grammar.get("rows", []):
        table = row["table"]
        counts[table] = counts.get(table, 0) + 1
    names.extend(f"rows_inserted_into_{table}" for table in sorted(counts))
    for index, row in enumerate(grammar.get("rows", [])):
        for field in row.get("direct_pins", {}):
            names.append(f"effect_{index}_direct_{field}")
        for field in row.get("payload_pins", {}):
            names.append(f"effect_{index}_payload_{field}")
        for grounded_index, _ in enumerate(row.get("grounded", [])):
            names.extend(
                [
                    f"effect_{index}_grounded_{grounded_index}",
                    f"effect_{index}_no_unsupported_{grounded_index}",
                ]
            )
    names.extend(f"forbidden_{index}" for index, _ in enumerate(grammar.get("forbidden", [])))
    names.extend(
        [
            "no_offtask_table_changes",
            "no_rows_destroyed",
            "no_undeclared_rows_created",
            "all_tools_succeeded",
        ]
    )
    return names


def compile_vcode(task_id: str, grammar: dict[str, Any]) -> str:
    walk = grammar["walk"]
    read_tools = grammar["read_tools"]
    write_tools = grammar["write_tools"]
    required_reads = grammar.get("required_reads", [])
    rows = grammar.get("rows", [])
    forbidden = grammar.get("forbidden", [])
    allowed_tables = sorted(set(grammar.get("allowed_tables", [])))

    effect_blocks: list[str] = []
    table_counts: dict[str, int] = {}
    for row in rows:
        table_counts[row["table"]] = table_counts.get(row["table"], 0) + 1
    for table, minimum in sorted(table_counts.items()):
        effect_blocks.append(
            f'''\n    _new_{len(effect_blocks)} = _new_rows(initial_state, final_state, {_j(table)})
    chk({_j(f"rows_inserted_into_{table}")}, len(_new_{len(effect_blocks)}) >= {minimum},
        f"{table}: {{len(_new_{len(effect_blocks)})}} new row(s), need >= {minimum}")'''
        )

    for index, row in enumerate(rows):
        table = row["table"]
        direct_pins = row.get("direct_pins", {})
        payload_field = row.get("payload_field")
        payload_pins = row.get("payload_pins", {})
        predicates = [
            f'_norm(r.get({_j(field)})) == _norm({_j(value)})'
            for field, value in direct_pins.items()
        ]
        if payload_pins:
            predicates.extend(
                f'_norm(_payload(r, {_j(payload_field)}).get({_j(field)})) == _norm({_j(value)})'
                for field, value in payload_pins.items()
            )
        predicate = " and ".join(predicates) or "True"
        block = f'''\n    _effect_rows_{index} = _new_rows(initial_state, final_state, {_j(table)})
    _effect_match_{index} = [r for r in _effect_rows_{index} if {predicate}]'''
        for field, value in direct_pins.items():
            block += f'''\n    chk({_j(f"effect_{index}_direct_{field}")}, len(_effect_match_{index}) > 0,
        {_j(f"expected one new {table} row matching all direct pins, including {field}={value}")} if _effect_match_{index}
        else {_j(f"no new {table} row matched the declared direct pins")})'''
        for field, value in payload_pins.items():
            block += f'''\n    chk({_j(f"effect_{index}_payload_{field}")}, len(_effect_match_{index}) > 0,
        {_j(f"expected one new {table} payload matching all pins, including {field}={value}")} if _effect_match_{index}
        else {_j(f"no new {table} payload matched the declared pins")})'''
        for grounded_index, grounded in enumerate(row.get("grounded", [])):
            source = grounded.get("source", "direct")
            field = grounded["field"]
            if source == "payload":
                text_expr = f'_payload_text(r, {_j(payload_field)}, {_j(field)})'
            else:
                text_expr = f'str(r.get({_j(field)}) or "")'
            present = grounded.get("present", [])
            absent = grounded.get("absent", [])
            minimum = int(grounded.get("min_chars", 0))
            block += f'''\n    _ground_text_{index}_{grounded_index} = " \\n ".join({text_expr} for r in _effect_rows_{index}).lower()
    _ground_missing_{index}_{grounded_index} = [a for a in {_j(present)} if a.lower() not in _ground_text_{index}_{grounded_index}]
    chk({_j(f"effect_{index}_grounded_{grounded_index}")},
        len(_ground_text_{index}_{grounded_index}) >= {minimum} and not _ground_missing_{index}_{grounded_index},
        "grounded anchors present" if not _ground_missing_{index}_{grounded_index}
        else "UNGROUNDED: missing " + str(_ground_missing_{index}_{grounded_index}[:6]))
    _ground_bad_{index}_{grounded_index} = [a for a in {_j(absent)} if a.lower() in _ground_text_{index}_{grounded_index}]
    chk({_j(f"effect_{index}_no_unsupported_{grounded_index}")}, not _ground_bad_{index}_{grounded_index},
        "no contradicted anchors" if not _ground_bad_{index}_{grounded_index}
        else "UNSUPPORTED: " + str(_ground_bad_{index}_{grounded_index}[:6]))'''
        effect_blocks.append(block)

    forbidden_blocks: list[str] = []
    for index, item in enumerate(forbidden):
        table = item["table"]
        field = item["field"]
        value = item["value"]
        scope = item.get("scope") or {}
        if item.get("source") == "payload":
            getter = f'_payload(r, {_j(item["payload_field"])}).get({_j(field)})'
        else:
            getter = f'r.get({_j(field)})'
        scope_predicates = [
            (
                f'_norm(_payload(r, {_j(item["payload_field"])}).get({_j(scope_field)})) '
                f'== _norm({_j(scope_value)})'
                if item.get("source") == "payload"
                else f'_norm(r.get({_j(scope_field)})) == _norm({_j(scope_value)})'
            )
            for scope_field, scope_value in scope.items()
        ]
        scoped = " and ".join(scope_predicates + [f'_norm({getter}) == _norm({_j(value)})'])
        forbidden_blocks.append(
            f'''\n    _forbidden_{index} = [r for r in _new_rows(initial_state, final_state, {_j(table)})
                         if {scoped}]
    chk({_j(f"forbidden_{index}")}, not _forbidden_{index},
        "forbidden value absent" if not _forbidden_{index}
        else {_j(f"FABRICATION: new {table} row contains forbidden {field}={value}")})'''
        )

    required_read_block = ""
    if required_reads:
        required_read_block = f'''\n    _required_reads = {_j(required_reads)}
    _missing_reads = []
    for _need in _required_reads:
        if not any(s.get("tool") == _need["tool"] and s.get("ok") and
                   _norm((s.get("arguments") or {{}}).get("id")) == _norm(_need["id"])
                   for s in successful_steps):
            _missing_reads.append(_need)
    chk("required_documents_read", not _missing_reads,
        "all required documents downloaded in full" if not _missing_reads
        else "EVIDENCE GAP: " + str(_missing_reads))'''

    return f'''"""Generated v16 verifier for {task_id}.

Source: explicit check_grammar embedded beside this VCode. Regenerate with
world/migrate/gen1_to_v16.py; never patch this string directly.
"""
import json

READ_TOOLS = {_j(read_tools)}
WRITE_TOOLS = {_j(write_tools)}

def _rows(state, table):
    return state.get(table, []) if isinstance(state, dict) else []

def _ids(rows):
    return {{str(r.get("id")) for r in rows if isinstance(r, dict) and r.get("id") is not None}}

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
        parsed = json.loads(value or "{{}}")
        return parsed if isinstance(parsed, dict) else {{}}
    except (TypeError, ValueError):
        return {{}}

def _payload_text(row, payload_field, field):
    return str(_payload(row, payload_field).get(field) or "")

def verify(initial_state, final_state, trace):
    results, failed = [], []
    def chk(name, passed, detail):
        results.append({{"name": name, "passed": bool(passed), "details": detail}})
        if not passed: failed.append(name)

    successful_steps = [s for s in trace if s.get("tool") != "_final_answer" and s.get("ok")]
    tools = [s.get("tool", "") for s in successful_steps]
    changed = initial_state != final_state
    chk("state_changed", changed, "world state changed" if changed else "NO state change")

    reads = [tool for tool in tools if tool in READ_TOOLS]
    writes = [tool for tool in tools if tool in WRITE_TOOLS]
    read_first = bool(reads) and (not writes or tools.index(reads[0]) < tools.index(writes[0]))
    chk("reads_before_writes", read_first,
        f"reads={{len(reads)}}, writes={{len(writes)}}, read_first={{read_first}}")
    chk("no_shortcut_direct_update", not (writes and not reads),
        "inspected data before writing" if reads else "SHORTCUT: wrote without reading")

    required_path = {_j(walk)}
    cursor = 0
    for tool in tools:
        if cursor < len(required_path) and tool == required_path[cursor]:
            cursor += 1
    chk("required_workflow_path", cursor == len(required_path),
        "completed: " + " -> ".join(required_path) if cursor == len(required_path)
        else "INCOMPLETE: missing " + " -> ".join(required_path[cursor:]))
{required_read_block}
{"".join(effect_blocks)}
{"".join(forbidden_blocks)}

    allowed_tables = set({_j(allowed_tables)})
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
        f"{{ok_count}}/{{len(real_trace)}} calls succeeded")

    anti = {{"reads_before_writes", "no_shortcut_direct_update", "required_workflow_path", "required_documents_read"}}
    guards = {{"no_offtask_table_changes", "no_rows_destroyed", "no_undeclared_rows_created"}}
    veto = {{r["name"] for r in results if "grounded" in r["name"] or "unsupported" in r["name"]}}
    advisory = {{"all_tools_succeeded"}}
    structural = [name for name in failed if name not in advisory]
    core = [r for r in results if r["name"] not in anti | guards | advisory | {{"state_changed"}}]
    core_failed = [r for r in core if not r["passed"]]
    if any(name in anti | guards | veto for name in failed):
        reward = 0.0
    elif core:
        reward = (len(core) - len(core_failed)) / len(core)
    else:
        reward = 0.0 if structural else 1.0
    return {{
        "task_id": {_j(task_id)},
        "passed": not structural,
        "reward": round(reward, 4),
        "explanation": "All task checks passed" if not structural else "Failed: " + ", ".join(structural),
        "failed_conditions": structural,
        "advisory_conditions": [name for name in failed if name in advisory],
        "assertions": results,
    }}
'''
