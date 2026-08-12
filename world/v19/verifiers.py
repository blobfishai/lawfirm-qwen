"""Deterministic verifier compiler for v19 multi-step tasks.

The builder supplies declarative assertions.  This module serializes them into
self-contained VCode so the runtime needs no v19 Python package at grade time.
"""
from __future__ import annotations

import json
from typing import Any


def compile_vcode(
    task_id: str,
    required_path: list[str],
    assertions: list[dict[str, Any]],
    *,
    allowed_tables: list[str] | None = None,
    min_success_calls: int = 0,
) -> str:
    config = {
        "task_id": task_id,
        "required_path": required_path,
        "assertions": assertions,
        "allowed_tables": allowed_tables,
        "min_success_calls": min_success_calls,
    }
    encoded = json.dumps(config, sort_keys=True, separators=(",", ":"))
    return f'''"""Generated deterministic verifier for {task_id}."""
import json

CONFIG = json.loads({encoded!r})

def _rows(state, table):
    return state.get(table, []) if isinstance(state, dict) else []

def _new(initial_state, final_state, table):
    before = {{str(row.get("id")) for row in _rows(initial_state, table)}}
    return [row for row in _rows(final_state, table)
            if str(row.get("id")) not in before]

def _matches(row, expected):
    for key, value in expected.items():
        actual = row.get(key)
        if isinstance(value, dict) and "startswith" in value:
            if not str(actual or "").startswith(str(value["startswith"])):
                return False
        elif isinstance(value, dict) and "contains" in value:
            if str(value["contains"]).casefold() not in str(actual or "").casefold():
                return False
        elif actual != value:
            return False
    return True

def verify(initial_state, final_state, trace):
    checks = []
    def check(name, passed, details):
        checks.append({{"name": name, "passed": bool(passed), "details": details}})

    successful = [step for step in trace
                  if step.get("ok") and step.get("tool") != "_final_answer"]
    tools = [step.get("tool") for step in successful]
    cursor = 0
    for tool in tools:
        if cursor < len(CONFIG["required_path"]) and tool == CONFIG["required_path"][cursor]:
            cursor += 1
    check("required_path", cursor == len(CONFIG["required_path"]),
          f"matched={{cursor}}/{{len(CONFIG['required_path'])}} observed={{tools}}")
    if CONFIG["min_success_calls"]:
        check("minimum_successful_calls", len(successful) >= CONFIG["min_success_calls"],
              f"successful={{len(successful)}} minimum={{CONFIG['min_success_calls']}}")

    for index, assertion in enumerate(CONFIG["assertions"]):
        kind = assertion["kind"]
        name = assertion.get("name") or f"assertion_{{index + 1}}"
        if kind == "new_row":
            rows = [row for row in _new(initial_state, final_state, assertion["table"])
                    if _matches(row, assertion.get("matches") or {{}})]
            count = assertion.get("count", 1)
            check(name, len(rows) == count,
                  f"table={{assertion['table']}} matching={{len(rows)}} expected={{count}}")
        elif kind == "absent_new_row":
            rows = [row for row in _new(initial_state, final_state, assertion["table"])
                    if _matches(row, assertion.get("matches") or {{}})]
            check(name, not rows,
                  f"table={{assertion['table']}} forbidden_matching={{len(rows)}}")
        elif kind == "new_row_count":
            rows = _new(initial_state, final_state, assertion["table"])
            count = assertion["count"]
            check(name, len(rows) == count,
                  f"table={{assertion['table']}} new={{len(rows)}} expected={{count}}")
        elif kind == "changed_row":
            row_id = str(assertion["id"])
            before = next((row for row in _rows(initial_state, assertion["table"])
                           if str(row.get("id")) == row_id), None)
            after = next((row for row in _rows(final_state, assertion["table"])
                          if str(row.get("id")) == row_id), None)
            final_match = bool(after and _matches(after, assertion.get("matches") or {{}}))
            before_match = _matches(before or {{}}, assertion.get("before") or {{}})
            check(name, bool(before and after and before != after and before_match and final_match),
                  f"table={{assertion['table']}} id={{row_id}} before={{before}} after={{after}}")
        elif kind == "tool_observation_contains":
            observations = "\\n".join(str(step.get("observation") or "") for step in successful
                                      if step.get("tool") == assertion["tool"])
            anchors = assertion.get("anchors") or []
            missing = [anchor for anchor in anchors
                       if str(anchor).casefold() not in observations.casefold()]
            check(name, not missing, f"tool={{assertion['tool']}} missing={{missing}}")
        elif kind == "tool_min_calls":
            observed = sum(1 for tool in tools if tool == assertion["tool"])
            minimum = assertion["minimum"]
            check(name, observed >= minimum,
                  f"tool={{assertion['tool']}} calls={{observed}} minimum={{minimum}}")
        else:
            check(name, False, f"unsupported assertion kind={{kind}}")

    if CONFIG["allowed_tables"] is not None:
        allowed = set(CONFIG["allowed_tables"]) | {{"audit_logs"}}
        changed = [table for table in set(initial_state) | set(final_state)
                   if table not in allowed
                   and _rows(initial_state, table) != _rows(final_state, table)]
        check("no_collateral_damage", not changed, f"changed={{sorted(changed)}}")

    failed = [item["name"] for item in checks if not item["passed"]]
    return {{
        "task_id": CONFIG["task_id"],
        "passed": not failed,
        "reward": 0.0 if failed else 1.0,
        "failed_conditions": failed,
        "assertions": checks,
        "explanation": "All deterministic checks passed" if not failed
                       else "Failed: " + ", ".join(failed),
    }}
'''
