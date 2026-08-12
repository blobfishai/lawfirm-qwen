#!/usr/bin/env python3
"""Compile v16 plus deterministic Harvey LAB imports into world-v17."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from world.local.evidence import CH_ID_BASE, _fts_query  # noqa: E402
from world.v17.verifiers import retrieval_vcode  # noqa: E402

DEFAULT_BASE = ROOT / "world" / "blobfish" / "world-v16.json"
DEFAULT_FK = ROOT / "world" / "port" / "bundles" / "harvey-firm-knowledge.json"
DEFAULT_LAB = ROOT / "world" / "port" / "determinate" / "lab-assertions.jsonl"
DEFAULT_OUT = ROOT / "world" / "blobfish" / "world-v17.json"
DEFAULT_REPORT = ROOT / "world" / "v17" / "build-report.json"
CH_INDEX = ROOT / "world" / "corpus" / "ch" / "index.sqlite"
ZERO_SEARCHES = {
    "fk_012": '"springing lien"',
    "fk_061": '"deal-by-deal waterfall"',
    "fk_082": '"semiconductor" AND "injunction" AND litigat*',
    "fk_098": '"2x" AND "base salary"',
    "fk_138": 'dissenter* AND exercis*',
    "fk_215": '"sale-side exit"',
}


def _first_ch_document(matter_id: str) -> int:
    if not CH_INDEX.is_file():
        raise RuntimeError(f"C&H index missing: {CH_INDEX}")
    connection = sqlite3.connect(f"file:{CH_INDEX}?mode=ro", uri=True)
    row = connection.execute(
        "SELECT id FROM files WHERE matter_id=? AND parse_error IS NULL ORDER BY id LIMIT 1",
        (matter_id,),
    ).fetchone()
    connection.close()
    if not row:
        raise RuntimeError(f"no readable C&H evidence for matter {matter_id}")
    return CH_ID_BASE + int(row[0])


def _ch_matter_exists(matter_id: str) -> bool:
    connection = sqlite3.connect(f"file:{CH_INDEX}?mode=ro", uri=True)
    row = connection.execute("SELECT 1 FROM files WHERE matter_id=? LIMIT 1", (matter_id,)).fetchone()
    connection.close()
    return bool(row)


def _any_ch_document() -> int:
    connection = sqlite3.connect(f"file:{CH_INDEX}?mode=ro", uri=True)
    row = connection.execute(
        "SELECT id FROM files WHERE parse_error IS NULL ORDER BY id LIMIT 1"
    ).fetchone()
    connection.close()
    if not row:
        raise RuntimeError("C&H has no readable evidence")
    return CH_ID_BASE + int(row[0])


def _ch_search_document_ids(query: str) -> list[int]:
    fts = _fts_query(query)
    if not fts or fts == "*":
        return []
    connection = sqlite3.connect(f"file:{CH_INDEX}?mode=ro", uri=True)
    rows = connection.execute(
        """SELECT f.id FROM files_fts x JOIN files f ON f.id=x.file_id
            WHERE files_fts MATCH ? AND f.parse_error IS NULL
            ORDER BY bm25(files_fts),f.id""",
        (fts,),
    ).fetchall()
    connection.close()
    return [CH_ID_BASE + int(row[0]) for row in rows]


def _ch_file_count() -> int:
    connection = sqlite3.connect(f"file:{CH_INDEX}?mode=ro", uri=True)
    count = int(connection.execute("SELECT COUNT(*) FROM files").fetchone()[0])
    connection.close()
    return count


def _empty_key_contract(source: dict[str, Any]) -> tuple[list[list[str]], str]:
    if source["id"] == "fk_210":
        clients = ["Cascade Retail", "Lumos Analytics", "Quorum Insurance",
                   "Dunmore Energy", "Aurelius Media", "Penterra Pharma"]
        groups = [[client] for client in clients] + [["10 matters"], ["9 matters"]]
        body = ("Top clients by matter count:\n"
                "- Cascade Retail — 10 matters\n- Lumos Analytics — 10 matters\n"
                "- Quorum Insurance — 10 matters\n- Dunmore Energy — 9 matters\n"
                "- Aurelius Media — 9 matters\n- Penterra Pharma — 9 matters")
        return groups, body
    return [["no qualifying", "zero qualifying", "none found"]], (
        "No qualifying matters were found after exhaustive review of the firm DMS."
    )


def _retrieval_task(source: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    task_id = f"lab_{source['id']}"
    source_gold = sorted(set(source.get("expected") or []))
    gold = [matter_id for matter_id in source_gold if _ch_matter_exists(matter_id)]
    excluded_aliases = sorted(set(source_gold) - set(gold))
    anchor_groups: list[list[str]] = []
    paging_required = False
    search_plan: list[dict[str, Any]] = []
    read_ids: list[int] = []
    if gold:
        for matter_id in gold:
            read_ids.append(_first_ch_document(matter_id))
            search_plan.append({"query": matter_id, "limit": 10, "offset": 0})
        body = "Qualifying matters (source-grounded):\n" + "\n".join(f"- {matter_id}" for matter_id in gold)
    elif source["id"] == "fk_210":
        anchor_groups, body = _empty_key_contract(source)
        page_size = 100
        search_plan = [{"query": "*", "limit": page_size, "offset": offset}
                       for offset in range(0, _ch_file_count(), page_size)]
        paging_required = True
    else:
        anchor_groups, body = _empty_key_contract(source)
        query = ZERO_SEARCHES[source["id"]]
        read_ids = _ch_search_document_ids(query)
        page_size = 10
        search_plan = [{"query": query, "limit": page_size, "offset": offset}
                       for offset in range(0, max(1, len(read_ids)), page_size)]
    prompt = (
        source["prompt"].rstrip() +
        "\n\nUse MatterVault DMS full-text search, page until no results remain, and open the "
        "supporting records in full. File `firm-knowledge-response.md` to the DMS with an "
        "all-and-only list of qualifying matter IDs. Do not leave the answer only in chat."
    )
    walk = ["documents_search_fulltext" for _ in search_plan]
    reference_args: list[dict[str, Any]] = list(search_plan)
    walk.extend("documents_download" for _ in read_ids)
    reference_args.extend({"id": document_id} for document_id in read_ids)
    walk.append("documents_create")
    reference_args.append(
        {"folder_id": 1, "workspace_id": 1, "name": "firm-knowledge-response.md",
         "doc_class": "MEMO", "author": "oracle@simulated-firm.example", "body": body}
    )
    task = {
        "task_id": task_id,
        "outcome_class": "eligible_action",
        "prompt": prompt,
        "goal": source.get("title") or source["prompt"][:120],
        "required_tools": walk,
        "complexity": "high" if len(gold) >= 5 else "medium",
        "method": "harvey_lab_firm_knowledge_deterministic",
        "steps": ["Search the shared firm DMS exhaustively", "Open supporting records in full",
                  "File an all-and-only matter list to the DMS"],
        "relevant_data": [{"external_store": "ch", "gold_matter_ids": gold,
                           "required_document_ids": read_ids}],
        "expected_state_changes": [{"table": "dm_documents", "field": "name",
                                    "value": "firm-knowledge-response.md"}],
        "tables_affected": ["dm_documents"],
        "walk": walk,
        "reference_args": reference_args,
        "effects": [{"table": "dm_documents", "op": "insert"}],
        "provenance": {"source_repo": "harveyai/harvey-labs", **source.get("provenance", {}),
                       "source_gold_aliases_excluded": excluded_aliases},
        "difficulty_tier": "pending_triage",
        "acceptance_label": "admitted_deterministic_retrieval",
        "evidence_store": {"kind": "ch"},
        "grading": {"kind": "gold_set" if gold else "determinate_empty_or_anchor_set",
                    "beta": 2.0, "gold_count": len(gold),
                    "required_anchor_groups": anchor_groups,
                    "paging_required": paging_required},
    }
    verifier = {
        "task_id": task_id,
        "assertions": ["required_workflow_path", "required_search_discovery", "required_documents_read",
                       "deliverable_filed_to_dms", "required_grounded_anchors",
                       "gold_set_complete", "no_over_inclusion",
                       "no_offtask_table_changes", "no_documents_destroyed"],
        "vcode": retrieval_vcode(task_id, gold, read_ids, anchor_groups,
                                  paging_required=paging_required),
        "generated_by": "world/v17/build.py",
    }
    return task, verifier


def build(base_path: Path, fk_path: Path, lab_path: Path, out_path: Path,
          report_path: Path, retrieval_only: bool = False) -> dict[str, Any]:
    raw = json.loads(base_path.read_text("utf-8"))
    world = raw.get("world", raw)
    base_tasks = len(world["tasks"])
    existing = {task["task_id"] for task in world["tasks"]}
    fk = json.loads(fk_path.read_text("utf-8"))
    retrieval = 0
    for source in fk["tasks"]:
        task, verifier = _retrieval_task(source)
        if task["task_id"] in existing:
            raise RuntimeError(f"duplicate v17 task id {task['task_id']}")
        world["tasks"].append(task)
        world["verifiers"].append(verifier)
        existing.add(task["task_id"])
        retrieval += 1

    practice = 0
    practice_result: dict[str, Any] = {}
    grounding_result: dict[str, Any] = {}
    if not retrieval_only:
        if not lab_path.is_file():
            raise RuntimeError(f"compiled LAB assertions missing: {lab_path}")
        # Practice import is appended by the same compiler once its measured
        # artifact is present. Keeping this explicit prevents a partial file
        # from silently becoming a published world.
        practice_rows = [json.loads(line) for line in lab_path.read_text("utf-8").splitlines() if line]
        if len(practice_rows) != 1760:
            raise RuntimeError(f"expected 1,760 practice rows, got {len(practice_rows)}")
        from world.v17.ground_existing import ground_existing_graph_tasks
        grounding_result = ground_existing_graph_tasks(world, practice_rows)
        represented = set(grounding_result["represented_lab_sources"])
        remaining_rows = [row for row in practice_rows if row["source_task"] not in represented]
        from world.v17.practice import append_practice_tasks
        practice_result = append_practice_tasks(world, remaining_rows, existing)
        practice = practice_result.get("added", 0)

    world["version"] = 17
    world["world_id"] = "legal-agent-simulation-world-v17"
    world["lineage"] = {
        "base": str(base_path.relative_to(ROOT)),
        "harvey_lab_source": "harveyai/harvey-labs@60071cc424d6",
        "compiler": "world/v17/build.py",
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(raw, ensure_ascii=False, sort_keys=False, separators=(",", ":")) + "\n"
    temporary = out_path.with_suffix(out_path.suffix + ".tmp")
    temporary.write_text(payload, "utf-8")
    temporary.replace(out_path)
    report = {
        "schema_version": 1,
        "base_tasks": base_tasks,
        "retrieval_tasks": retrieval,
        "practice_tasks": practice,
        "practice_import": practice_result,
        "existing_graph_grounding": grounding_result,
        "total_tasks": len(world["tasks"]),
        "verifiers": len(world["verifiers"]),
        "world_sha256": hashlib.sha256(payload.encode()).hexdigest(),
        "retrieval_grading": {"metric": "F-beta", "beta": 2.0,
                              "reports": ["precision", "recall", "over_included"]},
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", "utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, default=DEFAULT_BASE)
    parser.add_argument("--firm-knowledge", type=Path, default=DEFAULT_FK)
    parser.add_argument("--lab-assertions", type=Path, default=DEFAULT_LAB)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--retrieval-only", action="store_true")
    args = parser.parse_args()
    report = build(args.base.resolve(), args.firm_knowledge.resolve(),
                   args.lab_assertions.resolve(), args.out.resolve(),
                   args.report.resolve(), args.retrieval_only)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
