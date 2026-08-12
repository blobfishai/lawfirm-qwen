"""Re-grade v16 graph tasks against real LAB evidence and exact workflow state."""
from __future__ import annotations

import copy
import json
import re
from collections import defaultdict
from typing import Any

from world.v17.practice import append_practice_tasks
from world.v17.verifiers import practice_vcode


def source_workflow(task: dict[str, Any]) -> str:
    value = str((task.get("provenance") or {}).get("source_workflow") or "")
    return re.sub(r"^harvey_lab:\s*", "", value).strip()


def notes_vcode(task_id: str, walk: list[str], reference_args: list[dict[str, Any]]) -> str:
    required_notes = [args for tool, args in zip(walk, reference_args) if tool == "notes_create"]
    required_reads = [args for tool, args in zip(walk, reference_args) if tool == "matters_get"]
    return rf'''"""Generated exact workflow-state verifier for {task_id}."""
import json

WALK = {walk!r}
REQUIRED_NOTES = {required_notes!r}
REQUIRED_READS = {required_reads!r}

def _rows(state, table):
    return state.get(table, []) if isinstance(state, dict) else []

def _by_id(rows):
    return {{str(row.get("id")): row for row in rows if isinstance(row, dict) and row.get("id") is not None}}

def _detail(value):
    if isinstance(value, dict): return value
    try:
        parsed = json.loads(value or "{{}}")
        return parsed if isinstance(parsed, dict) else {{}}
    except (TypeError, ValueError):
        return {{}}

def verify(initial_state, final_state, trace):
    results = []
    def check(name, passed, details):
        results.append({{"name": name, "passed": bool(passed), "details": details}})

    successful = [step for step in trace if step.get("ok") and step.get("tool") != "_final_answer"]
    tools = [step.get("tool") for step in successful]
    cursor = 0
    for tool in tools:
        if cursor < len(WALK) and tool == WALK[cursor]: cursor += 1
    check("required_workflow_path", cursor == len(WALK),
          "complete" if cursor == len(WALK) else f"missing={{WALK[cursor:]}}")
    missing_reads = [need for need in REQUIRED_READS if not any(
        step.get("tool") == "matters_get" and
        str((step.get("arguments") or {{}}).get("id")) == str(need.get("id"))
        for step in successful)]
    check("required_records_read", not missing_reads,
          "required matter records read" if not missing_reads else f"missing={{missing_reads}}")

    before = _by_id(_rows(initial_state, "pm_notes"))
    after = _rows(final_state, "pm_notes")
    created = [row for row in after if str(row.get("id")) not in before]
    unmatched = list(created)
    missing_notes = []
    for expected in REQUIRED_NOTES:
        expected_detail = _detail(expected.get("detail"))
        match = next((row for row in unmatched
                      if str(row.get("matter_id")) == str(expected.get("matter_id"))
                      and str(row.get("author_user_id")) == str(expected.get("author_user_id"))
                      and row.get("subject") == expected.get("subject")
                      and _detail(row.get("detail")) == expected_detail), None)
        if match is None:
            missing_notes.append(expected)
        else:
            unmatched.remove(match)
    check("exact_required_notes_created", not missing_notes,
          "all exact note payloads created" if not missing_notes else f"missing={{missing_notes}}")
    check("no_undeclared_notes", not unmatched and len(created) == len(REQUIRED_NOTES),
          "only required notes created" if not unmatched else f"extra={{unmatched}}")

    changed_tables = []
    destroyed = []
    for table in set(initial_state) | set(final_state):
        before_rows, after_rows = _rows(initial_state, table), _rows(final_state, table)
        if table not in ("pm_notes", "audit_logs") and before_rows != after_rows:
            changed_tables.append(table)
        before_ids, after_ids = set(_by_id(before_rows)), set(_by_id(after_rows))
        if before_ids - after_ids:
            destroyed.append(table)
    check("no_offtask_table_changes", not changed_tables,
          "no collateral state change" if not changed_tables else f"changed={{changed_tables}}")
    check("no_rows_destroyed", not destroyed,
          "no records destroyed" if not destroyed else f"destroyed={{destroyed}}")
    failed = [row["name"] for row in results if not row["passed"]]
    return {{
        "task_id": {task_id!r}, "passed": not failed, "reward": 0.0 if failed else 1.0,
        "all_determinate_pass": not failed, "failed_conditions": failed,
        "assertions": results,
        "explanation": "All exact workflow checks passed" if not failed else "Failed: " + ", ".join(failed),
    }}
'''


def ground_existing_graph_tasks(world: dict[str, Any], practice_rows: list[dict[str, Any]]) -> dict[str, Any]:
    compiled_by_source = {row["source_task"]: row for row in practice_rows}
    graph = [task for task in world["tasks"] if task.get("method") == "graph_walk"]
    by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for task in graph:
        by_source[source_workflow(task)].append(task)
    verifier_by_id = {row["task_id"]: row for row in world["verifiers"]}
    task_positions = {task["task_id"]: index for index, task in enumerate(world["tasks"])}
    grounded = exact_workflow = 0
    exceptions: list[dict[str, Any]] = []
    represented_sources: set[str] = set()

    for source, tasks in sorted(by_source.items()):
        compiled = compiled_by_source.get(source)
        if compiled is not None:
            generated_world = {"tasks": [], "verifiers": []}
            result = append_practice_tasks(generated_world, [compiled], set())
            if result.get("added") != 1:
                exceptions.append({"source_task": source, "task_ids": [task["task_id"] for task in tasks],
                                   "reason": (result.get("quarantine") or [{"reason": "admission_failed"}])[0]})
                continue
            template = generated_world["tasks"][0]
            criteria = template["file_lane"]["assertions"]
            deliverables = template["file_lane"]["deliverables"]
            read_ids = template["relevant_data"][0]["required_document_ids"]
            for original in tasks:
                task = copy.deepcopy(template)
                task["task_id"] = original["task_id"]
                task["method"] = "graph_walk_grounded_lab"
                task["difficulty_tier"] = original.get("difficulty_tier") or task["difficulty_tier"]
                task["provenance"] = {
                    **(original.get("provenance") or {}), **task["provenance"],
                    "grounding_migration": "world/v17/ground_existing.py",
                    "replaces_shape_only_task": original["task_id"],
                }
                world["tasks"][task_positions[original["task_id"]]] = task
                verifier_by_id[original["task_id"]] = {
                    "task_id": original["task_id"],
                    "assertions": ["required_workflow_path", "required_search_discovery",
                                   "required_documents_read", "all_deliverables_filed_to_dms",
                                   "grounded_criteria", "no_unsupported_numeric_facts",
                                   "no_offtask_table_changes",
                                   "no_documents_destroyed", "no_undeclared_documents"],
                    "key_assertions": ["grounded_criteria", "no_unsupported_numeric_facts"],
                    "vcode": practice_vcode(original["task_id"], deliverables, criteria, read_ids),
                    "generated_by": "world/v17/ground_existing.py",
                }
                grounded += 1
            represented_sources.add(source)
            continue

        # Seven legacy workflow tasks are not LAB-derived deliverables. Their
        # result is exact structured state, so compile the reference payloads
        # directly instead of inventing source-document anchors.
        for task in tasks:
            if task.get("walk") and all(tool in {"matters_list", "matters_get", "matters_search", "notes_create"}
                                        for tool in task["walk"]):
                verifier_by_id[task["task_id"]] = {
                    "task_id": task["task_id"],
                    "assertions": ["required_workflow_path", "required_records_read",
                                   "exact_required_notes_created", "no_undeclared_notes",
                                   "no_offtask_table_changes", "no_rows_destroyed"],
                    "key_assertions": ["exact_required_notes_created", "no_undeclared_notes"],
                    "vcode": notes_vcode(task["task_id"], task["walk"], task["reference_args"]),
                    "generated_by": "world/v17/ground_existing.py",
                }
                task["method"] = "graph_walk_exact_state"
                task["acceptance_label"] = "admitted_exact_state"
                task.setdefault("provenance", {})["grounding_migration"] = "exact structured note payload"
                exact_workflow += 1
            else:
                exceptions.append({"source_task": source, "task_ids": [task["task_id"]],
                                   "reason": "no LAB source and no exact-state compiler"})

    world["verifiers"] = [verifier_by_id[task["task_id"]] for task in world["tasks"]]
    result = {
        "graph_tasks": len(graph), "lab_grounded": grounded,
        "exact_state": exact_workflow, "exceptions": exceptions,
        "represented_lab_sources": sorted(represented_sources),
    }
    world["graph_grounding_import"] = result
    return result
