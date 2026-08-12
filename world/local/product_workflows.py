"""Deterministic implementations for legal product state machines.

The ordinary v3 executor handles CRUD-shaped APIs. These operations are separate
because one call changes several records (CM/ECF), derives dates from published rules
(DeadlineRules), or advances a lifecycle (Docusign). Dispatch is by ``op.kind`` from
the contract, never by tool name.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
import json
import sqlite3
from typing import Any


EPOCH = "2026-08-12T16:00:00Z"


def _missing(op: dict[str, Any], args: dict[str, Any], name: str) -> tuple[bool, str] | None:
    missing = [key for key in op.get("required", []) if args.get(key) in (None, "")]
    if not missing:
        return None
    joined = ", ".join(f"'{key}'" for key in missing)
    return False, (
        f"TypeError: {name}() missing {len(missing)} required positional "
        f"argument{'s' if len(missing) != 1 else ''}: {joined}"
    )


def _row(connection: sqlite3.Connection, query: str, values: tuple[Any, ...]) -> dict[str, Any] | None:
    cursor = connection.execute(query, values)
    value = cursor.fetchone()
    if value is None:
        return None
    return dict(zip((item[0] for item in cursor.description), value))


def _rows(connection: sqlite3.Connection, query: str, values: tuple[Any, ...]) -> list[dict[str, Any]]:
    cursor = connection.execute(query, values)
    columns = [item[0] for item in cursor.description]
    return [dict(zip(columns, value)) for value in cursor.fetchall()]


def _json(value: Any) -> str:
    return json.dumps(value, default=str, sort_keys=True)


def _efiling_case_get(connection, op, args, name):
    error = _missing(op, args, name)
    if error:
        return error
    case = _row(connection, 'SELECT * FROM "ef_cases" WHERE id = ?', (args["case_id"],))
    if case is None:
        return False, _json({"error": "CASE_NOT_FOUND", "message": "No CM/ECF case matched case_id."})
    return True, _json({"case": case})


def _efiling_create(connection, op, args, name):
    error = _missing(op, args, name)
    if error:
        return error
    case = _row(connection, 'SELECT * FROM "ef_cases" WHERE id = ?', (args["case_id"],))
    if case is None:
        return False, _json({"error": "CASE_NOT_FOUND", "message": "No CM/ECF case matched case_id."})
    event_type = str(args["event_type"])
    if event_type not in set(op.get("allowed_event_types", [])):
        return False, _json({"error": "INVALID_EVENT_TYPE", "message": f"{event_type!r} is not available for this civil case."})
    filename = str(args["document_name"])
    mime_type = str(args["document_mime_type"])
    if not filename.lower().endswith(".pdf") or mime_type != "application/pdf":
        return False, _json({"error": "DOCUMENT_FORMAT_REJECTED", "message": "CM/ECF filing documents must be submitted as PDF."})
    description = str(args.get("description") or event_type.replace("_", " ").title())
    filed_at = str(args.get("filed_at") or EPOCH)
    cursor = connection.execute(
        """INSERT INTO ef_filings
           (case_id,event_type,document_name,document_mime_type,document_sha256,description,status,filed_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (case["id"], event_type, filename, mime_type, args.get("document_sha256"), description, "filed", filed_at),
    )
    filing_id = cursor.lastrowid
    next_number = int(connection.execute(
        "SELECT COALESCE(MAX(entry_number),0)+1 FROM ef_docket_entries WHERE case_id=?", (case["id"],)
    ).fetchone()[0])
    cursor = connection.execute(
        "INSERT INTO ef_docket_entries (case_id,filing_id,entry_number,date_filed,description) VALUES (?,?,?,?,?)",
        (case["id"], filing_id, next_number, filed_at[:10], description),
    )
    docket_entry_id = cursor.lastrowid
    cursor = connection.execute(
        """INSERT INTO ef_nef_notices
           (case_id,filing_id,docket_entry_id,generated_at,recipients,status) VALUES (?,?,?,?,?,?)""",
        (case["id"], filing_id, docket_entry_id, filed_at, case.get("notice_recipients"), "sent"),
    )
    nef_id = cursor.lastrowid
    linked = case.get("court_docket_id")
    if linked is not None:
        try:
            court_entry = int(connection.execute(
                "SELECT COALESCE(MAX(entry_number),0)+1 FROM cl_docket_entries WHERE docket_id=?", (linked,)
            ).fetchone()[0])
            connection.execute(
                "INSERT INTO cl_docket_entries (docket_id,entry_number,date_filed,description) VALUES (?,?,?,?)",
                (linked, court_entry, filed_at[:10], description),
            )
        except sqlite3.Error:
            pass
    connection.commit()
    return True, _json({"case_id": case["id"], "docket_entry_id": docket_entry_id,
                        "entry_number": next_number, "filed_at": filed_at,
                        "filing_id": filing_id, "nef_notice_id": nef_id, "status": "filed"})


def _nth_weekday(year: int, month: int, weekday: int, occurrence: int) -> date:
    first = date(year, month, 1)
    return first + timedelta(days=(weekday - first.weekday()) % 7 + 7 * (occurrence - 1))


def _last_weekday(year: int, month: int, weekday: int) -> date:
    last = date(year, month, calendar.monthrange(year, month)[1])
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def _federal_holidays(year: int) -> set[date]:
    fixed = {date(year, 1, 1), date(year, 6, 19), date(year, 7, 4),
             date(year, 11, 11), date(year, 12, 25)}
    holidays = fixed | {
        _nth_weekday(year, 1, calendar.MONDAY, 3), _nth_weekday(year, 2, calendar.MONDAY, 3),
        _last_weekday(year, 5, calendar.MONDAY), _nth_weekday(year, 9, calendar.MONDAY, 1),
        _nth_weekday(year, 10, calendar.MONDAY, 2), _nth_weekday(year, 11, calendar.THURSDAY, 4),
    }
    for holiday in list(fixed):
        if holiday.weekday() == calendar.SATURDAY:
            holidays.add(holiday - timedelta(days=1))
        elif holiday.weekday() == calendar.SUNDAY:
            holidays.add(holiday + timedelta(days=1))
    return holidays


def _roll_rule_6(day: date) -> date:
    while day.weekday() >= calendar.SATURDAY or day in _federal_holidays(day.year):
        day += timedelta(days=1)
    return day


def _deadline_compute(connection, op, args, name):
    error = _missing(op, args, name)
    if error:
        return error
    if args["jurisdiction"] != "US-FEDERAL-CIVIL":
        return False, _json({"error": "UNSUPPORTED_JURISDICTION", "message": "Only US-FEDERAL-CIVIL rules are installed in this deterministic pack."})
    rule = _row(connection, "SELECT * FROM deadline_rules WHERE jurisdiction=? AND trigger_event=?",
                (args["jurisdiction"], args["trigger_event"]))
    if rule is None:
        return False, _json({"error": "UNSUPPORTED_TRIGGER_EVENT", "message": f"No verified rule is installed for {args['trigger_event']!r}."})
    try:
        trigger = date.fromisoformat(str(args["trigger_date"]))
    except ValueError:
        return False, _json({"error": "INVALID_DATE", "message": "trigger_date must be YYYY-MM-DD."})
    service_method = str(args["service_method"])
    allowed = {"personal", "electronic", "mail", "clerk", "consent"}
    if service_method not in allowed:
        return False, _json({"error": "INVALID_SERVICE_METHOD", "message": sorted(allowed)})
    extension = 3 if int(rule.get("rule_6d_applies") or 0) and service_method in {"mail", "clerk", "consent"} else 0
    unadjusted = trigger + timedelta(days=int(rule["base_days"]) + extension)
    due = _roll_rule_6(unadjusted)
    return True, _json({"deadlines": [{"date": due.isoformat(), "deadline_type": rule["deadline_type"],
                                        "rule_citation": rule["rule_citation"], "source_url": rule["source_url"]}],
                        "jurisdiction": args["jurisdiction"], "service_extension_days": extension,
                        "trigger_date": trigger.isoformat(), "trigger_event": args["trigger_event"],
                        "unadjusted_date": unadjusted.isoformat()})


def _parse_recipients(value: Any) -> list[dict[str, Any]]:
    parsed = json.loads(value) if isinstance(value, str) else value
    if not isinstance(parsed, list) or not parsed:
        raise ValueError("recipients must be a non-empty JSON array")
    result = []
    for index, item in enumerate(parsed, 1):
        if not isinstance(item, dict) or not item.get("name") or not item.get("email"):
            raise ValueError("each recipient requires name and email")
        result.append({"name": str(item["name"]), "email": str(item["email"]),
                       "recipient_id": str(item.get("recipientId") or index),
                       "routing_order": int(item.get("routingOrder") or index)})
    return result


def _docusign_summary(envelope: dict[str, Any]) -> dict[str, Any]:
    return {"envelopeId": str(envelope["id"]), "status": envelope["status"],
            "statusDateTime": envelope.get("completed_at") or envelope.get("sent_at") or envelope["created_at"],
            "uri": f"/envelopes/{envelope['id']}"}


def _docusign_create(connection, op, args, name):
    error = _missing(op, args, name)
    if error:
        return error
    try:
        recipients = _parse_recipients(args["recipients"])
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        return False, _json({"errorCode": "INVALID_RECIPIENTS", "message": str(exc)})
    status = str(args.get("status") or "created")
    if status not in {"created", "sent"}:
        return False, _json({"errorCode": "INVALID_REQUEST_PARAMETER", "message": "status must be created or sent"})
    cursor = connection.execute(
        """INSERT INTO es_envelopes
           (account_id,email_subject,status,document_name,created_at,sent_at,completed_at,current_routing_order,poll_count)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (args["accountId"], args["emailSubject"], status, args["documentName"], EPOCH,
         EPOCH if status == "sent" else None, None, min(item["routing_order"] for item in recipients), 0),
    )
    envelope_id = cursor.lastrowid
    for recipient in recipients:
        connection.execute(
            "INSERT INTO es_recipients (envelope_id,name,email,recipient_id,routing_order,status) VALUES (?,?,?,?,?,?)",
            (envelope_id, recipient["name"], recipient["email"], recipient["recipient_id"],
             recipient["routing_order"], "sent" if status == "sent" else "created"),
        )
    connection.execute("INSERT INTO es_events (envelope_id,event_type,event_at,detail) VALUES (?,?,?,?)",
                       (envelope_id, "sent" if status == "sent" else "created", EPOCH, args["emailSubject"]))
    connection.commit()
    envelope = _row(connection, "SELECT * FROM es_envelopes WHERE id=?", (envelope_id,))
    return True, _json(_docusign_summary(envelope))


def _get_envelope(connection, args):
    return _row(connection, "SELECT * FROM es_envelopes WHERE id=? AND account_id=?",
                (args.get("envelopeId"), args.get("accountId")))


def _docusign_update(connection, op, args, name):
    error = _missing(op, args, name)
    if error:
        return error
    envelope = _get_envelope(connection, args)
    if envelope is None:
        return False, _json({"errorCode": "ENVELOPE_DOES_NOT_EXIST", "message": "Envelope not found."})
    if args["status"] != "sent":
        return False, _json({"errorCode": "INVALID_REQUEST_PARAMETER", "message": "Only status=sent is supported."})
    if envelope["status"] != "created":
        return False, _json({"errorCode": "ENVELOPE_INVALID_STATUS", "message": "Only a draft envelope can be sent."})
    if not connection.execute("SELECT COUNT(*) FROM es_recipients WHERE envelope_id=?", (envelope["id"],)).fetchone()[0]:
        return False, _json({"errorCode": "ENVELOPE_HAS_NO_RECIPIENTS", "message": "Envelope has no recipients."})
    connection.execute("UPDATE es_envelopes SET status='sent',sent_at=? WHERE id=?", (EPOCH, envelope["id"]))
    connection.execute("UPDATE es_recipients SET status='sent' WHERE envelope_id=? AND status='created'", (envelope["id"],))
    connection.execute("INSERT INTO es_events (envelope_id,event_type,event_at,detail) VALUES (?,?,?,?)",
                       (envelope["id"], "sent", EPOCH, "Envelope sent in routing order"))
    connection.commit()
    return True, _json({"envelopeId": str(envelope["id"]), "status": "sent"})


def _advance_envelope(connection, envelope):
    if envelope["status"] in {"created", "completed", "voided"}:
        return envelope
    pending = _rows(connection, "SELECT * FROM es_recipients WHERE envelope_id=? AND status!='completed' ORDER BY routing_order,id", (envelope["id"],))
    if not pending:
        connection.execute("UPDATE es_envelopes SET status='completed',completed_at=?,poll_count=poll_count+1 WHERE id=?", (EPOCH, envelope["id"]))
    else:
        routing = min(int(item["routing_order"]) for item in pending)
        active = [item for item in pending if int(item["routing_order"]) == routing]
        if any(item["status"] != "delivered" for item in active):
            connection.execute("UPDATE es_recipients SET status='delivered' WHERE envelope_id=? AND routing_order=?", (envelope["id"], routing))
            connection.execute("UPDATE es_envelopes SET status='delivered',poll_count=poll_count+1 WHERE id=?", (envelope["id"],))
        else:
            connection.execute("UPDATE es_recipients SET status='completed' WHERE envelope_id=? AND routing_order=?", (envelope["id"], routing))
            later = connection.execute("SELECT MIN(routing_order) FROM es_recipients WHERE envelope_id=? AND status!='completed'", (envelope["id"],)).fetchone()[0]
            if later is None:
                connection.execute("UPDATE es_envelopes SET status='completed',completed_at=?,poll_count=poll_count+1 WHERE id=?", (EPOCH, envelope["id"]))
            else:
                connection.execute("UPDATE es_envelopes SET status='sent',current_routing_order=?,poll_count=poll_count+1 WHERE id=?", (later, envelope["id"]))
    connection.commit()
    return _row(connection, "SELECT * FROM es_envelopes WHERE id=?", (envelope["id"],))


def _docusign_get(connection, op, args, name):
    error = _missing(op, args, name)
    if error:
        return error
    envelope = _get_envelope(connection, args)
    if envelope is None:
        return False, _json({"errorCode": "ENVELOPE_DOES_NOT_EXIST", "message": "Envelope not found."})
    if op.get("advance_lifecycle"):
        envelope = _advance_envelope(connection, envelope)
    result = _docusign_summary(envelope)
    result.update({"emailSubject": envelope["email_subject"], "createdDateTime": envelope["created_at"]})
    if envelope.get("sent_at"):
        result["sentDateTime"] = envelope["sent_at"]
    if envelope.get("completed_at"):
        result["completedDateTime"] = envelope["completed_at"]
    return True, _json(result)


def _docusign_recipients(connection, op, args, name):
    error = _missing(op, args, name)
    if error:
        return error
    envelope = _get_envelope(connection, args)
    if envelope is None:
        return False, _json({"errorCode": "ENVELOPE_DOES_NOT_EXIST", "message": "Envelope not found."})
    recipients = _rows(connection, "SELECT * FROM es_recipients WHERE envelope_id=? ORDER BY routing_order,id", (envelope["id"],))
    return True, _json({"signers": [{"email": item["email"], "name": item["name"],
                                      "recipientId": item["recipient_id"], "routingOrder": str(item["routing_order"]),
                                      "status": item["status"]} for item in recipients]})


def _docusign_recipient_complete(connection, op, args, name):
    error = _missing(op, args, name)
    if error:
        return error
    envelope = _get_envelope(connection, args)
    if envelope is None:
        return False, _json({"errorCode": "ENVELOPE_DOES_NOT_EXIST", "message": "Envelope not found."})
    recipient = _row(connection, "SELECT * FROM es_recipients WHERE envelope_id=? AND recipient_id=?",
                     (envelope["id"], str(args["recipientId"])))
    if recipient is None:
        return False, _json({"errorCode": "RECIPIENT_NOT_FOUND", "message": "Recipient not found."})
    minimum = connection.execute("SELECT MIN(routing_order) FROM es_recipients WHERE envelope_id=? AND status!='completed'", (envelope["id"],)).fetchone()[0]
    if minimum is not None and int(recipient["routing_order"]) != int(minimum):
        return False, _json({"errorCode": "RECIPIENT_ROUTING_ORDER_INVALID", "message": "A later routing-order recipient cannot complete before the active recipient."})
    connection.execute("UPDATE es_recipients SET status='completed' WHERE id=?", (recipient["id"],))
    connection.commit()
    envelope = _advance_envelope(connection, envelope)
    return True, _json({"envelopeId": str(envelope["id"]), "recipientId": str(args["recipientId"]), "status": "completed"})


LEDES_1998B_FIELDS = (
    "INVOICE_DATE", "INVOICE_NUMBER", "CLIENT_ID", "LAW_FIRM_MATTER_ID",
    "INVOICE_TOTAL", "BILLING_START_DATE", "BILLING_END_DATE",
    "INVOICE_DESCRIPTION", "LINE_ITEM_NUMBER", "EXP/FEE/INV_ADJ_TYPE",
    "LINE_ITEM_NUMBER_OF_UNITS", "LINE_ITEM_ADJUSTMENT_AMOUNT",
    "LINE_ITEM_TOTAL", "LINE_ITEM_DATE", "LINE_ITEM_TASK_CODE",
    "LINE_ITEM_EXPENSE_CODE", "LINE_ITEM_ACTIVITY_CODE", "TIMEKEEPER_ID",
    "LINE_ITEM_DESCRIPTION", "LAW_FIRM_ID", "LINE_ITEM_UNIT_COST",
    "TIMEKEEPER_NAME", "TIMEKEEPER_CLASSIFICATION", "CLIENT_MATTER_ID",
)


def _ledes_value(value: object) -> str:
    return str(value if value is not None else "").replace("|", " ").replace("\r", " ").replace("\n", " ")


def _ledes_date(value: object) -> str:
    return _ledes_value(value).split("T", 1)[0].replace("-", "")


def _ledes_submit(connection, op, args, name):
    error = _missing(op, args, name)
    if error:
        return error
    invoice = _row(connection, "SELECT * FROM eb_invoices WHERE id=?", (args.get("id"),))
    if invoice is None:
        return False, "ERROR 404: invoice not found"
    lines = _rows(connection, "SELECT * FROM eb_invoice_lines WHERE invoice_id=? ORDER BY id", (invoice["id"],))
    if not lines:
        return False, "ERROR 422: invoice has no LEDES line items"
    output = ["LEDES1998B[]", "|".join(LEDES_1998B_FIELDS) + "|"]
    invoice_date = _ledes_date(invoice.get("submitted_at") or invoice.get("billing_end"))
    for number, line in enumerate(lines, 1):
        row = (
            invoice_date,
            invoice.get("invoice_number"),
            invoice.get("client_matter_id"),
            invoice.get("matter_number"),
            f"{float(invoice.get('total') or 0):.2f}",
            _ledes_date(invoice.get("billing_start")),
            _ledes_date(invoice.get("billing_end")),
            "Legal services",
            number,
            "F",
            f"{float(line.get('hours') or 0):.2f}",
            "0.00",
            f"{float(line.get('amount') or 0):.2f}",
            _ledes_date(line.get("line_date")),
            line.get("task_code"),
            "",
            line.get("activity_code"),
            f"TK-{line.get('id')}",
            line.get("narrative"),
            "SIMULATED-FIRM",
            f"{float(line.get('rate') or 0):.2f}",
            line.get("timekeeper"),
            "ATTY",
            invoice.get("client_matter_id"),
        )
        output.append("|".join(_ledes_value(value) for value in row) + "|")
    connection.execute(
        "UPDATE eb_invoices SET status='submitted', submitted_at=? WHERE id=?",
        (EPOCH, invoice["id"]),
    )
    connection.commit()
    return True, "\n".join(output) + "\n"


SPECIAL = {
    "efiling_case_get": _efiling_case_get,
    "efiling_create": _efiling_create,
    "deadline_compute": _deadline_compute,
    "docusign_create": _docusign_create,
    "docusign_update": _docusign_update,
    "docusign_get": _docusign_get,
    "docusign_recipients": _docusign_recipients,
    "docusign_recipient_complete": _docusign_recipient_complete,
    "ledes_submit": _ledes_submit,
}


def execute_special(connection: sqlite3.Connection, op: dict[str, Any], args: dict[str, Any], name: str) -> tuple[bool, str] | None:
    implementation = SPECIAL.get(op.get("kind"))
    return implementation(connection, op, args, name) if implementation else None
