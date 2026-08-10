"""v3 dialect layer — wraps mock-tool outputs in each REAL product's response
envelope and translates the real APIs' external parameter names to the
internal executor names (contracts carry `dialect`, `param_map`, `field_map`).

Envelopes mirrored (per the API docs cited in each contract):
  clio           GET list  -> {"data": [...], "meta": {"paging": {}, "records": N}}
                 GET one   -> {"data": {...}}         writes -> {"data": {...}}
  courtlistener  list/search -> {"count": N, "next": null, "previous": null, "results": [...]}
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

import json


def translate_args(tool: dict, args: dict) -> dict:
    """External (real-API) parameter names -> internal executor names."""
    pm = tool.get("param_map") or {}
    out = {}
    for k, v in (args or {}).items():
        out[pm.get(k, k)] = v
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


def _drive_file(row: dict) -> dict:
    out = {"kind": "drive#file", "id": str(row.get("id")), "name": row.get("name"),
           "mimeType": row.get("mime_type"), "modifiedTime": row.get("modified_at"),
           "owners": [{"displayName": row.get("owner")}],
           "parents": [row.get("parent_folder")]}
    if "content" in row:
        out["content"] = row.get("content")  # deviation: files.get alt=media returns bytes
    return out


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

    if dialect == "clio":
        if kind in ("list", "search"):
            return ok, json.dumps({"data": rows(),
                                   "meta": {"paging": {}, "records": obj.get("count", len(rows()))}})
        if kind == "aggregate":
            return ok, json.dumps({"data": obj})
        return ok, json.dumps({"data": obj})

    if dialect == "courtlistener":
        if kind in ("list", "search"):
            return ok, json.dumps({"count": obj.get("count", len(rows())),
                                   "next": None, "previous": None, "results": rows()})
        if kind == "get":
            obj["resource_uri"] = f"/api/rest/v4/{(tool.get('op') or {}).get('table', '').replace('cl_', '').replace('_', '-')}/{obj.get('id')}/"
        return ok, json.dumps(obj)

    if dialect == "imanage":
        if kind in ("list", "search"):
            return ok, json.dumps({"data": {"results": rows(),
                                            "total": obj.get("count", len(rows()))}})
        return ok, json.dumps({"data": obj})

    if dialect == "relativity":
        if kind in ("list", "search"):
            objects = [{"ArtifactID": r.get("id"), **{k: v for k, v in r.items() if k != "id"}}
                       for r in rows()]
            return ok, json.dumps({"Objects": objects, "TotalCount": obj.get("count", len(objects)),
                                   "CurrentStartIndex": 0})
        if kind == "get":
            return ok, json.dumps({"ArtifactID": obj.get("id"),
                                   **{k: v for k, v in obj.items() if k != "id"}})
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
            return ok, json.dumps({"kind": "drive#fileList", "files": [_drive_file(r) for r in rows()]})
        if name == "drive_files_get":
            return ok, json.dumps(_drive_file(obj))
        if name == "gmail_messages_list":
            return ok, json.dumps({"messages": [{"id": str(r.get("id")), "threadId": str(r.get("thread_id"))}
                                                for r in rows()],
                                   "resultSizeEstimate": obj.get("count", len(rows()))})
        if name == "gmail_messages_get":
            return ok, json.dumps(_gmail_message(obj))
        if name == "gmail_messages_send":
            return ok, json.dumps({"id": str(obj.get("id")), "threadId": str(obj.get("thread_id") or obj.get("id")),
                                   "labelIds": ["SENT"]})
        if name == "calendar_events_list":
            return ok, json.dumps({"kind": "calendar#events", "items": [_calendar_event(r) for r in rows()]})
        if name == "calendar_events_insert":
            return ok, json.dumps(_calendar_event(obj))
        if name == "spreadsheets_list":
            return ok, json.dumps({"kind": "drive#fileList",
                                   "files": [{"kind": "drive#file", "id": str(r.get("id")),
                                              "name": r.get("title"),
                                              "mimeType": "application/vnd.google-apps.spreadsheet"}
                                             for r in rows()]})
        return ok, text

    return ok, text
