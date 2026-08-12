#!/usr/bin/env python3
"""Add a deterministic FTS5 index to the existing C&H evidence catalogue."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STORE = ROOT / "world" / "corpus" / "ch"
DEFAULT_REPORT = ROOT / "world" / "corpus" / "ch-fts-report.json"
SOURCE_LOCK = ROOT / "world" / "ingest" / "lab-source-lock.json"
VERSION = "1"


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", "utf-8")
    temporary.replace(path)


def source_tree() -> str:
    lock = json.loads(SOURCE_LOCK.read_text("utf-8"))
    sets = {row["corpus_id"]: row for row in lock["shared_document_sets"]}
    return sets["ch"]["tree_sha256"]


def build(store: Path, report_path: Path) -> dict[str, Any]:
    store = store.resolve()
    database = store / "index.sqlite"
    if not database.is_file():
        raise RuntimeError(f"C&H index missing: {database}")
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        "SELECT id,text_path,chars,parse_error FROM files ORDER BY id"
    ).fetchall()
    text_tree = hashlib.sha256()
    inserted = chars = 0
    connection.execute("DROP TABLE IF EXISTS files_fts")
    connection.execute("CREATE VIRTUAL TABLE files_fts USING fts5(file_id UNINDEXED,content,tokenize='unicode61')")
    for index, row in enumerate(rows, 1):
        if row["parse_error"] or not row["text_path"]:
            continue
        target = (store / row["text_path"]).resolve()
        if store not in target.parents:
            raise RuntimeError(f"text path escapes corpus: {row['text_path']}")
        text = target.read_text("utf-8", errors="replace")
        digest = hashlib.sha256(text.encode()).hexdigest()
        text_tree.update(f"{row['id']}\0{row['text_path']}\0{digest}\0{len(text)}\n".encode())
        connection.execute("INSERT INTO files_fts(file_id,content) VALUES (?,?)", (row["id"], text))
        inserted += 1
        chars += len(text)
        if index % 1000 == 0:
            connection.commit()
            print(f"  indexed {index}/{len(rows)} files", flush=True)
    connection.execute("CREATE TABLE IF NOT EXISTS corpus_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
    metadata = {
        "fts_version": VERSION,
        "source_tree_sha256": source_tree(),
        "text_tree_sha256": text_tree.hexdigest(),
        "indexed_files": inserted,
        "indexed_chars": chars,
    }
    connection.executemany(
        "INSERT OR REPLACE INTO corpus_metadata(key,value) VALUES (?,?)",
        ((key, json.dumps(value, sort_keys=True)) for key, value in sorted(metadata.items())),
    )
    connection.commit()
    fts_rows = connection.execute("SELECT COUNT(*) FROM files_fts").fetchone()[0]
    connection.close()
    if fts_rows != inserted:
        raise RuntimeError(f"FTS row mismatch: {fts_rows} != {inserted}")
    report = {
        "schema_version": 1,
        **metadata,
        "catalogue_files": len(rows),
        "parse_failures": len(rows) - inserted,
        "database": "world/corpus/ch/index.sqlite",
    }
    write_json(report_path, report)
    return report


def check(store: Path, report_path: Path) -> None:
    report = json.loads(report_path.read_text("utf-8"))
    if report.get("source_tree_sha256") != source_tree():
        raise RuntimeError("C&H FTS report does not match the pinned LAB shared evidence tree")
    database = store / "index.sqlite"
    if not database.is_file():
        print(f"C&H FTS report: {report['indexed_files']:,} files locked (materialized store absent)")
        return
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "files_fts" not in tables:
        raise RuntimeError("C&H materialized store lacks files_fts")
    count = connection.execute("SELECT COUNT(*) FROM files_fts").fetchone()[0]
    connection.close()
    if count != report.get("indexed_files"):
        raise RuntimeError(f"C&H FTS count mismatch: {count} != {report.get('indexed_files')}")
    print(f"C&H FTS: {count:,} files verified")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--store", type=Path, default=DEFAULT_STORE)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        check(args.store.resolve(), args.report.resolve())
        return 0
    report = build(args.store.resolve(), args.report.resolve())
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
