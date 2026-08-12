"""v3 dialect layer — wraps mock-tool outputs in each REAL product's response
envelope and translates the real APIs' external parameter names to the
internal executor names (contracts carry `dialect`, `param_map`, `field_map`).

Envelopes mirrored (per the API docs cited in each contract):
  clio           GET list  -> {"data": [...], "meta": {"paging": {}, "records": N}}
                 GET one   -> {"data": {...}}         writes -> {"data": {...}}
  courtlistener  list/search -> {"count": N|count-URL, "next": null, "previous": null, "results": [...]}
                 get       -> the resource object (with `resource_uri`)
  imanage        list/search -> {"data": {"results": [...], "total": N}}
                 get/write -> {"data": {...}}
  relativity     query/search -> {"Objects": [...], "TotalCount": N, "CurrentStartIndex": 0}
                 get       -> {"ArtifactID": id, ...}
  ledes          rows re-keyed to LEDES 1998B field names via field_map
  google         Sheets values {range, majorDimension, values[][]} · Drive file
                 resources {kind: drive#file} · Gmail message resources
                 {id, threadId, labelIds, snippet, payload.headers} · Calendar
                 {kind: calendar#events, items}
"""
from __future__ import annotations

import base64
import email.policy
import json
from email.parser import BytesParser
from urllib.parse import urlencode


def encode_cursor(offset: int) -> str:
    """Opaque, deterministic cursor shared by cursor-based mock dialects."""
    return base64.urlsafe_b64encode(f"offset:{int(offset)}".encode()).decode().rstrip("=")


def decode_cursor(value: object) -> int | None:
    if value in (None, ""):
        return 0
    try:
        text = str(value)
        raw = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4)).decode()
        prefix, number = raw.split(":", 1)
        if prefix != "offset":
            return None
        offset = int(number)
        return offset if offset >= 0 else None
    except (ValueError, UnicodeDecodeError):
        return None


def _path_get(value: object, path: str) -> tuple[bool, object]:
    """Read a dotted request path without confusing absent and null values."""
    current = value
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        if isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
            continue
        return False, None
    return True, current


def _request_transform(kind: str | None, value: object) -> object:
    if kind == "invert_bool":
        return not bool(value)
    if kind in {"first_email", "first_phone", "first_name"}:
        if not isinstance(value, list) or not value:
            return None
        first = value[0]
        if not isinstance(first, dict):
            return first
        key = {"first_email": "address", "first_phone": "number", "first_name": "name"}[kind]
        return first.get(key)
    if kind == "ids_csv":
        if not isinstance(value, list):
            return value
        return ",".join(
            str(item.get("id") or item.get("identifier") or item.get("value") or "")
            if isinstance(item, dict) else str(item)
            for item in value
        )
    if kind == "emails_csv":
        if not isinstance(value, list):
            return value
        return ",".join(
            str(item.get("email") or "") if isinstance(item, dict) else str(item)
            for item in value
        )
    if kind == "first_document_name":
        if isinstance(value, list) and value and isinstance(value[0], dict):
            return value[0].get("name")
        return None
    if kind in {"imanage_document_id", "imanage_container_id"}:
        text = str(value)
        if "!" in text:
            text = text.split("!", 1)[1]
        if kind == "imanage_document_id" and "." in text:
            text = text.split(".", 1)[0]
        try:
            return int(text)
        except ValueError:
            return text
    if kind == "json":
        return json.dumps(value, sort_keys=True, separators=(",", ":"))
    if kind == "first_cell":
        if isinstance(value, list) and value:
            first = value[0]
            if isinstance(first, list) and first:
                return first[0]
            return first
        return None
    return value


def _gmail_raw_args(body: object) -> dict:
    """Decode Gmail's documented Message.raw base64url MIME request."""
    if not isinstance(body, dict) or not isinstance(body.get("raw"), str):
        return {}
    raw = body["raw"]
    try:
        decoded = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
        message = BytesParser(policy=email.policy.default).parsebytes(decoded)
    except (ValueError, TypeError):
        return {}
    payload = message.get_body(preferencelist=("plain",)) if message.is_multipart() else message
    try:
        content = payload.get_content() if payload is not None else ""
    except (KeyError, UnicodeDecodeError):
        content = ""
    return {
        "from_addr": str(message.get("From") or ""),
        "to_addr": str(message.get("To") or ""),
        "subject": str(message.get("Subject") or ""),
        "body": str(content),
    }


def translate_args(tool: dict, args: dict) -> dict:
    """External (real-API) parameter names -> internal executor names."""
    pm = tool.get("param_map") or {}
    out = {}
    for k, v in (args or {}).items():
        out[pm.get(k, k)] = v

    # Contract write tools expose the vendor's real nested request body.  This
    # declarative adapter maps it onto the compact relational storage model;
    # the public MCP schema remains vendor-shaped while legacy task state stays
    # stable during migration.
    request_map = tool.get("request_map") or {}
    request_transforms = tool.get("request_transforms") or {}
    for source, destinations in request_map.items():
        found, value = _path_get(args, source)
        if not found:
            continue
        value = _request_transform(request_transforms.get(source), value)
        for destination in destinations if isinstance(destinations, list) else [destinations]:
            if destination:
                out[str(destination)] = value
    for key, value in (tool.get("request_defaults") or {}).items():
        out.setdefault(key, value)
    if tool.get("request_adapter") == "gmail_raw":
        out.update(_gmail_raw_args(args.get("body")))
    dialect = tool.get("_dialect")
    if dialect == "clio" and args.get("page_token") not in (None, ""):
        offset = decode_cursor(args["page_token"])
        out["offset"] = offset if offset is not None else -1
    elif dialect == "courtlistener" and args.get("page") not in (None, ""):
        try:
            page = max(1, int(args["page"]))
            out["offset"] = (page - 1) * max(
                1, int(out.get("limit") or args.get("page_size") or args.get("limit") or 20)
            )
        except (TypeError, ValueError):
            out["offset"] = -1
    elif dialect == "courtlistener" and args.get("cursor") not in (None, ""):
        offset = decode_cursor(args["cursor"])
        out["offset"] = offset if offset is not None else -1
    elif dialect == "google" and args.get("pageToken") not in (None, ""):
        offset = decode_cursor(args["pageToken"])
        out["offset"] = offset if offset is not None else -1
    elif dialect == "relativity" and args.get("start") not in (None, ""):
        try:
            out["offset"] = max(0, int(args["start"]) - 1)
        except (TypeError, ValueError):
            out["offset"] = -1
    if args.get("pageSize") not in (None, ""):
        out["limit"] = args["pageSize"]
    if dialect == "courtlistener" and args.get("page_size") not in (None, ""):
        out["limit"] = args["page_size"]
    if dialect == "relativity" and args.get("length") not in (None, ""):
        out["limit"] = args["length"]
    # Google Sheets: real range syntax "Sheet1!A1" splits into internal fields
    if tool.get("name", "").startswith("sheets_values") and isinstance(out.get("range"), str):
        rng = out.pop("range")
        if "!" in rng:
            sheet, cell = rng.split("!", 1)
            out.setdefault("sheet_name", sheet)
            out.setdefault("cell_range", cell)
        else:
            out.setdefault("cell_range", rng)
    return out


def _rekey(row: dict, field_map: dict) -> dict:
    return {field_map.get(k, k): v for k, v in row.items()}


def _without_none(row: dict) -> dict:
    return {key: value for key, value in row.items() if value is not None}


def _clio_row(name: str, value: dict) -> dict:
    """Translate compact storage columns to Clio's documented wire scalars."""
    row = dict(value)
    if name.startswith("contacts_") and "is_client" in row:
        row["is_client"] = bool(row["is_client"])
    if name.startswith("matters_") and "status" in row:
        row["status"] = {
            "open": "Open", "pending": "Pending", "closed": "Closed",
        }.get(str(row["status"]).lower(), row["status"])
    if name.startswith("matters_") and "number" in row:
        raw_number = str(row.get("number") or "0")
        row["display_number"] = raw_number
        try:
            row["number"] = int(raw_number.split("-", 1)[0])
        except ValueError:
            row["number"] = 0
    if name.startswith("bills_") and "state" in row:
        row["state"] = {
            "issued": "awaiting_payment", "overdue": "awaiting_payment",
            "cancelled": "void", "approved": "awaiting_payment",
            "open": "draft",
        }.get(str(row["state"]).lower(), str(row["state"]).lower())
    if name == "bill_line_items_list" and "kind" in row:
        row["kind"] = {"time": "Service", "expense": "Expense",
                       "adjustment": "Service"}.get(
            str(row["kind"]).lower(), row["kind"]
        )
    if name.startswith("calendar_entries_") and "id" in row:
        row["id"] = str(row["id"])
    if name.startswith("communications_"):
        row["type"] = {
            "email": "EmailCommunication", "call": "PhoneCommunication",
            "phone": "PhoneCommunication",
            "conformance": "EmailCommunication",
        }.get(str(row.get("type", "")).lower(), row.get("type"))
        for field in ("senders", "receivers"):
            if field in row and not isinstance(row[field], list):
                row[field] = [
                    {"identifier": item.strip(), "name": item.strip(), "type": "Person"}
                    for item in str(row[field] or "").split(",") if item.strip()
                ]
    if name.startswith("contacts_") and row.get("type") not in {"Company", "Person"}:
        row["type"] = "Company"
    if name.startswith("tasks_") and "priority" in row:
        row["priority"] = str(row["priority"]).title()
    if name.startswith("tasks_") and "status" in row:
        row["status"] = {"open": "pending", "completed": "complete"}.get(
            str(row["status"]).lower(), str(row["status"]).lower()
        )
    if name.startswith("time_entries_") and "billed" in row:
        row["billed"] = bool(row["billed"])
    if name == "users_list" and "enabled" in row:
        row["enabled"] = bool(row["enabled"])
    if name == "practice_areas_list":
        lowered = str(row.get("name") or "").lower()
        categories = (
            ("antitrust", "anti_trust_and_competition"),
            ("arbitration", "mediation_and_arbitration"),
            ("banking", "banking_and_finance"),
            ("bankruptcy", "bankruptcy"),
            ("capital markets", "securities_and_mergers_and_acquisitions"),
            ("commercial contracts", "contracts"),
            ("corporate governance", "business_formation_and_compliance"),
            ("m&a", "securities_and_mergers_and_acquisitions"),
            ("privacy", "privacy_and_information_security"),
            ("employment", "employment_and_labor"),
            ("ip litigation", "intellectual_property"),
            ("commercial litigation", "commercial_litigation"),
            ("real estate", "real_estate"),
            ("tax", "tax"),
        )
        row["category"] = next(
            (category for needle, category in categories if needle in lowered),
            "general_practice",
        )
    return _without_none(row)


def _imanage_document(row: dict) -> dict:
    value = dict(row)
    edit_date = str(value.get("edit_date") or "2026-08-12")
    if "T" not in edit_date:
        edit_date += "T00:00:00Z"
    name = str(value.get("name") or f"document-{value.get('id')}")
    body = str(value.get("body") or "")
    value.update({
        "author": str(value.get("author") or "Unknown"),
        "create_date": edit_date,
        "database": "LEGAL",
        "default_security": "private",
        "document_number": int(value.get("id") or 0),
        "extension": name.rsplit(".", 1)[-1] if "." in name else "docx",
        "file_create_date": edit_date,
        "file_edit_date": edit_date,
        "edit_date": edit_date,
        "full_file_name": name,
        "id": f"LEGAL!{value.get('id')}.{int(value.get('latest_version') or 1)}",
        "is_hipaa": False,
        "iwl": f"iwl:dms:LEGAL:{value.get('id')}",
        "size": len(body.encode()),
        "type": str(value.get("doc_class") or "DOCUMENT"),
        "version": int(value.get("latest_version") or 1),
        "document_url": f"/work/web/r/document?wdoc={value.get('id')}",
        "workspace_id": f"LEGAL!{value.get('workspace_id')}",
    })
    return _without_none(value)


def _imanage_workspace(row: dict) -> dict:
    value = dict(row)
    value.update({
        "basic_properties": json.dumps({"matter_number": value.get("matter_number")}),
        "create_date": "2026-08-12T00:00:00Z",
        "database": "LEGAL",
        "default_security": "private",
        "has_subfolders": True,
        "id": f"LEGAL!{value.get('id')}",
        "is_external_as_normal": False,
        "iwl": f"iwl:dms:LEGAL:workspace:{value.get('id')}",
        "owner": str(value.get("owner") or "Unknown"),
        "workspace_url": f"/work/web/r/workspace/{value.get('id')}",
        "wstype": "workspace",
    })
    return _without_none(value)


def _imanage_folder(row: dict) -> dict:
    value = dict(row)
    value.update({"id": f"LEGAL!{value.get('id')}", "wstype": "folder",
                  "workspace_id": f"LEGAL!{value.get('workspace_id')}",
                  "folder_url": f"/work/web/r/folder/{value.get('id')}"})
    return _without_none(value)


def _gmail_message(row: dict) -> dict:
    return {
        "id": str(row.get("id")),
        "threadId": str(row.get("thread_id")),
        "labelIds": [row.get("label") or "INBOX"],
        "snippet": str(row.get("body") or "")[:120],
        "internalDate": row.get("sent_at"),
        "payload": {
            "headers": [
                {"name": "From", "value": row.get("from_addr")},
                {"name": "To", "value": row.get("to_addr")},
                {"name": "Subject", "value": row.get("subject")},
                {"name": "Date", "value": row.get("sent_at")},
            ],
            "body": {"data": row.get("body")},
        },
    }


def _calendar_event(row: dict) -> dict:
    return {
        "kind": "calendar#event",
        "id": str(row.get("id")),
        "status": row.get("status") or "confirmed",
        "summary": row.get("summary"),
        "start": {"dateTime": row.get("start_at")},
        "end": {"dateTime": row.get("end_at") or row.get("start_at")},
        "attendees": [{"email": e.strip()} for e in str(row.get("attendees") or "").split(",") if e.strip()],
        "organizer": {"email": row.get("calendar")},
    }


def _relativity_object(row: dict) -> dict:
    """Relativity Object Manager's ArtifactID + FieldValues wire shape."""
    return {
        "ArtifactID": row.get("id"),
        "FieldValues": [
            {"Field": {"Name": key}, "Value": value}
            for key, value in row.items() if key != "id"
        ],
    }


def _drive_file(row: dict) -> dict:
    out = {"kind": "drive#file", "id": str(row.get("id")), "name": row.get("name"),
           "mimeType": row.get("mime_type"), "modifiedTime": row.get("modified_at"),
           "owners": [{"displayName": row.get("owner")}],
           "parents": [row.get("parent_folder")]}
    if "content" in row:
        out["content"] = row.get("content")  # deviation: files.get alt=media returns bytes
    return out


COURTLISTENER_BASE = "https://www.courtlistener.com"


def _courtlistener_url(resource: str, value: object) -> str:
    return f"{COURTLISTENER_BASE}/api/rest/v4/{resource}/{value}/"


def _courtlistener_row(name: str, row: dict) -> dict:
    """Project compact storage into fields emitted by CourtListener v4.

    CourtListener's REST serializers support an explicit ``fields`` query.
    Each MCP tool mirrors one documented projection (declared as
    ``wire_fields`` in the contract), so fields that do not exist in the
    compact relational seed are never invented on the wire.
    """
    value = dict(row)
    if name == "courts_list":
        value = {
            "id": value.get("court_id"),
            "full_name": value.get("full_name"),
            "jurisdiction": value.get("jurisdiction"),
            "in_use": bool(value.get("in_use")),
        }
    elif name.startswith("dockets_"):
        value["assigned_to_str"] = value.pop("assigned_to", "")
    elif name == "docket_entries_list":
        value["docket"] = _courtlistener_url("dockets", value.pop("docket_id", None))
    elif name.startswith("recap_documents_"):
        value.pop("docket_entry_id", None)
        if value.get("document_number") is not None:
            value["document_number"] = str(value["document_number"])
        value["is_sealed"] = bool(value.get("is_sealed"))
    elif name == "opinions_get":
        value = {
            "id": value.get("id"),
            "cluster_id": value.get("id"),
            "type": "010combined",
            "author_str": "",
            "plain_text": value.get("plain_text") or "",
            "page_count": None,
        }
    elif name == "parties_list":
        docket_id = value.pop("docket_id", None)
        party_id = value.get("id")
        value = {
            "id": party_id,
            "name": value.get("name"),
            "party_types": [{
                "docket": _courtlistener_url("dockets", docket_id),
                "docket_id": docket_id,
                "name": value.get("party_type"),
                "date_terminated": None,
                "extra_info": "",
                "highest_offense_level_opening": "",
                "highest_offense_level_terminated": "",
                "criminal_counts": [],
                "criminal_complaints": [],
            }],
            "attorneys": [{
                "attorney": _courtlistener_url("attorneys", party_id),
                "attorney_id": party_id,
                "date_action": None,
                "docket": _courtlistener_url("dockets", docket_id),
                "docket_id": docket_id,
                "role": 1,
            }],
        }
    elif name.startswith("docket_alerts_"):
        created = value.get("created_at") or "2026-08-10T12:00:00Z"
        value = {
            "id": value.get("id"),
            "date_created": created,
            "date_modified": created,
            "date_last_hit": None,
            "docket": value.get("docket_id"),
            "alert_type": int(value.get("alert_type") or 0),
        }
    fields = set(str(item) for item in (row.get("_wire_fields") or []))
    return _without_none(value) if not fields else {
        key: item for key, item in value.items() if key in fields
    }


def _courtlistener_project(tool: dict, row: dict) -> dict:
    value = dict(row)
    value["_wire_fields"] = tool.get("wire_fields") or []
    return _courtlistener_row(tool.get("name", ""), value)


def _courtlistener_alert_created(tool: dict, obj: dict) -> dict:
    return _courtlistener_project(tool, obj)


def _citation_lookup_response(query: str, rows: list[dict]) -> list[dict]:
    """CourtListener citation lookup returns one result per parsed citation."""
    if not rows:
        return []
    normalized = str(rows[0].get("citation") or query)
    return [{
        "citation": query,
        "normalized_citations": [normalized],
        "start_index": 0,
        "end_index": len(query),
        "status": 200,
        "error_message": "",
        "clusters": [],
    }]


def wrap_output(dialect: str, tool: dict, ok: bool, text: str) -> tuple[bool, str]:
    if not ok or not dialect:
        return ok, text
    try:
        obj = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return ok, text
    kind = (tool.get("op") or {}).get("kind")
    name = tool.get("name", "")
    fm = tool.get("field_map")

    def rows():
        return obj.get("results", obj.get("rows", []))

    total = int(obj.get("total", obj.get("count", len(rows()))) or 0)
    limit = int(obj.get("limit", len(rows()) or 1) or 1)
    offset = int(obj.get("offset", 0) or 0)
    next_offset = obj.get("next_offset")
    previous_offset = obj.get("previous_offset")

    if dialect == "clio":
        if kind in ("list", "search"):
            stem = name.rsplit("_", 1)[0].replace("_search", "")
            def url_for(value):
                return (f"/api/v4/{stem}.json?" + urlencode({"page_token": encode_cursor(value), "limit": limit})
                        if value is not None else None)
            return ok, json.dumps({"data": [_clio_row(name, row) for row in rows()], "meta": {"paging": {
                "next": url_for(next_offset), "previous": url_for(previous_offset)}, "records": total}})
        if kind == "aggregate":
            return ok, json.dumps({"data": obj})
        return ok, json.dumps({"data": _clio_row(name, obj)})

    if dialect == "courtlistener":
        if name == "citation_lookup":
            return ok, json.dumps(_citation_lookup_response(str(obj.get("query") or ""), rows()))
        if name in {"dockets_search", "opinions_search"}:
            # SearchV4 is an Elasticsearch endpoint.  Its result vocabulary is
            # distinct from the database serializers and is adapted below.
            converted = []
            for row in rows():
                if name == "dockets_search":
                    converted.append({
                        "id": row.get("id"),
                        "caseName": row.get("case_name"),
                        "docketNumber": row.get("docket_number"),
                        "court_id": row.get("court_id"),
                        "dateFiled": row.get("date_filed"),
                        "dateTerminated": row.get("date_terminated"),
                        "suitNature": row.get("nature_of_suit"),
                        "assignedTo": row.get("assigned_to"),
                        "cause": row.get("cause"),
                        "juryDemand": row.get("jury_demand"),
                    })
                else:
                    converted.append({
                        "id": row.get("id"),
                        "caseName": row.get("case_name"),
                        "court_id": row.get("court_id"),
                        "dateFiled": row.get("date_filed"),
                        "citation": [row.get("citation")],
                        "precedential_status": row.get("precedential_status"),
                        "opinions": [{
                            "id": row.get("id"),
                            "type": "010combined",
                            "snippet": row.get("plain_text"),
                        }],
                    })
            return ok, json.dumps({"count": total, "next": None, "previous": None,
                                   "results": [_without_none(row) for row in converted]})
        if kind in ("list", "search"):
            resource = (tool.get("op") or {}).get("table", "").replace("cl_", "").replace("_", "-")
            pagination = tool.get("courtlistener_pagination") or "page"

            def page_url(value):
                if value is None:
                    return None
                query = ({"cursor": encode_cursor(value), "page_size": limit}
                         if pagination == "cursor"
                         else {"page": value // limit + 1})
                return f"{COURTLISTENER_BASE}/api/rest/v4/{resource}/?" + urlencode(query)

            count_value = (f"{COURTLISTENER_BASE}/api/rest/v4/{resource}/?count=on"
                           if pagination == "cursor" else total)
            return ok, json.dumps({"count": count_value, "next": page_url(next_offset),
                                   "previous": page_url(previous_offset),
                                   "results": [_courtlistener_project(tool, row) for row in rows()]})
        if kind == "get":
            return ok, json.dumps(_courtlistener_project(tool, obj))
        if name == "docket_alerts_create":
            return ok, json.dumps(_courtlistener_alert_created(tool, obj))
        return ok, json.dumps(obj)

    if dialect == "imanage":
        if name == "documents_download":
            return ok, str(obj.get("body") or "")
        if kind in ("list", "search"):
            converted = rows()
            if name == "workspaces_search":
                converted = [_imanage_workspace(row) for row in converted]
            elif name == "folders_list":
                converted = [_imanage_folder(row) for row in converted]
            return ok, json.dumps({"data": {"results": converted,
                                            "total": total, "offset": offset, "limit": limit,
                                            "next_offset": next_offset}})
        if name in {"documents_get", "documents_create", "documents_checkin"}:
            obj = _imanage_document(obj)
        return ok, json.dumps({"data": obj})

    if dialect == "relativity":
        original_kind = kind
        if kind == "job_poll":
            kind = "get"  # async job rows wrap like any Relativity object
        if kind in ("list", "search"):
            objects = [_relativity_object(row) for row in rows()]
            return ok, json.dumps({"Objects": objects, "TotalCount": total,
                                   "CurrentStartIndex": offset + 1,
                                   "ResultCount": len(objects),
                                   "NextStartIndex": (next_offset + 1) if next_offset is not None else None})
        if kind == "get":
            value = _relativity_object(obj)
            if original_kind == "job_poll":
                value["JobState"] = next(
                    (item["Value"] for item in value["FieldValues"]
                     if item["Field"]["Name"] == "status"), None
                )
            return ok, json.dumps(value)
        if kind in ("create", "update"):
            return ok, json.dumps({"Object": _relativity_object(obj),
                                   "Success": True, "Message": ""})
        return ok, json.dumps(obj)

    if dialect == "ledes":
        if fm:
            if kind in ("list", "search"):
                return ok, json.dumps({"count": obj.get("count", 0),
                                       "lines" if "LINE" in str(fm.values()) else "invoices":
                                       [_rekey(r, fm) for r in rows()]})
            if kind in ("get", "create", "update"):
                return ok, json.dumps(_rekey(obj, fm))
        return ok, text

    if dialect == "google":
        if name == "sheets_values_get":
            vals = [[r.get("cell_range"), r.get("value")] for r in rows()]
            first = rows()[0] if rows() else {}
            return ok, json.dumps({"range": f"{first.get('sheet_name', 'Sheet1')}!{first.get('cell_range', '')}",
                                   "majorDimension": "ROWS", "values": vals})
        if name == "sheets_values_update":
            return ok, json.dumps({"spreadsheetId": str(obj.get("spreadsheet_id")),
                                   "updatedRange": f"{obj.get('sheet_name', 'Sheet1')}!{obj.get('cell_range', '')}",
                                   "updatedRows": 1, "updatedColumns": 1, "updatedCells": 1})
        if name == "drive_files_list":
            result = {"kind": "drive#fileList", "files": [_drive_file(r) for r in rows()]}
            if next_offset is not None:
                result["nextPageToken"] = encode_cursor(next_offset)
            return ok, json.dumps(result)
        if name == "drive_files_get":
            return ok, json.dumps(_drive_file(obj))
        if name == "gmail_messages_list":
            result = {"messages": [{"id": str(r.get("id")), "threadId": str(r.get("thread_id"))}
                                   for r in rows()], "resultSizeEstimate": total}
            if next_offset is not None:
                result["nextPageToken"] = encode_cursor(next_offset)
            return ok, json.dumps(result)
        if name == "gmail_messages_get":
            return ok, json.dumps(_gmail_message(obj))
        if name == "gmail_messages_send":
            return ok, json.dumps({"id": str(obj.get("id")), "threadId": str(obj.get("thread_id") or obj.get("id")),
                                   "labelIds": ["SENT"]})
        if name == "calendar_events_list":
            result = {"kind": "calendar#events", "items": [_calendar_event(r) for r in rows()]}
            if next_offset is not None:
                result["nextPageToken"] = encode_cursor(next_offset)
            return ok, json.dumps(result)
        if name == "calendar_events_insert":
            return ok, json.dumps(_calendar_event(obj))
        if name == "spreadsheets_list":
            result = {"kind": "drive#fileList",
                      "files": [{"kind": "drive#file", "id": str(r.get("id")),
                                 "name": r.get("title"),
                                 "mimeType": "application/vnd.google-apps.spreadsheet"} for r in rows()]}
            if next_offset is not None:
                result["nextPageToken"] = encode_cursor(next_offset)
            return ok, json.dumps(result)
        return ok, text

    return ok, text
