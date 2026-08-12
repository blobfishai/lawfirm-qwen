"""Deterministic verifier generators for M3 workflow tasks."""
from __future__ import annotations


def _common(task_id: str, body: str) -> str:
    return f'''"""Generated verifier for {task_id}."""

def _rows(state, table):
    return state.get(table, []) if isinstance(state, dict) else []

def _new(initial_state, final_state, table):
    before = {{str(row.get("id")) for row in _rows(initial_state, table)}}
    return [row for row in _rows(final_state, table) if str(row.get("id")) not in before]

def verify(initial_state, final_state, trace):
    checks = []
    def check(name, passed, details):
        checks.append({{"name": name, "passed": bool(passed), "details": details}})
    successful = [step for step in trace if step.get("ok") and step.get("tool") != "_final_answer"]
    tools = [step.get("tool") for step in successful]
{body}
    failed = [item["name"] for item in checks if not item["passed"]]
    return {{
        "task_id": {task_id!r}, "passed": not failed, "reward": 0.0 if failed else 1.0,
        "failed_conditions": failed, "assertions": checks,
        "explanation": "All deterministic workflow checks passed" if not failed else "Failed: " + ", ".join(failed),
    }}
'''


def efiling_vcode(task_id: str, case_id: int, event_type: str, document_name: str,
                  description: str) -> str:
    body = f'''    expected_path = ["efiling_cases_get", "efiling_filings_create", "efiling_nef_notices_list", "efiling_docket_entries_list"]
    cursor = 0
    for tool in tools:
        if cursor < len(expected_path) and tool == expected_path[cursor]:
            cursor += 1
    check("required_path", cursor == len(expected_path), f"observed={{tools}}")
    check("all_tools_succeeded", len(successful) == len([s for s in trace if s.get("tool") != "_final_answer"]), "no failed calls")

    filings = _new(initial_state, final_state, "ef_filings")
    matched = [row for row in filings if row.get("case_id") == {case_id!r}
               and row.get("event_type") == {event_type!r}
               and row.get("document_name") == {document_name!r}
               and row.get("status") == "filed"]
    check("filing_created", len(matched) == 1, f"matching filings={{len(matched)}}")
    filing_id = matched[0].get("id") if matched else None
    entries = _new(initial_state, final_state, "ef_docket_entries")
    docket = [row for row in entries if row.get("filing_id") == filing_id and row.get("description") == {description!r}]
    check("docket_entry_created", len(docket) == 1, f"matching entries={{len(docket)}}")
    notices = _new(initial_state, final_state, "ef_nef_notices")
    notice = [row for row in notices if row.get("filing_id") == filing_id and row.get("status") == "sent"]
    check("nef_generated", len(notice) == 1 and bool(notice[0].get("recipients")) if notice else False,
          f"matching notices={{len(notice)}}")
    read_side = _new(initial_state, final_state, "cl_docket_entries")
    check("read_side_updated", any(row.get("description") == {description!r} for row in read_side),
          "filing visible in CourtDock read side")
    allowed = {{"ef_filings", "ef_docket_entries", "ef_nef_notices", "cl_docket_entries", "audit_logs"}}
    changed = [table for table in set(initial_state) | set(final_state)
               if table not in allowed and _rows(initial_state, table) != _rows(final_state, table)]
    check("no_collateral_damage", not changed, f"changed={{changed}}")
'''
    return _common(task_id, body)


def deadline_vcode(task_id: str, due_date: str, summary: str, task_name: str) -> str:
    body = f'''    compute = [i for i, tool in enumerate(tools) if tool == "deadlines_compute"]
    calendar = [i for i, tool in enumerate(tools) if tool == "calendar_events_insert"]
    tasks = [i for i, tool in enumerate(tools) if tool == "tasks_create"]
    path = bool(compute and calendar and tasks and compute[0] < calendar[0] < tasks[0])
    check("compute_before_calendar_and_task", path, f"observed={{tools}}")
    observations = "\\n".join(str(step.get("observation") or "") for step in successful
                              if step.get("tool") == "deadlines_compute")
    check("computed_date_verified", {due_date!r} in observations and "Fed. R. Civ. P." in observations,
          "computed result carries date and rule citation")
    events = _new(initial_state, final_state, "ws_events")
    matching_events = [row for row in events if row.get("summary") == {summary!r}
                       and str(row.get("start_at", "")).startswith({due_date!r})]
    check("calendar_deadline_created", len(matching_events) == 1, f"matching events={{len(matching_events)}}")
    created_tasks = _new(initial_state, final_state, "pm_tasks")
    matching_tasks = [row for row in created_tasks if row.get("name") == {task_name!r}
                      and str(row.get("due_at", "")).startswith({due_date!r})]
    check("tickler_created", len(matching_tasks) == 1, f"matching tasks={{len(matching_tasks)}}")
    check("no_duplicate_writes", len(events) == 1 and len(created_tasks) == 1,
          f"events={{len(events)}} tasks={{len(created_tasks)}}")
    allowed = {{"ws_events", "pm_tasks", "audit_logs"}}
    changed = [table for table in set(initial_state) | set(final_state)
               if table not in allowed and _rows(initial_state, table) != _rows(final_state, table)]
    check("no_collateral_damage", not changed, f"changed={{changed}}")
'''
    return _common(task_id, body)


def esign_vcode(task_id: str, subject: str, document_name: str, binder_name: str,
                recipients: list[dict[str, str]]) -> str:
    recipient_pairs = [(item["email"], int(item["routingOrder"])) for item in recipients]
    body = f'''    create = [i for i, tool in enumerate(tools) if tool == "esign_envelopes_create"]
    send = [i for i, tool in enumerate(tools) if tool == "esign_envelopes_send"]
    polls = [i for i, tool in enumerate(tools) if tool == "esign_envelopes_get"]
    recipient_reads = [i for i, tool in enumerate(tools) if tool == "esign_recipients_list"]
    filing = [i for i, tool in enumerate(tools) if tool == "documents_create"]
    path = bool(create and send and len(polls) >= 4 and recipient_reads and filing
                and create[0] < send[0] < min(polls) < recipient_reads[-1] < filing[-1])
    check("required_closing_path", path, f"observed={{tools}}")
    envelopes = _new(initial_state, final_state, "es_envelopes")
    matched = [row for row in envelopes if row.get("email_subject") == {subject!r}
               and row.get("document_name") == {document_name!r} and row.get("status") == "completed"]
    check("envelope_completed", len(matched) == 1, f"matching envelopes={{len(matched)}}")
    envelope_id = matched[0].get("id") if matched else None
    all_recipients = _new(initial_state, final_state, "es_recipients")
    actual = sorted((row.get("email"), int(row.get("routing_order") or 0), row.get("status"))
                    for row in all_recipients if row.get("envelope_id") == envelope_id)
    expected = sorted((email, routing, "completed") for email, routing in {recipient_pairs!r})
    check("recipients_completed_in_order", actual == expected, f"actual={{actual}} expected={{expected}}")
    documents = _new(initial_state, final_state, "dm_documents")
    binders = [row for row in documents if row.get("name") == {binder_name!r}]
    binder_text = "\\n".join(str(row.get("body") or "") for row in binders).lower()
    check("closing_binder_filed", len(binders) == 1 and {document_name.lower()!r} in binder_text
          and "completed" in binder_text, f"matching binders={{len(binders)}}")
    allowed = {{"es_envelopes", "es_recipients", "es_events", "dm_documents", "audit_logs"}}
    changed = [table for table in set(initial_state) | set(final_state)
               if table not in allowed and _rows(initial_state, table) != _rows(final_state, table)]
    check("no_collateral_damage", not changed, f"changed={{changed}}")
'''
    return _common(task_id, body)
