#!/usr/bin/env python3
"""Compile world-v15 into the product-only world-v16.

This is deliberately a data/task compiler, not a textual replacement script.
It performs four linked migrations in one reproducible transaction:

1. instantiate the deterministic v3 product seed from the contracts;
2. account for every Gen-1 row in a product table and emit an ID manifest;
3. translate every task walk and its oracle arguments to product tools; and
4. regenerate affected verifiers from an explicit check grammar.

The generated world contains no synthesized tool specifications.  At runtime
the product tools are supplied by ``mcp/v3/contracts``.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
WORLD_V15 = ROOT / "world" / "blobfish" / "world-v15.json"
WORLD_V16 = ROOT / "world" / "blobfish" / "world-v16.json"
CONTRACTS = ROOT / "mcp" / "v3" / "contracts"
ID_MANIFEST = ROOT / "world" / "migrate" / "id-manifest.json"
REFERENCE_ARGS = ROOT / "world" / "migrate" / "v15-reference-args.json"
CHECK_MANIFEST = ROOT / "world" / "migrate" / "check-manifest.json"
RECONCILIATION = ROOT / "world" / "migrate" / "reconciliation.json"
MIGRATION_ID_BASE = 100_000
EPOCH = "2026-08-10T12:00:00Z"

sys.path.insert(0, str(ROOT / "world" / "local"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from v2runtime import V2Runtime  # noqa: E402
from verifier import assertion_names, compile_vcode  # noqa: E402


PRIMARY_TABLES = {
    "cases",
    "conflict_cases",
    "court_filings",
    "courts",
    "discovery_requests",
    "docket_entries",
    "hearings",
    "invoice_reviews",
    "litigation_deadlines",
    "matters",
}

PARENT_SOURCE = {
    "legal_billing": "invoice_reviews",
    "legal_conflicts": "conflict_cases",
    "legal_matters": "matters",
    "litigation_cases": "cases",
    "litigation_courts": "courts",
    "litigation_deadlines": "litigation_deadlines",
    "litigation_discovery": "discovery_requests",
    "litigation_dockets": "docket_entries",
    "litigation_filings": "court_filings",
    "litigation_hearings": "hearings",
}

ARCHIVE_DOCUMENT_TABLES = {
    "agent_documents",
    "agent_knowledge",
    "agent_playbooks",
    "corpus_files",
    "matter_documents",
}

PRODUCT_TABLE_FOR_LEGACY = {
    "agent_events": "ws_events",
    "agent_files": "ws_files",
    "agent_memories": "pm_notes",
    "agent_scheduled_runs": "ws_events",
    "agent_sheet_rows": "ws_sheet_values",
    "agent_sheets": "ws_spreadsheets",
    "analysis_jobs": "ed_productions",
    **{table: "pm_matters" for table in PRIMARY_TABLES},
    **{table: "dm_documents" for table in ARCHIVE_DOCUMENT_TABLES},
}


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def pretty(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def source_pk(table: dict[str, Any]) -> str:
    return next((column["name"] for column in table["columns"] if column.get("pk")), "id")


def product_table_for(old_table: str) -> str:
    if old_table in PRODUCT_TABLE_FOR_LEGACY:
        return PRODUCT_TABLE_FOR_LEGACY[old_table]
    if any(old_table.startswith(prefix + "_") for prefix in PARENT_SOURCE):
        return "pm_notes"
    raise ValueError(f"no product-table destination for legacy table {old_table!r}")


def load_product_seed() -> tuple[V2Runtime, list[dict[str, Any]], dict[str, dict[str, Any]]]:
    runtime = V2Runtime(str(CONTRACTS))
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    runtime.create_and_seed(conn)
    tables: list[dict[str, Any]] = []
    by_name: dict[str, dict[str, Any]] = {}
    for contract in runtime.contracts:
        for table in contract["tables"]:
            name = table["name"]
            rows = [dict(row) for row in conn.execute(f'SELECT * FROM "{name}" ORDER BY rowid')]
            world_table = {
                "name": name,
                "description": (
                    f"Product-contract table for {contract['product']}; generated from "
                    f"mcp/v3/contracts/{contract.get('_source_file', '') or 'pinned contract'}."
                ),
                "columns": copy.deepcopy(table["columns"]),
                "sample_rows": rows,
                "product_contract": {
                    "system": contract["system"],
                    "product": contract["product"],
                    "dialect": contract.get("dialect"),
                },
            }
            tables.append(world_table)
            by_name[name] = world_table
    conn.close()
    if len(by_name) != len(runtime.tables):
        raise AssertionError("contract table names are not unique")
    return runtime, tables, by_name


def allocate_mappings(
    legacy_tables: list[dict[str, Any]], product_by_name: dict[str, dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, dict[str, dict[str, Any]]]]:
    next_id: dict[str, int] = {}
    for name, table in product_by_name.items():
        ids = [int(row["id"]) for row in table.get("sample_rows") or [] if row.get("id") is not None]
        next_id[name] = max(MIGRATION_ID_BASE, (max(ids) + 1) if ids else 1)

    entries: list[dict[str, Any]] = []
    by_old: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    seen_targets: set[tuple[str, int]] = set()
    for table in legacy_tables:
        old_table = table["name"]
        target = product_table_for(old_table)
        pk = source_pk(table)
        for row in table.get("sample_rows") or []:
            old_id = str(row.get(pk))
            if old_id in by_old[old_table]:
                raise ValueError(f"duplicate legacy primary key {old_table}.{old_id}")
            new_id = next_id[target]
            next_id[target] += 1
            if (target, new_id) in seen_targets:
                raise AssertionError(f"duplicate migration target {target}.{new_id}")
            seen_targets.add((target, new_id))
            entry = {
                "old_table": old_table,
                "old_id": old_id,
                "new_table": target,
                "new_id": new_id,
                "source_row_sha256": sha256_bytes(canonical(row).encode()),
                "status": "migrated",
            }
            entries.append(entry)
            by_old[old_table][old_id] = entry
    return entries, by_old


def allocate_virtual_parents(
    tasks: list[dict[str, Any]],
    reference_args: dict[str, dict[str, Any]],
    entries: list[dict[str, Any]],
    by_old: dict[str, dict[str, dict[str, Any]]],
    product_by_name: dict[str, dict[str, Any]],
) -> None:
    """Close v15's dangling expansion-parent references explicitly.

    Packs 271–282 reference ``legal_matters_019`` through ``_030`` although
    v15 never seeded those matter rows. Gen-1 accepted the dangling strings;
    product notes require a real matter. Each placeholder is marked as a
    virtual parent in the manifest and is excluded from migrated-row totals.
    """
    needed: set[str] = set()
    for task in tasks:
        reference = reference_args[task["task_id"]]
        for arguments in reference["arguments"]:
            value = arguments.get("legal_matters_id")
            if value is not None and str(value) not in by_old["matters"]:
                needed.add(str(value))
    next_id = max(int(row["id"]) for row in product_by_name["pm_matters"]["sample_rows"]) + 1
    for old_id in sorted(needed):
        entry = {
            "old_table": "matters",
            "old_id": old_id,
            "new_table": "pm_matters",
            "new_id": next_id,
            "source_row_sha256": None,
            "status": "virtual_parent_for_dangling_v15_task_reference",
        }
        entries.append(entry)
        by_old["matters"][old_id] = entry
        next_id += 1


def materialize_virtual_parents(
    entries: list[dict[str, Any]], product_by_name: dict[str, dict[str, Any]]
) -> None:
    for entry in entries:
        if entry["status"] != "virtual_parent_for_dangling_v15_task_reference":
            continue
        old_id = entry["old_id"]
        row = empty_product_row(product_by_name, "pm_matters")
        row.update(
            {
                "id": entry["new_id"],
                "number": f"MIG-VIRTUAL-{old_id}",
                "display_name": f"Migrated placeholder for {old_id}",
                "client_id": 1,
                "status": "open",
                "practice_area_id": 1,
                "responsible_attorney_id": 1,
                "originating_attorney_id": 1,
                "billing_method": "hourly",
                "open_date": "2026-08-10",
                "close_date": None,
                "description": canonical(
                    {
                        "migration_status": "virtual_parent",
                        "legacy_id": old_id,
                        "reason": "v15 expansion task referenced an unseeded parent",
                    }
                ),
                "updated_at": EPOCH,
            }
        )
        entry["target_row_sha256"] = sha256_bytes(canonical(row).encode())
        product_by_name["pm_matters"]["sample_rows"].append(row)


def mapped_id(
    by_old: dict[str, dict[str, dict[str, Any]]], old_table: str, old_id: Any
) -> int:
    try:
        return int(by_old[old_table][str(old_id)]["new_id"])
    except KeyError as exc:
        # Several original oracle traces used the numeric suffix ("1") for a
        # TEXT primary key stored as ``legal_matters_001``.  Resolve that
        # historical wire shorthand only when it has one unambiguous match.
        text = str(old_id)
        if text.isdigit():
            suffix = f"_{int(text):03d}"
            matches = [entry for key, entry in by_old.get(old_table, {}).items()
                       if key.endswith(suffix)]
            if len(matches) == 1:
                return int(matches[0]["new_id"])
        raise KeyError(f"unmapped legacy reference {old_table}.{old_id}") from exc


def parent_prefix(old_table: str) -> str | None:
    return next((prefix for prefix in PARENT_SOURCE if old_table.startswith(prefix + "_")), None)


def date_part(value: Any, default: str = "2026-08-10") -> str:
    text = str(value or "")
    return text[:10] if re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", text) else default


def empty_product_row(product_by_name: dict[str, dict[str, Any]], target: str) -> dict[str, Any]:
    return {column["name"]: None for column in product_by_name[target]["columns"]}


def legacy_payload(old_table: str, row: dict[str, Any]) -> str:
    return canonical({"legacy_table": old_table, "legacy_record": row})


def convert_row(
    old_table: str,
    row: dict[str, Any],
    new_id: int,
    by_old: dict[str, dict[str, dict[str, Any]]],
    product_by_name: dict[str, dict[str, Any]],
) -> tuple[str, dict[str, Any]]:
    target = product_table_for(old_table)
    out = empty_product_row(product_by_name, target)
    out["id"] = new_id

    if target == "pm_matters":
        title = row.get("title") or f"Migrated {old_table} {row.get('id')}"
        out.update(
            {
                "number": f"MIG-{old_table.upper().replace('_', '-')}-{row.get('id')}",
                "display_name": title,
                "client_id": 1,
                "status": row.get("status") or "open",
                "practice_area_id": 1,
                "responsible_attorney_id": 1,
                "originating_attorney_id": 1,
                "billing_method": "hourly",
                "open_date": date_part(row.get("created_at")),
                "close_date": None,
                "description": legacy_payload(old_table, row),
                "updated_at": row.get("updated_at") or row.get("created_at") or EPOCH,
            }
        )
    elif target == "pm_notes":
        prefix = parent_prefix(old_table)
        matter_id = 1
        if prefix:
            fk = prefix + "_id"
            matter_id = mapped_id(by_old, PARENT_SOURCE[prefix], row.get(fk))
        out.update(
            {
                "matter_id": matter_id,
                "author_user_id": 1,
                "subject": old_table,
                "detail": legacy_payload(old_table, row),
                "created_at": row.get("created_at") or EPOCH,
            }
        )
    elif target == "dm_documents":
        if old_table == "matter_documents":
            name = row.get("title")
            doc_class = row.get("doc_type") or "legacy_document"
            body = row.get("body") or ""
            author = f"migration:{row.get('related_shape') or old_table}"
        elif old_table == "agent_documents":
            name = row.get("title")
            doc_class = "agent_document"
            body = row.get("body") or ""
            author = "migration:office-agent"
        elif old_table == "agent_knowledge":
            name = f"Knowledge {row.get('id')} — {row.get('source') or 'internal'}"
            doc_class = "knowledge"
            body = row.get("content") or ""
            author = "migration:agent-knowledge"
        elif old_table == "agent_playbooks":
            name = row.get("name") or f"Playbook {row.get('id')}"
            doc_class = "playbook"
            body = row.get("steps") or ""
            author = "migration:agent-playbook"
        else:
            name = row.get("filename") or f"Corpus file {row.get('id')}"
            doc_class = "corpus_file"
            body = legacy_payload(old_table, row)
            author = "migration:corpus-index"
        out.update(
            {
                "folder_id": 1,
                "workspace_id": 1,
                "name": name,
                "doc_class": doc_class,
                "author": author,
                "edit_date": row.get("updated_at") or row.get("created_at") or EPOCH,
                "checked_out_by": None,
                "latest_version": 1,
                "body": body,
            }
        )
    elif target == "ws_files":
        out.update(
            {
                "name": row.get("filename") or f"File {row.get('id')}",
                "mime_type": row.get("content_type") or "application/octet-stream",
                "parent_folder": "migrated-gen1",
                "owner": "migration@simulated-firm.example",
                "modified_at": EPOCH,
                "content": row.get("content") or "",
            }
        )
    elif target == "ws_events":
        if old_table == "agent_events":
            start = row.get("event_date") or EPOCH
            summary = row.get("title") or f"Event {row.get('id')}"
        else:
            start = row.get("schedule") or EPOCH
            summary = row.get("name") or f"Scheduled run {row.get('id')}"
        out.update(
            {
                "calendar": "primary",
                "summary": summary,
                "start_at": start,
                "end_at": start,
                "attendees": "",
                "status": row.get("status") or "confirmed",
            }
        )
    elif target == "ws_spreadsheets":
        out.update(
            {
                "title": row.get("title") or f"Spreadsheet {row.get('id')}",
                "owner": "migration@simulated-firm.example",
            }
        )
    elif target == "ws_sheet_values":
        sheet_id = mapped_id(by_old, "agent_sheets", row.get("sheet_id"))
        out.update(
            {
                "spreadsheet_id": sheet_id,
                "sheet_name": "Sheet1",
                "cell_range": f"A{int(row.get('row_index') or 0) + 1}",
                "value": row.get("cells") or "",
            }
        )
    elif target == "ed_productions":
        status = str(row.get("status") or "staged")
        if status in {"queued", "pending"}:
            status = "staged"
        out.update(
            {
                "workspace_id": 1,
                "name": f"{row.get('analysis_type') or 'analysis'}:{row.get('scope') or row.get('id')}",
                "bates_prefix": "SIM",
                "status": status,
                "doc_count": row.get("findings_count") or 0,
                "created_at": EPOCH,
                "poll_count": row.get("poll_count") or 0,
            }
        )
    else:
        raise AssertionError(f"conversion missing for {old_table} -> {target}")
    return target, out


def materialize_legacy_rows(
    legacy_tables: list[dict[str, Any]],
    entries: list[dict[str, Any]],
    by_old: dict[str, dict[str, dict[str, Any]]],
    product_by_name: dict[str, dict[str, Any]],
) -> dict[tuple[str, str], tuple[str, dict[str, Any]]]:
    entry_by_old = {(entry["old_table"], entry["old_id"]): entry for entry in entries}
    converted: dict[tuple[str, str], tuple[str, dict[str, Any]]] = {}
    for table in legacy_tables:
        old_table = table["name"]
        pk = source_pk(table)
        for row in table.get("sample_rows") or []:
            old_id = str(row.get(pk))
            entry = entry_by_old[(old_table, old_id)]
            target, new_row = convert_row(
                old_table, row, int(entry["new_id"]), by_old, product_by_name
            )
            entry["target_row_sha256"] = sha256_bytes(canonical(new_row).encode())
            product_by_name[target]["sample_rows"].append(new_row)
            converted[(old_table, old_id)] = (target, new_row)
    for table in product_by_name.values():
        ids = [str(row.get("id")) for row in table.get("sample_rows") or []]
        if len(ids) != len(set(ids)):
            raise AssertionError(f"duplicate target IDs in {table['name']}")
    return converted


def load_reference_args(
    tasks: list[dict[str, Any]], source_world_sha256: str
) -> dict[str, dict[str, Any]]:
    """Load the immutable v15 oracle inputs captured before fixture migration.

    Golden fixtures intentionally follow the canonical world and therefore
    cannot be a compiler input: regenerating them for v16 must not make v16
    impossible to rebuild. The committed manifest is the one-way migration
    boundary and is validated against the exact v15 source bytes.
    """
    if not REFERENCE_ARGS.exists():
        raise FileNotFoundError(
            f"missing immutable migration input: {REFERENCE_ARGS.relative_to(ROOT)}"
        )
    manifest = json.loads(REFERENCE_ARGS.read_text())
    if manifest.get("schema") != "lawfirm.reference-arguments.v1":
        raise ValueError("unsupported reference-arguments manifest schema")
    if manifest.get("source_world_sha256") != source_world_sha256:
        raise ValueError("reference-arguments manifest does not match world-v15 bytes")
    captured = manifest.get("tasks") or {}
    expected_ids = {task["task_id"] for task in tasks}
    if set(captured) != expected_ids:
        missing = sorted(expected_ids - set(captured))
        extra = sorted(set(captured) - expected_ids)
        raise ValueError(
            f"reference-arguments task coverage mismatch; missing={missing[:5]} "
            f"extra={extra[:5]}"
        )
    output: dict[str, dict[str, Any]] = {}
    for task in tasks:
        task_id = task["task_id"]
        reference = captured[task_id]
        walk = reference.get("walk") or []
        arguments = reference.get("arguments") or []
        if Counter(walk) != Counter(task.get("walk") or []):
            raise ValueError(f"captured walk membership drift for {task_id}")
        if len(arguments) != len(walk):
            raise ValueError(f"captured argument count mismatch for {task_id}")
        output[task_id] = copy.deepcopy(reference)
    return output


def load_pack_index() -> dict[tuple[str, str], dict[str, Any]]:
    index: dict[tuple[str, str], dict[str, Any]] = {}
    for path in sorted((ROOT / "world" / "expansion").glob("packs*/**/*.json")):
        data = json.loads(path.read_text())
        if not isinstance(data, dict) or not isinstance(data.get("tasks"), list):
            continue
        for task in data["tasks"]:
            key = (path.name, task["slug"])
            if key in index:
                raise ValueError(f"duplicate pack task {key}")
            index[key] = task
    return index


def old_tool_table(world_tool_by_name: dict[str, dict[str, Any]], tool: str) -> str | None:
    spec = world_tool_by_name.get(tool) or {}
    tables = spec.get("target_tables") or []
    return tables[0] if len(tables) == 1 else None


def tool_destination(tool: str, world_tool_by_name: dict[str, dict[str, Any]]) -> str | None:
    if tool not in world_tool_by_name:
        return tool  # already a product contract tool
    exact = {
        "add_to_knowledge": None,
        "analysis_job_result": "jobs_get",
        "analysis_job_status": "jobs_get",
        "analysis_job_submit": "productions_create",
        "analysis_jobs_list": "productions_list",
        "calendar_agent": "calendar_events_insert",
        "corpus_files_list": "documents_list",
        "corpus_matters_list": "workspaces_list",
        "corpus_read": "documents_download",
        "corpus_search": "documents_search_fulltext",
        "create_playbook": None,
        "create_scheduled_run": None,
        "document_agent": "documents_create",
        "draft_matter_document": "documents_create",
        "list_playbooks": None,
        "list_scheduled_runs": None,
        "operations_records_agent": "matters_search",
        "operations_workflow_agent": "gmail_messages_send",
        "query_calendar_events": "calendar_events_list",
        "query_documents": "documents_search_fulltext",
        "query_files": "drive_files_list",
        "query_matter_documents": "documents_search_fulltext",
        "read_file": "drive_files_get",
        "read_matter_document": "documents_download",
        "save_memory": None,
        "search_knowledge": None,
        "search_memory": None,
        "sheet_agent": "sheets_values_update",
        "update_matter_documents_title": "documents_checkin",
    }
    if tool in exact:
        return exact[tool]
    table = old_tool_table(world_tool_by_name, tool)
    if tool.endswith("_audit_list"):
        return "notes_list"
    if tool.endswith("_list") and table in PRIMARY_TABLES:
        return "matters_list"
    if tool.endswith("_get") and table in PRIMARY_TABLES:
        return "matters_get"
    if tool.endswith("_create") and table and product_table_for(table) == "pm_notes":
        return "notes_create"
    raise ValueError(f"no product-tool destination for Gen-1 tool {tool!r}")


def parent_mapping_for_args(
    old_table: str,
    args: dict[str, Any],
    by_old: dict[str, dict[str, dict[str, Any]]],
) -> int:
    prefix = parent_prefix(old_table)
    if not prefix:
        return 1
    fk = prefix + "_id"
    if fk not in args:
        raise KeyError(f"{old_table} write has no {fk}: {args}")
    return mapped_id(by_old, PARENT_SOURCE[prefix], args[fk])


def records_query(request: str, legacy_tables: list[dict[str, Any]]) -> str:
    for table in legacy_tables:
        if table["name"] not in PRIMARY_TABLES:
            continue
        for row in table.get("sample_rows") or []:
            title = str(row.get("title") or "")
            if title and title.lower() in request.lower():
                return title
    quoted = re.search(r'"([^"]+)"', request)
    return quoted.group(1) if quoted else "Legal Matters"


def async_result_count(task: dict[str, Any], source_args: list[dict[str, Any]]) -> int:
    for tool, args in reversed(list(zip(task.get("walk") or [], source_args))):
        if not tool.endswith("_create"):
            continue
        for key in ("fee_budget", "claimed_amount", "exposure_amount", "production_cost"):
            value = args.get(key)
            if isinstance(value, (int, float)):
                return int(value)
    return 0


def translate_args(
    old_tool: str,
    args: dict[str, Any],
    task: dict[str, Any],
    source_args: list[dict[str, Any]],
    world_tool_by_name: dict[str, dict[str, Any]],
    by_old: dict[str, dict[str, dict[str, Any]]],
    legacy_tables: list[dict[str, Any]],
    product_by_name: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    if old_tool not in world_tool_by_name:
        return copy.deepcopy(args)
    new_tool = tool_destination(old_tool, world_tool_by_name)
    if new_tool is None:
        raise ValueError(f"task {task['task_id']} uses dropped harness tool {old_tool}")
    table = old_tool_table(world_tool_by_name, old_tool)

    if old_tool == "query_matter_documents":
        query = args.get("title") or args.get("body") or args.get("related_shape")
        if not query and args.get("id") is not None:
            old_id = str(args["id"])
            source = next(
                row
                for t in legacy_tables
                if t["name"] == "matter_documents"
                for row in t.get("sample_rows") or []
                if str(row.get("id")) == old_id
            )
            query = source.get("title")
        return {"query": query, **({"limit": args["limit"]} if args.get("limit") else {})}
    if old_tool == "read_matter_document":
        return {"id": mapped_id(by_old, "matter_documents", args["id"])}
    if old_tool == "draft_matter_document":
        return {
            "folder_id": 1,
            "workspace_id": 1,
            "name": args.get("title"),
            "doc_class": args.get("doc_type") or "deliverable",
            "author": "agent@simulated-firm.example",
            "body": args.get("body") or "",
        }
    if old_tool == "analysis_job_submit":
        return {
            "workspace_id": 1,
            "name": f"{args.get('analysis_type') or 'analysis'}:{args.get('scope') or task['task_id']}",
            "bates_prefix": "SIM",
            "doc_count": async_result_count(task, source_args),
        }
    if old_tool in {"analysis_job_status", "analysis_job_result"}:
        existing = product_by_name["ed_productions"]["sample_rows"]
        return {"id": max(int(row["id"]) for row in existing) + 1}
    if old_tool == "operations_records_agent":
        return {"query": records_query(str(args.get("request") or ""), legacy_tables), "limit": 20}
    if tool_destination(old_tool, world_tool_by_name) == "matters_list":
        return {key: args[key] for key in ("status", "limit") if args.get(key) is not None}
    if tool_destination(old_tool, world_tool_by_name) == "matters_get":
        if not table:
            raise ValueError(f"cannot resolve table for {old_tool}")
        return {"id": mapped_id(by_old, table, args["id"])}
    if tool_destination(old_tool, world_tool_by_name) == "notes_list":
        prefix = parent_prefix(table or "")
        if not prefix:
            raise ValueError(f"cannot resolve audit parent for {old_tool}")
        old_fk = prefix + "_id"
        return {
            "matter_id": mapped_id(by_old, PARENT_SOURCE[prefix], args[old_fk]),
            **({"limit": args["limit"]} if args.get("limit") else {}),
        }
    if tool_destination(old_tool, world_tool_by_name) == "notes_create":
        if not table:
            raise ValueError(f"cannot resolve write table for {old_tool}")
        return {
            "matter_id": parent_mapping_for_args(table, args, by_old),
            "author_user_id": 1,
            "subject": table,
            "detail": canonical(args),
        }
    raise ValueError(f"argument translation not implemented for used tool {old_tool}")


def map_effect_table(old_table: str) -> str:
    return product_table_for(old_table)


def migration_appendix(
    task: dict[str, Any],
    source_args: list[dict[str, Any]],
    world_tool_by_name: dict[str, dict[str, Any]],
    by_old: dict[str, dict[str, dict[str, Any]]],
) -> str:
    notes: list[str] = []
    if any(tool in {"query_matter_documents", "read_matter_document", "draft_matter_document"}
           for tool in task.get("walk") or []):
        notes.append(
            "Matter documents now live in MatterVault DMS: search with "
            "documents_search_fulltext(query), read full text with documents_download(id), "
            "and file deliverables with documents_create using workspace_id=1, folder_id=1, "
            "name for the requested filename, doc_class for the requested document type, "
            "author=\"agent@simulated-firm.example\", and the complete deliverable in body."
        )
    note_shapes: set[tuple[str, int]] = set()
    for tool, args in zip(task.get("walk") or [], source_args):
        if tool not in world_tool_by_name:
            continue
        table = old_tool_table(world_tool_by_name, tool)
        if tool.endswith("_create") and table and product_table_for(table) == "pm_notes":
            note_shapes.add((table, parent_mapping_for_args(table, args, by_old)))
    for table, matter_id in sorted(note_shapes):
        notes.append(
            f"A legacy {table} record is now filed through notes_create: use "
            f"matter_id={matter_id}, author_user_id=1, subject exactly {table!r}, and detail "
            "as a JSON object containing every legacy field named in the instruction."
        )
    if any(tool.startswith("analysis_job_") for tool in task.get("walk") or []):
        notes.append(
            "The analysis queue is represented by a Relativity production job: submit with "
            "productions_create, then call jobs_get until status is completed before using its result."
        )
    if not notes:
        return ""
    return "\n\nSYSTEM MIGRATION — WORLD V16\n" + "\n".join(f"- {note}" for note in notes)


def replace_tool_names(text: str, mapping: dict[str, str | None]) -> str:
    output = text
    for old in sorted(mapping, key=len, reverse=True):
        new = mapping[old]
        if new:
            output = re.sub(rf"(?<![A-Za-z0-9_]){re.escape(old)}(?![A-Za-z0-9_])", new, output)
    return output


def pack_for_task(task: dict[str, Any], pack_index: dict[tuple[str, str], dict[str, Any]]) -> dict[str, Any] | None:
    expansion = task.get("expansion") or {}
    if not expansion:
        return None
    key = (expansion.get("pack"), expansion.get("slug"))
    if key not in pack_index:
        raise KeyError(f"no source pack for {task['task_id']}: {key}")
    return pack_index[key]


def grammar_row_for_create(
    create: dict[str, Any],
    world_tool_by_name: dict[str, dict[str, Any]],
    by_old: dict[str, dict[str, dict[str, Any]]],
) -> dict[str, Any]:
    old_tool = create["tool"]
    old_args = create.get("args") or {}
    pins = copy.deepcopy(create.get("pinned") or {})
    if old_tool == "draft_matter_document":
        direct = {
            {"title": "name", "doc_type": "doc_class"}.get(field, field): value
            for field, value in pins.items()
        }
        row: dict[str, Any] = {"table": "dm_documents", "direct_pins": direct}
        grounded = create.get("grounded")
        if grounded:
            row["grounded"] = [
                {
                    "source": "direct",
                    "field": grounded["field"],
                    "min_chars": grounded.get("minChars", 0),
                    "present": grounded.get("present") or [],
                    "absent": grounded.get("absent") or [],
                }
            ]
        return row
    old_table = old_tool_table(world_tool_by_name, old_tool)
    if not old_table or product_table_for(old_table) != "pm_notes":
        raise ValueError(f"cannot compile expansion create {old_tool}")
    return {
        "table": "pm_notes",
        "direct_pins": {
            "matter_id": parent_mapping_for_args(old_table, old_args, by_old),
            "subject": old_table,
        },
        "payload_field": "detail",
        "payload_pins": pins,
    }


def map_forbidden(
    item: dict[str, Any],
) -> dict[str, Any]:
    target = map_effect_table(item["table"])
    if target == "pm_notes":
        scope: dict[str, Any] = {"subject": item["table"]}
        prefix = parent_prefix(item["table"])
        if prefix:
            scope[prefix + "_id"] = None
        return {
            "table": target,
            "source": "payload",
            "payload_field": "detail",
            "field": item["field"],
            "value": item["value"],
            "scope": {key: value for key, value in scope.items() if value is not None},
        }
    field = {"title": "name", "doc_type": "doc_class"}.get(item["field"], item["field"])
    return {"table": target, "source": "direct", "field": field, "value": item["value"]}


def task_seed(
    task: dict[str, Any],
    by_old: dict[str, dict[str, dict[str, Any]]],
    converted: dict[tuple[str, str], tuple[str, dict[str, Any]]],
) -> dict[str, Any]:
    old_seed = task.get("seed") or {}
    document_ids = [mapped_id(by_old, "matter_documents", value)
                    for value in old_seed.get("documents") or []]
    input_ids = [mapped_id(by_old, "matter_documents", value)
                 for value in old_seed.get("input_documents") or []]
    grouped: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)

    for old_id in old_seed.get("documents") or []:
        target, row = converted[("matter_documents", str(old_id))]
        grouped[target][str(row["id"])] = copy.deepcopy(row)
    for old_table, rows in (old_seed.get("core_data") or {}).items():
        pk = "id"
        for old_row in rows:
            key = (old_table, str(old_row.get(pk)))
            if key not in converted:
                raise KeyError(f"task {task['task_id']} seed references unknown row {key}")
            target, row = converted[key]
            grouped[target][str(row["id"])] = copy.deepcopy(row)
    core_data = {
        table: [rows[key] for key in sorted(rows, key=lambda value: int(value))]
        for table, rows in sorted(grouped.items())
    }
    return {
        "documents": document_ids,
        "input_documents": input_ids,
        "core_data": core_data,
        "mcp": {
            "dms": {"dm_documents": len(document_ids)},
            "product_tables": {table: len(rows) for table, rows in core_data.items()},
        },
    }


def migrate_task(
    task: dict[str, Any],
    source_args: list[dict[str, Any]],
    runtime: V2Runtime,
    world_tool_by_name: dict[str, dict[str, Any]],
    by_old: dict[str, dict[str, dict[str, Any]]],
    legacy_tables: list[dict[str, Any]],
    product_by_name: dict[str, dict[str, Any]],
    converted: dict[tuple[str, str], tuple[str, dict[str, Any]]],
    pack_index: dict[tuple[str, str], dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any] | None, dict[str, Any] | None]:
    migrated = copy.deepcopy(task)
    if task.get("method") == "v3_workflow":
        migrated["reference_args"] = copy.deepcopy(source_args)
        if task["task_id"] == "task_v3_001":
            next_matter_id = max(int(row["id"]) for row in product_by_name["pm_matters"]["sample_rows"]) + 1
            migrated["reference_args"][3]["matter_id"] = next_matter_id
        migrated["seed"] = task_seed(task, by_old, converted)
        return migrated, None, None

    tool_map = {
        tool: tool_destination(tool, world_tool_by_name)
        for tool in set(task.get("walk") or []) | set(task.get("required_tools") or [])
        if tool in world_tool_by_name
    }
    old_walk = task.get("walk") or []
    new_walk = [tool_destination(tool, world_tool_by_name) for tool in old_walk]
    if any(tool is None for tool in new_walk):
        raise ValueError(f"{task['task_id']} uses a dropped tool in its walk")
    translated_args = [
        translate_args(
            tool,
            args,
            task,
            source_args,
            world_tool_by_name,
            by_old,
            legacy_tables,
            product_by_name,
        )
        for tool, args in zip(old_walk, source_args)
    ]
    if len(translated_args) != len(new_walk):
        raise AssertionError(f"walk/args length mismatch for {task['task_id']}")
    migrated["walk"] = new_walk
    migrated["reference_args"] = translated_args
    migrated["required_tools"] = list(dict.fromkeys(
        tool_destination(tool, world_tool_by_name)
        for tool in task.get("required_tools") or old_walk
        if tool_destination(tool, world_tool_by_name) is not None
    ))
    migrated["prompt"] = replace_tool_names(task.get("prompt") or "", tool_map)
    migrated["prompt"] += migration_appendix(task, source_args, world_tool_by_name, by_old)
    migrated["goal"] = replace_tool_names(task.get("goal") or "", tool_map)
    migrated["steps"] = [replace_tool_names(step, tool_map) for step in task.get("steps") or []]
    migrated["tables_affected"] = sorted({map_effect_table(table) for table in task.get("tables_affected") or []})
    migrated["effects"] = [
        {**effect, "table": map_effect_table(effect["table"])}
        for effect in task.get("effects") or []
    ]
    migrated["expected_state_changes"] = [
        {**change, "table": map_effect_table(change["table"]), "id": "(new product row)"}
        for change in task.get("expected_state_changes") or []
    ]
    relevant = []
    for datum in task.get("relevant_data") or []:
        mapped = copy.deepcopy(datum)
        old_table = mapped["table"]
        mapped["table"] = map_effect_table(old_table)
        if "id" in mapped:
            mapped["id"] = mapped_id(by_old, old_table, mapped["id"])
        if old_table == "matter_documents" and mapped.get("field") == "title":
            mapped["field"] = "name"
        relevant.append(mapped)
    migrated["relevant_data"] = relevant
    migrated["seed"] = task_seed(task, by_old, converted)
    provenance = copy.deepcopy(task.get("provenance") or {})
    if "tool_graph_path" in provenance:
        provenance["tool_graph_path"] = [
            tool_destination(tool, world_tool_by_name) for tool in provenance["tool_graph_path"]
            if tool_destination(tool, world_tool_by_name) is not None
        ]
    if "tool_graph_edges" in provenance:
        provenance["tool_graph_edges"] = [
            "\x00".join(tool_destination(part, world_tool_by_name) or "dropped"
                          for part in edge.split("\x00"))
            for edge in provenance["tool_graph_edges"]
        ]
    provenance["surface_migration"] = {
        "from": "Gen-1 synthesized tools",
        "to": "v3 product contracts",
        "compiler": "world/migrate/gen1_to_v16.py",
    }
    migrated["provenance"] = provenance

    pack = pack_for_task(task, pack_index)
    if pack:
        rows = [grammar_row_for_create(create, world_tool_by_name, by_old)
                for create in pack.get("creates") or []]
        forbidden = [map_forbidden(item) for item in pack.get("forbidden") or []]
    else:
        rows = [{"table": map_effect_table(effect["table"])}
                for effect in task.get("effects") or [] if effect.get("op") == "insert"]
        forbidden = []

    read_tools = [name for name in new_walk
                  if runtime.tools[name]["op"]["kind"] in {"list", "get", "search", "aggregate", "job_poll"}]
    write_tools = [name for name in new_walk
                   if runtime.tools[name]["op"]["kind"] in {"create", "update"}]
    allowed_tables = {row["table"] for row in rows}
    for name in new_walk:
        if runtime.tools[name]["op"]["kind"] in {"create", "update", "job_poll"}:
            allowed_tables.add(runtime.tools[name]["op"]["table"])
    required_reads = [
        {"tool": "documents_download", "id": value}
        for value in migrated["seed"]["input_documents"]
    ]
    grammar = {
        "schema": "lawfirm.check-grammar.v1",
        "task_id": task["task_id"],
        "walk": new_walk,
        "read_tools": list(dict.fromkeys(read_tools)),
        "write_tools": list(dict.fromkeys(write_tools)),
        "required_reads": required_reads,
        "rows": rows,
        "forbidden": forbidden,
        "allowed_tables": sorted(allowed_tables),
        "source": {
            "world": "world-v15.json",
            "pack": (task.get("expansion") or {}).get("pack"),
            "slug": (task.get("expansion") or {}).get("slug"),
        },
    }
    vcode = compile_vcode(task["task_id"], grammar)
    compile(vcode, f"<{task['task_id']}-v16-verifier>", "exec")
    verifier = {
        "task_id": task["task_id"],
        "assertions": assertion_names(grammar),
        "check_grammar": grammar,
        "vcode": vcode,
        "generated_by": "world/migrate/gen1_to_v16.py",
    }
    return migrated, verifier, grammar


def build() -> dict[Path, str]:
    source_bytes = WORLD_V15.read_bytes()
    source_sha256 = sha256_bytes(source_bytes)
    world = json.loads(source_bytes)
    legacy_tables = world["tables"]
    world_tool_by_name = {tool["name"]: tool for tool in world["tools"]}
    runtime, product_tables, product_by_name = load_product_seed()
    entries, by_old = allocate_mappings(legacy_tables, product_by_name)
    source_reference_args = load_reference_args(world["tasks"], source_sha256)
    allocate_virtual_parents(
        world["tasks"], source_reference_args, entries, by_old, product_by_name
    )
    converted = materialize_legacy_rows(
        legacy_tables, entries, by_old, product_by_name
    )
    materialize_virtual_parents(entries, product_by_name)
    pack_index = load_pack_index()

    migrated_tasks: list[dict[str, Any]] = []
    migrated_verifiers: list[dict[str, Any]] = []
    grammars: dict[str, dict[str, Any]] = {}
    old_verifier_by_id = {verifier["task_id"]: verifier for verifier in world["verifiers"]}
    for task in world["tasks"]:
        reference = source_reference_args[task["task_id"]]
        canonical_task = copy.deepcopy(task)
        canonical_task["walk"] = reference["walk"]
        migrated, verifier, grammar = migrate_task(
            canonical_task,
            reference["arguments"],
            runtime,
            world_tool_by_name,
            by_old,
            legacy_tables,
            product_by_name,
            converted,
            pack_index,
        )
        migrated_tasks.append(migrated)
        migrated_verifiers.append(verifier or copy.deepcopy(old_verifier_by_id[task["task_id"]]))
        if grammar:
            grammars[task["task_id"]] = grammar

    product_names = set(runtime.tools)
    legacy_names = set(world_tool_by_name)
    for task in migrated_tasks:
        if len(task.get("walk") or []) != len(task.get("reference_args") or []):
            raise AssertionError(f"walk/reference_args mismatch in {task['task_id']}")
        stale = set(task.get("walk") or []) & legacy_names
        if stale:
            raise AssertionError(f"Gen-1 tools remain in {task['task_id']}: {sorted(stale)}")
        unknown = set(task.get("walk") or []) - product_names
        if unknown:
            raise AssertionError(f"unknown product tools in {task['task_id']}: {sorted(unknown)}")

    target = copy.deepcopy(world)
    target["world_id"] = "legal-agent-simulation-world-v16"
    target["version"] = 16
    target["created_at"] = EPOCH
    target["tables"] = product_tables
    target["tools"] = []
    target["tasks"] = migrated_tasks
    target["verifiers"] = migrated_verifiers
    target["seed_schema"] = {
        "version": "lawfirm-product-task-seed.v2",
        "note": (
            "Per-task bundles reference product tables only. documents/input_documents are "
            "dm_documents IDs; core_data contains the exact product rows to upsert."
        ),
    }
    target["surface_migration"] = {
        "schema": "lawfirm.surface-migration.v1",
        "source_world": "world-v15.json",
        "source_sha256": source_sha256,
        "compiler": "world/migrate/gen1_to_v16.py",
        "legacy_tools_removed": len(world_tool_by_name),
        "product_tools_runtime": len(runtime.tools),
        "legacy_rows_migrated": len(converted),
        "virtual_parent_rows": sum(entry["status"] != "migrated" for entry in entries),
        "tasks_migrated": len(grammars),
        "tasks_native_product": len(migrated_tasks) - len(grammars),
        "artifacts": [
            "world/migrate/id-manifest.json",
            "world/migrate/v15-reference-args.json",
            "world/migrate/check-manifest.json",
            "world/migrate/reconciliation.json",
        ],
    }
    target["thesis"]["thesis"] = (
        "Legal Agent Simulation — product-only v16: 291 deterministic legal-agent tasks "
        f"over {len(product_tables)} product-contract tables and {len(runtime.tools)} "
        "runtime tools; zero synthesized Gen-1 tools."
    )
    target["thesis"]["systems"] = [
        "LexOperis PM (Clio Manage v4)",
        "CourtDock Records (CourtListener REST v4)",
        "DiscoParse (Relativity REST)",
        "MatterVault DMS (iManage Work)",
        "Fieldstone Workspace (Google Workspace)",
        "LedgerBill (LEDES 1998B)",
    ]
    target["_note"] = (
        "world-v16 is generated from world-v15 by world/migrate/gen1_to_v16.py. "
        "Product tools are loaded from mcp/v3/contracts at runtime; the world embeds no "
        "synthesized tool specifications."
    )

    by_table: dict[str, dict[str, Any]] = {}
    for table in legacy_tables:
        old_table = table["name"]
        rows = table.get("sample_rows") or []
        table_entries = [entry for entry in entries if entry["old_table"] == old_table
                         and entry["status"] == "migrated"]
        by_table[old_table] = {
            "target_table": product_table_for(old_table),
            "rows_in": len(rows),
            "rows_out": len(table_entries),
            "mappings": {entry["old_id"]: entry["new_id"] for entry in table_entries},
        }
    tool_rows = []
    for name in sorted(world_tool_by_name):
        destination = tool_destination(name, world_tool_by_name)
        tool_rows.append(
            {
                "old_tool": name,
                "destination": destination,
                "status": "migrated" if destination else "dropped_ungraded_harness_convenience",
                "used_by_reference_walks": sum(
                    (task.get("walk") or []).count(name) for task in world["tasks"]
                ),
            }
        )

    id_manifest = {
        "schema": "lawfirm.gen1-id-manifest.v1",
        "source_world": "world-v15.json",
        "source_sha256": sha256_bytes(source_bytes),
        "target_world": "world-v16.json",
        "reserved_id_base": MIGRATION_ID_BASE,
        "tables": by_table,
        "mappings": entries,
    }
    check_manifest = {
        "schema": "lawfirm.check-manifest.v1",
        "target_world": "world-v16.json",
        "generated_verifiers": len(grammars),
        "native_product_verifiers": len(migrated_tasks) - len(grammars),
        "tasks": grammars,
    }
    source_rows = sum(len(table.get("sample_rows") or []) for table in legacy_tables)
    reconciliation = {
        "schema": "lawfirm.gen1-reconciliation.v1",
        "passed": source_rows == sum(entry["status"] == "migrated" for entry in entries) == len(converted),
        "source_tables": len(legacy_tables),
        "source_rows": source_rows,
        "mapped_rows": sum(entry["status"] == "migrated" for entry in entries),
        "materialized_rows": len(converted),
        "virtual_parent_rows": sum(entry["status"] != "migrated" for entry in entries),
        "rows_dropped": 0,
        "rows_duplicated": 0,
        "source_tools": len(world_tool_by_name),
        "tool_mappings": tool_rows,
        "tasks": len(migrated_tasks),
        "generated_verifiers": len(grammars),
        "native_product_verifiers": len(migrated_tasks) - len(grammars),
        "gen1_tools_remaining_in_walks": 0,
        "tables": [
            {"old_table": name, **{key: value for key, value in data.items() if key != "mappings"}}
            for name, data in by_table.items()
        ],
    }
    if not reconciliation["passed"]:
        raise AssertionError(f"row reconciliation failed: {reconciliation}")

    outputs = {
        WORLD_V16: pretty(target),
        ID_MANIFEST: pretty(id_manifest),
        CHECK_MANIFEST: pretty(check_manifest),
        RECONCILIATION: pretty(reconciliation),
    }
    return outputs


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="write generated artifacts")
    mode.add_argument("--check", action="store_true", help="require committed artifacts to match")
    args = parser.parse_args()
    outputs = build()
    if args.write:
        for path, text in outputs.items():
            atomic_write(path, text)
        action = "wrote"
    else:
        stale = []
        for path, text in outputs.items():
            if not path.exists() or path.read_text() != text:
                stale.append(str(path.relative_to(ROOT)))
        if stale:
            print("migration artifacts are missing or stale:")
            for path in stale:
                print(f"  - {path}")
            print("run: python3 world/migrate/gen1_to_v16.py --write")
            return 1
        action = "verified"
    reconciliation = json.loads(outputs[RECONCILIATION])
    print(
        f"{action} world-v16: {reconciliation['source_rows']} rows in == "
        f"{reconciliation['mapped_rows']} rows out across "
        f"{reconciliation['source_tables']} legacy tables; "
        f"{reconciliation['tasks']} tasks, "
        f"{reconciliation['gen1_tools_remaining_in_walks']} Gen-1 walk tools"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
