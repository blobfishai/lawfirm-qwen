"""VCode generators for v17 practice and retrieval tasks."""
from __future__ import annotations

import json


def retrieval_vcode(task_id: str, gold: list[str], required_read_ids: list[int],
                    required_anchor_groups: list[list[str]] | None = None,
                    paging_required: bool = False) -> str:
    required_anchor_groups = required_anchor_groups or []
    return rf'''"""Generated retrieval verifier for {task_id}."""
import re

GOLD = set({gold!r})
REQUIRED_READ_IDS = set({[str(value) for value in required_read_ids]!r})
REQUIRED_ANCHOR_GROUPS = {required_anchor_groups!r}
PAGING_REQUIRED = {paging_required!r}

def _rows(state, table):
    return state.get(table, []) if isinstance(state, dict) else []

def _by_id(rows):
    return {{str(row.get("id")): row for row in rows if isinstance(row, dict) and row.get("id") is not None}}

def verify(initial_state, final_state, trace):
    results = []
    def check(name, passed, details):
        results.append({{"name": name, "passed": bool(passed), "details": details}})

    successful = [step for step in trace if step.get("ok") and step.get("tool") != "_final_answer"]
    tools = [step.get("tool") for step in successful]
    search_positions = [i for i, tool in enumerate(tools) if tool in ("documents_search", "documents_search_fulltext")]
    read_positions = [i for i, tool in enumerate(tools) if tool == "documents_download"]
    write_positions = [i for i, tool in enumerate(tools) if tool == "documents_create"]
    path_ok = bool(search_positions and write_positions and min(search_positions) < min(write_positions))
    if REQUIRED_READ_IDS:
        path_ok = bool(path_ok and read_positions and
                       min(search_positions) < min(read_positions) < min(write_positions))
    check("required_workflow_path", path_ok,
          "search -> full-body read -> DMS filing" if path_ok else f"observed tools={{tools}}")

    read_ids = {{str((step.get("arguments") or {{}}).get("id"))
                for step in successful if step.get("tool") == "documents_download"}}
    missing_reads = sorted(REQUIRED_READ_IDS - read_ids)
    check("required_documents_read", not missing_reads,
          "required evidence read" if not missing_reads else f"missing external document ids {{missing_reads}}")

    discovered = set()
    blind_reads = []
    page_followups = []
    searches_seen = set()
    for step in successful:
        if step.get("tool") in ("documents_search", "documents_search_fulltext"):
            arguments = step.get("arguments") or {{}}
            key = (str(arguments.get("query") or arguments.get("anywhere") or ""),
                   int(arguments.get("offset") or 0))
            searches_seen.add(key)
            observation = str(step.get("observation") or "")
            discovered.update(re.findall(r'"id"\s*:\s*(\d+)', observation))
            more = re.search(r'"has_more"\s*:\s*true', observation)
            next_match = re.search(r'"next_offset"\s*:\s*(\d+)', observation)
            if more and next_match:
                page_followups.append((key[0], int(next_match.group(1))))
        elif step.get("tool") == "documents_download":
            document_id = str((step.get("arguments") or {{}}).get("id"))
            if document_id in REQUIRED_READ_IDS and document_id not in discovered:
                blind_reads.append(document_id)
    check("required_search_discovery", not blind_reads,
          "every required read was discovered by an earlier search"
          if not blind_reads else f"blind direct reads={{sorted(set(blind_reads))}}")
    missing_pages = sorted(set(page_followups) - searches_seen)
    paging_complete = not missing_pages
    if PAGING_REQUIRED:
        check("paging_complete", paging_complete,
              "all result pages visited" if paging_complete else f"missing query/offset pages={{missing_pages}}")

    before = _by_id(_rows(initial_state, "dm_documents"))
    after = _rows(final_state, "dm_documents")
    created = [row for row in after if str(row.get("id")) not in before]
    deliverables = [row for row in created if row.get("name") == "firm-knowledge-response.md"]
    check("deliverable_filed_to_dms", bool(deliverables),
          f"{{len(deliverables)}} matching DMS deliverable(s) created")
    body = "\n".join(str(row.get("body") or "") for row in deliverables)
    body_lower = body.lower()
    missing_anchor_groups = [group for group in REQUIRED_ANCHOR_GROUPS
                             if not any(anchor.lower() in body_lower for anchor in group)]
    check("required_grounded_anchors", not missing_anchor_groups,
          "all determinate anchors present" if not missing_anchor_groups
          else f"missing anchor groups={{missing_anchor_groups}}")
    predicted = set(re.findall(r"\b\d{{4}}-\d{{5}}\b", body))
    true_positive = predicted & GOLD
    over_included = sorted(predicted - GOLD)
    missing = sorted(GOLD - predicted)
    precision = len(true_positive) / len(predicted) if predicted else (1.0 if not GOLD else 0.0)
    recall = len(true_positive) / len(GOLD) if GOLD else (1.0 if not predicted else 0.0)
    beta2 = 4.0
    f_beta = ((1 + beta2) * precision * recall / (beta2 * precision + recall)
              if precision + recall else 0.0)
    check("gold_set_complete", not missing, "all qualifying matters found" if not missing else f"missing={{missing}}")
    check("no_over_inclusion", not over_included,
          "no nonqualifying matters asserted" if not over_included else f"over_included={{over_included}}")

    changed_tables = []
    for table in set(initial_state) | set(final_state):
        if table in ("dm_documents", "audit_logs"):
            continue
        if _rows(initial_state, table) != _rows(final_state, table):
            changed_tables.append(table)
    check("no_offtask_table_changes", not changed_tables,
          "no collateral state change" if not changed_tables else f"changed={{sorted(changed_tables)}}")
    destroyed = [key for key in before if key not in _by_id(after)]
    check("no_documents_destroyed", not destroyed,
          "no DMS records destroyed" if not destroyed else f"destroyed={{destroyed}}")

    structural_names = {{"required_workflow_path", "required_documents_read",
                        "required_search_discovery", "deliverable_filed_to_dms", "no_offtask_table_changes",
                        "no_documents_destroyed", "required_grounded_anchors"}}
    if PAGING_REQUIRED:
        structural_names.add("paging_complete")
    structural_failed = [row["name"] for row in results
                         if row["name"] in structural_names and not row["passed"]]
    reward = 0.0 if structural_failed else f_beta
    failed = [row["name"] for row in results if not row["passed"]]
    return {{
        "task_id": {task_id!r},
        "passed": not failed,
        "reward": round(reward, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f_beta": round(f_beta, 4),
        "beta": 2.0,
        "over_included": over_included,
        "missing": missing,
        "all_determinate_pass": not missing and not over_included,
        "paging_complete": paging_complete,
        "missing_page_followups": missing_pages,
        "failed_conditions": failed,
        "assertions": results,
        "explanation": "All deterministic retrieval checks passed" if not failed else "Failed: " + ", ".join(failed),
    }}
'''


def practice_vcode(task_id: str, deliverables: list[str], criteria: list[dict],
                   required_read_ids: list[int]) -> str:
    """Grade DMS state and source-grounded criterion anchors with hard vetoes."""
    return rf'''"""Generated deterministic LAB practice verifier for {task_id}."""

DELIVERABLES = {deliverables!r}
CRITERIA = {criteria!r}
REQUIRED_READ_IDS = set({[str(value) for value in required_read_ids]!r})

def _rows(state, table):
    return state.get(table, []) if isinstance(state, dict) else []

def _by_id(rows):
    return {{str(row.get("id")): row for row in rows if isinstance(row, dict) and row.get("id") is not None}}

def _norm(value):
    import re as _re
    import unicodedata as _unicodedata
    value = _unicodedata.normalize("NFKC", str(value or "")).casefold()
    value = value.replace("\u00a0", " ").replace("–", "-").replace("—", "-")
    return _re.sub(r"\s+", " ", value).strip()

def _has(text, variants):
    import re as _re
    haystack = _norm(text)
    return any(needle and _re.search(r"(?<![\w])" + _re.escape(needle) + r"(?![\w])", haystack)
               for needle in (_norm(variant) for variant in variants))

def verify(initial_state, final_state, trace):
    results = []
    def check(name, passed, details):
        results.append({{"name": name, "passed": bool(passed), "details": details}})

    successful = [step for step in trace if step.get("ok") and step.get("tool") != "_final_answer"]
    tools = [step.get("tool") for step in successful]
    searches = [i for i, tool in enumerate(tools) if tool in ("documents_search", "documents_search_fulltext")]
    reads = [i for i, tool in enumerate(tools) if tool == "documents_download"]
    writes = [i for i, tool in enumerate(tools) if tool == "documents_create"]
    path_ok = bool(searches and reads and writes and min(searches) < min(reads) < min(writes))
    check("required_workflow_path", path_ok,
          "search -> full-body reads -> DMS filing" if path_ok else f"observed tools={{tools}}")
    read_ids = {{str((step.get("arguments") or {{}}).get("id")) for step in successful
                if step.get("tool") == "documents_download"}}
    missing_reads = sorted(REQUIRED_READ_IDS - read_ids)
    check("required_documents_read", not missing_reads,
          "all grounding documents read" if not missing_reads else f"missing={{missing_reads}}")
    discovered = set()
    blind_reads = []
    import re as _trace_re
    for step in successful:
        if step.get("tool") in ("documents_search", "documents_search_fulltext"):
            discovered.update(_trace_re.findall(r'"id"\s*:\s*(\d+)', str(step.get("observation") or "")))
        elif step.get("tool") == "documents_download":
            document_id = str((step.get("arguments") or {{}}).get("id"))
            if document_id in REQUIRED_READ_IDS and document_id not in discovered:
                blind_reads.append(document_id)
    check("required_search_discovery", not blind_reads,
          "every required read was discovered by an earlier search"
          if not blind_reads else f"blind direct reads={{sorted(set(blind_reads))}}")

    before = _by_id(_rows(initial_state, "dm_documents"))
    after = _rows(final_state, "dm_documents")
    created = [row for row in after if str(row.get("id")) not in before]
    by_name = {{name: [row for row in created if row.get("name") == name] for name in DELIVERABLES}}
    missing_files = [name for name, rows in by_name.items() if not rows]
    check("all_deliverables_filed_to_dms", not missing_files,
          "all deliverables filed" if not missing_files else f"missing={{missing_files}}")

    criterion_results = []
    for criterion in CRITERIA:
        targets = criterion.get("deliverables") or DELIVERABLES
        text = "\n".join(str(row.get("body") or "")
                         for name in targets for row in by_name.get(name, []))
        missing = [group for group in criterion["anchor_groups"] if not _has(text, group)]
        passed = not missing
        criterion_results.append({{"criterion_id": criterion["criterion_id"],
                                  "passed": passed, "missing_anchor_groups": missing}})
        check("criterion_" + str(criterion["criterion_id"]), passed,
              "source-grounded anchors present" if passed else f"missing={{missing}}")

    changed_tables = []
    for table in set(initial_state) | set(final_state):
        if table in ("dm_documents", "audit_logs"):
            continue
        if _rows(initial_state, table) != _rows(final_state, table):
            changed_tables.append(table)
    check("no_offtask_table_changes", not changed_tables,
          "no collateral state change" if not changed_tables else f"changed={{sorted(changed_tables)}}")
    destroyed = [key for key in before if key not in _by_id(after)]
    check("no_documents_destroyed", not destroyed,
          "no DMS records destroyed" if not destroyed else f"destroyed={{destroyed}}")
    undeclared = [row.get("name") for row in created if row.get("name") not in DELIVERABLES]
    check("no_undeclared_documents", not undeclared,
          "only declared deliverables created" if not undeclared else f"undeclared={{undeclared}}")

    criteria_passed = sum(row["passed"] for row in criterion_results)
    raw_fraction = criteria_passed / len(criterion_results) if criterion_results else 0.0
    structural = {{"required_workflow_path", "required_search_discovery", "required_documents_read",
                  "all_deliverables_filed_to_dms", "no_offtask_table_changes",
                  "no_documents_destroyed", "no_undeclared_documents"}}
    structural_failed = [row["name"] for row in results
                         if row["name"] in structural and not row["passed"]]
    grounding_failed = [row for row in criterion_results if not row["passed"]]
    # Grounding and fabrication-adjacent failures are hard vetoes: a polished
    # but unsupported deliverable never earns partial headline reward.
    reward = 0.0 if structural_failed or grounding_failed else 1.0
    failed = [row["name"] for row in results if not row["passed"]]
    return {{
        "task_id": {task_id!r},
        "passed": not failed and bool(criterion_results),
        "reward": reward,
        "raw_grounding_fraction": round(raw_fraction, 4),
        "criteria_passed": criteria_passed,
        "criteria_total": len(criterion_results),
        "grounding_veto_failed": bool(grounding_failed),
        "all_determinate_pass": bool(criterion_results) and not grounding_failed,
        "failed_conditions": failed,
        "criterion_results": criterion_results,
        "assertions": results,
        "explanation": "All deterministic state and grounding checks passed" if not failed
                       else "Failed: " + ", ".join(failed),
    }}
'''
