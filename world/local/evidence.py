"""Read-only external evidence behind the product-shaped DMS tools.

Large corpora stay outside per-session SQLite state. A task declares one
evidence store; search/get/download calls are answered in the iManage-shaped
envelope while writes continue through the ordinary dm_documents table.
"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any

LAB_ID_BASE = 1_700_000_000
CH_ID_BASE = 1_800_000_000
SUPPORTED_TOOLS = {
    "documents_search", "documents_search_fulltext", "documents_get", "documents_download",
}


def _fts_query(value: str) -> str:
    if value.strip() == "*":
        return "*"
    pieces = re.findall(r'"([^"\n]{2,160})"|\b(AND|OR|NOT)\b|([\w.-]+\*?)',
                        value, flags=re.UNICODE)
    explicit_boolean = any(operator for _, operator, _ in pieces)
    output: list[str] = []
    terms = 0
    for phrase, operator, word in pieces:
        if operator:
            output.append(operator)
            continue
        token = phrase or word
        if len(token.rstrip("*")) < 2:
            continue
        terms += 1
        if terms > 12:
            break
        if word.endswith("*"):
            output.append('"' + word[:-1].replace('"', '""') + '"*')
        else:
            output.append('"' + token.replace('"', '""') + '"')
    if not output:
        return ""
    if not explicit_boolean:
        return " OR ".join(output)
    expect_term = True
    for token in output:
        is_operator = token in {"AND", "OR", "NOT"}
        if token == "NOT":
            if not expect_term:
                return ""
            continue
        if is_operator == expect_term:
            return ""
        expect_term = not expect_term
    return "" if expect_term else " ".join(output)


def _envelope(rows: list[dict[str, Any]], total: int, offset: int, limit: int) -> str:
    next_offset = offset + len(rows) if offset + len(rows) < total else None
    return json.dumps({
        "data": {
            "total": total,
            "offset": offset,
            "limit": limit,
            "has_more": next_offset is not None,
            "next_offset": next_offset,
            "results": rows,
        }
    }, default=str)


class ExternalEvidence:
    def __init__(self, config: dict[str, Any], root: Path):
        self.config = config
        self.kind = str(config.get("kind") or "")
        configured = config.get("path")
        if configured:
            path = Path(configured)
            self.store = (path if path.is_absolute() else root / path).resolve()
        elif self.kind == "lab":
            self.store = (root / "world" / "corpus" / "lab").resolve()
        elif self.kind == "ch":
            self.store = (root / "world" / "corpus" / "ch").resolve()
        else:
            raise ValueError(f"unsupported evidence store kind {self.kind!r}")
        self.database = self.store / "index.sqlite"
        if not self.database.is_file():
            raise RuntimeError(f"external evidence index missing: {self.database}")

    @classmethod
    def for_task(cls, task: dict[str, Any] | None, root: Path) -> "ExternalEvidence | None":
        config = (task or {}).get("evidence_store")
        return cls(config, root) if config else None

    def call(self, name: str, args: dict[str, Any]) -> tuple[bool, str] | None:
        if name not in SUPPORTED_TOOLS:
            return None
        if name in {"documents_search", "documents_search_fulltext"}:
            return self._search(args)
        return self._get(args, download=name == "documents_download")

    @staticmethod
    def _profile(row: sqlite3.Row, document_id: int, *, body: str | None = None) -> dict[str, Any]:
        profile = {
            "id": document_id,
            "folder_id": 1,
            "workspace_id": 1,
            "name": row["filename"],
            "doc_class": "INPUT_MATERIAL",
            "author": "source:harvey-labs",
            "edit_date": "2026-08-10T12:00:00Z",
            "checked_out_by": None,
            "latest_version": 1,
        }
        if "matter_id" in row.keys() and row["matter_id"]:
            profile["matter_id"] = row["matter_id"]
        if "client_id" in row.keys() and row["client_id"]:
            profile["client_id"] = row["client_id"]
        if body is not None:
            profile["body"] = body
        return profile

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(f"file:{self.database}?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        return connection

    def _search(self, args: dict[str, Any]) -> tuple[bool, str]:
        query = str(args.get("query") or args.get("anywhere") or args.get("name") or "").strip()
        if not query:
            return False, "ERROR 400: query required"
        try:
            limit = min(100, max(1, int(args.get("limit") or 20)))
            offset = max(0, int(args.get("offset") or 0))
        except (TypeError, ValueError):
            return False, "ERROR 400: limit and offset must be integers"
        fts = _fts_query(query)
        if not fts:
            return False, "ERROR 400: query must contain a searchable term"
        try:
            with self._connect() as connection:
                if self.kind == "lab":
                    task_id = self.config.get("task_id")
                    if not task_id:
                        return False, "ERROR external_evidence: LAB task_id is missing"
                    # ``documents_search_fulltext`` promises names as well as
                    # bodies.  Exact profile hits take precedence so an agent
                    # can discover a named source deterministically even when
                    # generic filename tokens also occur in document text.
                    if query == "*":
                        total = connection.execute(
                            "SELECT COUNT(*) FROM files WHERE task_id=?", (task_id,)
                        ).fetchone()[0]
                        rows = connection.execute(
                            """SELECT f.ordinal,f.filename,f.relative_path,b.text_path,b.parse_status
                                 FROM files f JOIN blobs b ON b.sha256=f.blob_sha256
                                WHERE f.task_id=? ORDER BY f.ordinal LIMIT ? OFFSET ?""",
                            (task_id, limit, offset),
                        ).fetchall()
                    else:
                        total = connection.execute(
                            "SELECT COUNT(*) FROM files WHERE task_id=? AND filename=? COLLATE NOCASE",
                            (task_id, query),
                        ).fetchone()[0]
                    if query != "*" and total:
                        total = connection.execute(
                            "SELECT COUNT(*) FROM files WHERE task_id=? AND filename=? COLLATE NOCASE",
                            (task_id, query),
                        ).fetchone()[0]
                        rows = connection.execute(
                            """SELECT f.ordinal,f.filename,f.relative_path,b.text_path,b.parse_status
                                 FROM files f JOIN blobs b ON b.sha256=f.blob_sha256
                                WHERE f.task_id=? AND f.filename=? COLLATE NOCASE
                                ORDER BY f.ordinal LIMIT ? OFFSET ?""",
                            (task_id, query, limit, offset),
                        ).fetchall()
                    elif query != "*":
                        base = (
                            " FROM blobs_fts x JOIN files f ON f.blob_sha256=x.sha256 "
                            "JOIN blobs b ON b.sha256=f.blob_sha256 "
                            "WHERE f.task_id=? AND blobs_fts MATCH ?"
                        )
                        total = connection.execute("SELECT COUNT(*)" + base, (task_id, fts)).fetchone()[0]
                        rows = connection.execute(
                            "SELECT f.ordinal,f.filename,f.relative_path,b.text_path,b.parse_status" + base +
                            " ORDER BY bm25(blobs_fts),f.ordinal LIMIT ? OFFSET ?",
                            (task_id, fts, limit, offset),
                        ).fetchall()
                        if total == 0:
                            like = f"%{query}%"
                            total = connection.execute(
                                "SELECT COUNT(*) FROM files WHERE task_id=? AND filename LIKE ?",
                                (task_id, like),
                            ).fetchone()[0]
                            rows = connection.execute(
                                """SELECT f.ordinal,f.filename,f.relative_path,b.text_path,b.parse_status
                                     FROM files f JOIN blobs b ON b.sha256=f.blob_sha256
                                    WHERE f.task_id=? AND f.filename LIKE ?
                                    ORDER BY f.ordinal LIMIT ? OFFSET ?""",
                                (task_id, like, limit, offset),
                            ).fetchall()
                    profiles = [self._profile(row, LAB_ID_BASE + int(row["ordinal"])) for row in rows]
                else:
                    has_fts = connection.execute(
                        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='files_fts'"
                    ).fetchone()
                    if not has_fts:
                        return False, "ERROR external_evidence_missing_fts: rebuild the C&H full-text index"
                    matter = re.search(r"\b\d{4}-\d{5}\b", query)
                    if query == "*":
                        total = connection.execute("SELECT COUNT(*) FROM files").fetchone()[0]
                        rows = connection.execute(
                            """SELECT id,filename,matter_id,client_id,text_path,parse_error
                                 FROM files ORDER BY id LIMIT ? OFFSET ?""",
                            (limit, offset),
                        ).fetchall()
                    elif matter:
                        total = connection.execute(
                            "SELECT COUNT(*) FROM files WHERE matter_id=?", (matter.group(),)
                        ).fetchone()[0]
                        rows = connection.execute(
                            """SELECT id,filename,matter_id,client_id,text_path,parse_error FROM files
                                WHERE matter_id=? ORDER BY id LIMIT ? OFFSET ?""",
                            (matter.group(), limit, offset),
                        ).fetchall()
                    else:
                        base = " FROM files_fts x JOIN files f ON f.id=x.file_id WHERE files_fts MATCH ?"
                        total = connection.execute("SELECT COUNT(*)" + base, (fts,)).fetchone()[0]
                        rows = connection.execute(
                            "SELECT f.id,f.filename,f.matter_id,f.client_id,f.text_path,f.parse_error" + base +
                            " ORDER BY bm25(files_fts),f.id LIMIT ? OFFSET ?",
                            (fts, limit, offset),
                        ).fetchall()
                    profiles = [self._profile(row, CH_ID_BASE + int(row["id"])) for row in rows]
        except sqlite3.Error as exc:
            return False, f"ERROR external_evidence_query: {exc}"
        return True, _envelope(profiles, total, offset, limit)

    def _get(self, args: dict[str, Any], download: bool) -> tuple[bool, str]:
        try:
            document_id = int(args.get("id"))
        except (TypeError, ValueError):
            return False, "TypeError: document id must be an integer"
        try:
            with self._connect() as connection:
                if self.kind == "lab":
                    ordinal = document_id - LAB_ID_BASE
                    row = connection.execute(
                        """SELECT f.ordinal,f.filename,f.relative_path,b.sha256 AS blob_sha256,
                                  b.text_path,b.parse_status
                             FROM files f JOIN blobs b ON b.sha256=f.blob_sha256
                            WHERE f.task_id=? AND f.ordinal=?""",
                        (self.config.get("task_id"), ordinal),
                    ).fetchone()
                    status = row["parse_status"] if row else None
                else:
                    file_id = document_id - CH_ID_BASE
                    row = connection.execute(
                        """SELECT f.id,f.filename,f.matter_id,f.client_id,f.text_path,f.parse_error
                             FROM files f
                            WHERE f.id=?""",
                        (file_id,),
                    ).fetchone()
                    status = "parsed" if row and not row["parse_error"] else "failed"
                if not row:
                    return False, f"ERROR 404: no external document with id {document_id}"
                body = None
                if download:
                    if status != "parsed":
                        return False, f"ERROR 422: document {document_id} could not be text-extracted"
                    text_path = row["text_path"]
                    if not text_path:
                        return False, f"ERROR 422: document {document_id} has no extracted body"
                    target = (self.store / text_path).resolve()
                    if self.store not in target.parents:
                        return False, "ERROR external_evidence: text path escapes store"
                    if target.is_file():
                        body = target.read_text("utf-8", errors="replace")
                    elif self.kind == "lab":
                        embedded = connection.execute(
                            "SELECT content FROM blobs_fts WHERE sha256=? LIMIT 1",
                            (row["blob_sha256"],),
                        ).fetchone()
                        if not embedded:
                            return False, f"ERROR 422: document {document_id} has no packaged body"
                        body = embedded["content"]
                    else:
                        embedded = connection.execute(
                            "SELECT content FROM files_fts WHERE file_id=? LIMIT 1",
                            (file_id,),
                        ).fetchone()
                        if not embedded:
                            return False, f"ERROR 422: document {document_id} has no packaged body"
                        body = embedded["content"]
                profile = self._profile(row, document_id, body=body)
        except (OSError, sqlite3.Error) as exc:
            return False, f"ERROR external_evidence_read: {exc}"
        return True, json.dumps({"data": profile}, default=str)
