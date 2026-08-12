#!/usr/bin/env python3
"""Fail-closed structural gate for the commit-pinned LAB port bundles."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load(relative: str):
    return json.loads((ROOT / relative).read_text())


def main() -> int:
    lock = load("world/ingest/lab-source-lock.json")
    practice = load("world/port/bundles/harvey-practice.json")
    knowledge = load("world/port/bundles/harvey-firm-knowledge.json")
    commits = load("research/repos-commits.json")
    commit = commits["harveyai@harvey-labs"]

    assert lock["source_commit"] == commit
    assert practice["source"]["commit"] == knowledge["source"]["commit"] == commit
    assert len(practice["tasks"]) == 1760
    assert len(knowledge["tasks"]) == 250
    assert len(practice["tasks"]) + len(knowledge["tasks"]) == lock["tasks"] == 2010
    practice_criteria = sum(task["criteria_count"] for task in practice["tasks"])
    knowledge_criteria = sum(len(task["criteria"]) for task in knowledge["tasks"])
    assert practice_criteria + knowledge_criteria == lock["criteria"] == 114437
    assert practice["documents"]["external_store"] == "world/corpus/lab"
    assert knowledge["documents"]["external_store"] == "world/corpus/ch"
    assert lock["documents"] == 51683
    assert lock["shared_documents"] == 9288

    lane = practice["file_lane"]
    assert lane["tasks"] == 1760
    assert lane["exact_filename_contracts"] == 1758
    assert lane["missing_filename_contracts"] == [
        "lab_contracts__commercial-vendor-customer__master-services-agreement-counterparty-paper-review__scenario-02",
        "lab_contracts__commercial-vendor-customer__vendor-services-agreement-term-negotiation__scenario-03",
    ]
    assert all(task["file_lane"]["source_commit"] == commit for task in practice["tasks"])
    assert all(task["provenance"]["path"] ==
               f"tasks/{task['file_lane']['source_task']}/task.json"
               for task in practice["tasks"])

    ch_index = ROOT / "world" / "corpus" / "ch" / "index.sqlite"
    if ch_index.is_file():
        connection = sqlite3.connect(f"file:{ch_index}?mode=ro", uri=True)
        count = connection.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        failures = connection.execute("SELECT COUNT(*) FROM files WHERE parse_error IS NOT NULL").fetchone()[0]
        connection.close()
        assert (count, failures) == (9288, 0)

    print("LAB port: 2,010/2,010 tasks, 114,437 criteria, 60,971 input files, 1,758 exact output contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
