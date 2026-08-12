#!/usr/bin/env python3
"""Append M3 e-filing, deadline, and eSignature workflows to world-v17."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from world.v18.verifiers import deadline_vcode, efiling_vcode, esign_vcode  # noqa: E402


DEFAULT_BASE = ROOT / "world" / "blobfish" / "world-v17.json"
DEFAULT_OUT = ROOT / "world" / "blobfish" / "world-v18.json"
DEFAULT_REPORT = ROOT / "world" / "v18" / "build-report.json"


EFILING_CASES = [
    (1, "answer_to_complaint", "northstar-answer.pdf", "Answer to Complaint"),
    (2, "motion", "aurelius-motion-to-compel.pdf", "Motion to Compel"),
    (3, "notice", "lumos-notice-of-appearance.pdf", "Notice of Appearance"),
    (1, "stipulation", "northstar-protective-order-stipulation.pdf", "Stipulation for Protective Order"),
    (2, "response", "aurelius-response.pdf", "Response to Motion"),
]

DEADLINE_CASES = [
    ("complaint_and_summons_served", "personal", "2026-08-14", "2026-09-04", "Northstar answer due", "File Northstar answer"),
    ("interrogatories_served", "electronic", "2026-08-12", "2026-09-11", "Aurelius interrogatory responses due", "Serve Aurelius interrogatory responses"),
    ("interrogatories_served", "mail", "2026-08-12", "2026-09-14", "Lumos interrogatory responses due", "Serve Lumos interrogatory responses"),
    ("requests_for_production_served", "electronic", "2026-08-14", "2026-09-14", "Northstar document responses due", "Serve Northstar document responses"),
    ("requests_for_production_served", "mail", "2026-08-14", "2026-09-16", "Aurelius document responses due", "Serve Aurelius document responses"),
]

ESIGN_CASES = [
    ("Settlement agreement signature", "northstar-settlement.pdf", "northstar-closing-binder.md", "client@example.com", "firm@example.com"),
    ("Stock purchase agreement signature", "aurelius-spa.pdf", "aurelius-closing-binder.md", "seller@example.com", "buyer@example.com"),
    ("Engagement letter signature", "lumos-engagement.pdf", "lumos-engagement-binder.md", "gc@example.com", "partner@example.com"),
    ("Consent order signature", "dunmore-consent-order.pdf", "dunmore-consent-binder.md", "agency@example.com", "company@example.com"),
    ("Credit amendment signature", "quorum-amendment.pdf", "quorum-amendment-binder.md", "borrower@example.com", "agent@example.com"),
]


def _efiling(index: int, values: tuple[Any, ...]) -> tuple[dict, dict]:
    case_id, event_type, document_name, description = values
    task_id = f"task_v18_ef_{index:03d}"
    args = [
        {"case_id": case_id},
        {"case_id": case_id, "event_type": event_type, "document_name": document_name,
         "document_mime_type": "application/pdf", "document_sha256": hashlib.sha256(document_name.encode()).hexdigest(),
         "description": description},
        {"case_id": case_id, "status": "sent", "limit": 20},
        {"case_id": case_id, "limit": 20},
    ]
    walk = ["efiling_cases_get", "efiling_filings_create", "efiling_nef_notices_list", "efiling_docket_entries_list"]
    task = {
        "task_id": task_id, "outcome_class": "eligible_action",
        "prompt": (f"Open CourtFile case {case_id}, file `{document_name}` as event `{event_type}` with description "
                   f"`{description}`, then confirm both the docket entry and sent NEF. The document is a PDF. "
                   "Do not report success before the filing-side records exist."),
        "goal": f"File and verify {description}", "required_tools": walk, "walk": walk,
        "reference_args": args, "method": "m3_efiling_workflow", "complexity": "medium",
        "steps": ["Open case", "Submit PDF under correct event", "Confirm NEF", "Confirm docket entry"],
        "tables_affected": ["ef_filings", "ef_docket_entries", "ef_nef_notices", "cl_docket_entries"],
        "effects": [{"table": "ef_filings", "op": "insert"}, {"table": "ef_docket_entries", "op": "insert"},
                    {"table": "ef_nef_notices", "op": "insert"}],
        "provenance": {"source": "CM/ECF official workflow documentation", "fidelity_ceiling": "no public common write API"},
        "difficulty_tier": "pending_triage", "acceptance_label": "admitted_deterministic_workflow",
    }
    verifier = {"task_id": task_id, "assertions": ["required_path", "filing_created", "docket_entry_created",
                "nef_generated", "read_side_updated", "no_collateral_damage"],
                "vcode": efiling_vcode(task_id, case_id, event_type, document_name, description),
                "generated_by": "world/v18/build.py"}
    return task, verifier


def _deadline(index: int, values: tuple[str, ...]) -> tuple[dict, dict]:
    trigger, service, trigger_date, due, summary, task_name = values
    task_id = f"task_v18_deadline_{index:03d}"
    walk = ["deadlines_compute", "calendar_events_insert", "tasks_create"]
    args = [
        {"trigger_event": trigger, "jurisdiction": "US-FEDERAL-CIVIL", "service_method": service, "trigger_date": trigger_date},
        {"calendarId": "docketing@simulated-firm.example", "summary": summary,
         "start_at": f"{due}T17:00:00Z", "end_at": f"{due}T17:30:00Z",
         "attendees": "docketing@simulated-firm.example"},
        {"matter_id": 1, "assignee_user_id": 1, "name": task_name, "due_at": due, "priority": "high"},
    ]
    task = {
        "task_id": task_id, "outcome_class": "eligible_action",
        "prompt": (f"The trigger `{trigger}` occurred on {trigger_date} by {service} service in a federal civil case. "
                   f"Use DeadlineRules, verify the cited result, create calendar event `{summary}`, and assign task "
                   f"`{task_name}` to user 1 on matter 1, both on the computed due date."),
        "goal": "Compute, calendar, and assign a verified federal deadline", "required_tools": walk,
        "walk": walk, "reference_args": args, "method": "m3_deadline_workflow", "complexity": "medium",
        "steps": ["Compute with cited rule", "Calendar exact date", "Create matching tickler"],
        "tables_affected": ["ws_events", "pm_tasks"], "effects": [{"table": "ws_events", "op": "insert"}, {"table": "pm_tasks", "op": "insert"}],
        "provenance": {"source": "Federal Rules of Civil Procedure", "rules": ["6", "12", "33", "34"]},
        "difficulty_tier": "pending_triage", "acceptance_label": "admitted_deterministic_computation",
    }
    verifier = {"task_id": task_id, "assertions": ["compute_before_calendar_and_task", "computed_date_verified",
                "calendar_deadline_created", "tickler_created", "no_duplicate_writes", "no_collateral_damage"],
                "vcode": deadline_vcode(task_id, due, summary, task_name), "generated_by": "world/v18/build.py"}
    return task, verifier


def _esign(index: int, values: tuple[str, ...]) -> tuple[dict, dict]:
    subject, document_name, binder_name, first, second = values
    task_id = f"task_v18_esign_{index:03d}"
    recipients = [
        {"name": "First Signer", "email": first, "recipientId": "1", "routingOrder": "1"},
        {"name": "Second Signer", "email": second, "recipientId": "2", "routingOrder": "2"},
    ]
    walk = ["esign_envelopes_create", "esign_envelopes_send"] + ["esign_envelopes_get"] * 4 + ["esign_recipients_list", "documents_create"]
    args = [
        {"accountId": "sim-account-001", "emailSubject": subject, "documentName": document_name,
         "recipients": json.dumps(recipients, separators=(",", ":")), "status": "created"},
        {"accountId": "sim-account-001", "envelopeId": "3", "status": "sent"},
        *[{"accountId": "sim-account-001", "envelopeId": "3"} for _ in range(4)],
        {"accountId": "sim-account-001", "envelopeId": "3"},
        {"folder_id": 1, "workspace_id": 1, "name": binder_name, "doc_class": "CLOSING_BINDER",
         "author": "closings@simulated-firm.example",
         "body": f"Closing binder record: {document_name} completed in routing order; {first} then {second}."},
    ]
    task = {
        "task_id": task_id, "outcome_class": "eligible_action",
        "prompt": (f"Create a draft SealPoint envelope for `{document_name}` with subject `{subject}`. Route first to "
                   f"{first}, then {second}; send it, poll until completed, verify recipient statuses, and file "
                   f"`{binder_name}` in MatterVault documenting completion. Do not file the binder early."),
        "goal": "Complete an ordered signature lifecycle and file the closing binder",
        "required_tools": walk, "walk": walk, "reference_args": args, "method": "m3_esign_closing_workflow",
        "complexity": "high", "steps": ["Create ordered envelope", "Send", "Await completion", "Verify signers", "File binder"],
        "tables_affected": ["es_envelopes", "es_recipients", "es_events", "dm_documents"],
        "effects": [{"table": "es_envelopes", "op": "insert"}, {"table": "es_recipients", "op": "insert"}, {"table": "dm_documents", "op": "insert"}],
        "provenance": {"source": "Docusign eSignature REST API v2.1 official Swagger"},
        "difficulty_tier": "pending_triage", "acceptance_label": "admitted_deterministic_workflow",
    }
    verifier = {"task_id": task_id, "assertions": ["required_closing_path", "envelope_completed",
                "recipients_completed_in_order", "closing_binder_filed", "no_collateral_damage"],
                "vcode": esign_vcode(task_id, subject, document_name, binder_name, recipients),
                "generated_by": "world/v18/build.py"}
    return task, verifier


def build(base: Path, out: Path, report_path: Path) -> dict[str, Any]:
    raw = json.loads(base.read_text("utf-8"))
    world = raw.get("world", raw)
    existing = {task["task_id"] for task in world["tasks"]}
    pairs = [*(_efiling(i, row) for i, row in enumerate(EFILING_CASES, 1)),
             *(_deadline(i, row) for i, row in enumerate(DEADLINE_CASES, 1)),
             *(_esign(i, row) for i, row in enumerate(ESIGN_CASES, 1))]
    for task, verifier in pairs:
        if task["task_id"] in existing:
            raise RuntimeError(f"duplicate task id {task['task_id']}")
        world["tasks"].append(task)
        world["verifiers"].append(verifier)
        existing.add(task["task_id"])
    world["version"] = 18
    world["world_id"] = "legal-agent-simulation-world-v18"
    world["lineage"] = {"base": str(base.relative_to(ROOT)) if base.is_relative_to(ROOT) else str(base),
                        "compiler": "world/v18/build.py", "systems_added": ["CourtFile ECF", "DeadlineRules", "SealPoint eSign"]}
    payload = json.dumps(raw, ensure_ascii=False, separators=(",", ":")) + "\n"
    out.parent.mkdir(parents=True, exist_ok=True)
    temporary = out.with_suffix(out.suffix + ".tmp")
    temporary.write_text(payload, "utf-8")
    temporary.replace(out)
    report = {"schema_version": 1, "base_tasks": len(world["tasks"]) - 15,
              "added": {"efiling": 5, "deadlines": 5, "esign": 5}, "total_tasks": len(world["tasks"]),
              "world_sha256": hashlib.sha256(payload.encode()).hexdigest()}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, default=DEFAULT_BASE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = build(args.base, args.out, args.report)
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
