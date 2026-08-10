#!/usr/bin/env python3
"""Local world server — resurrects the hosted blobfish world from its shipped
world document (world/blobfish/world.json).

The hosted world (sbx_206712ec47f741d3) no longer resolves on blobfish.ai.
This server rebuilds the same executable surface locally, from the complete
world definition the repo ships: 74 tables with every seeded row, 102 tool
specs, 156 tasks, and 156 VCode verifiers (which we execute verbatim).

Tool behavior is synthesized deterministically from each tool's spec
(name family, type, target_tables, parameters). Fidelity is proven by
world/local/oracle.py: every task's reference walk must execute against this
server and pass its shipped VCode verifier.

Surface (matches mcp/blobfish-lawfirm-bridge.mjs BLOBFISH_LOCAL=1 mode):
  GET  /health                 — {ok, world_id, tables, tools, tasks}
  GET  /world                  — world summary
  POST /sessions               — {} -> {"session_id": ...}   (fresh copy of seed DB)
  DELETE /sessions/{id}        — drop a session
  POST /mcp                    — JSON-RPC: initialize | notifications/initialized |
                                 tools/list | tools/call   (session via Mcp-Session-Id)
  POST /verify/{task_id}       — {"trace":[...]} -> VCode verdict for the session

Friction (from world.friction, seeded, deterministic per session+call-index):
  tool_failure_signature_rate  — injected `rate_limited` / `stale_reference` errors
  ambiguous_ack_rate           — write acks that don't echo the created id
  delegation_write_cap         — hard cap on writes per session

Run:  python3 world/local/server.py [--port 8971] [--world world/blobfish/world.json]
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(BASE))
# State is namespaced per world file: two servers (original + expanded world)
# must NEVER share a seed DB — a shared seed silently poisons the other
# server's initial-state baseline and every guard assertion built on it.
STATE_DIR = os.path.join(BASE, "state")  # finalized per-world in main()
SESS_DIR = os.path.join(STATE_DIR, "sessions")
SEED_DB = os.path.join(STATE_DIR, "seed.db")


def set_state_dir(world_path: str) -> None:
    global STATE_DIR, SESS_DIR, SEED_DB
    slug = os.path.splitext(os.path.basename(world_path))[0]
    STATE_DIR = os.path.join(BASE, "state", slug)
    SESS_DIR = os.path.join(STATE_DIR, "sessions")
    SEED_DB = os.path.join(STATE_DIR, "seed.db")

# Deterministic clock: bit-identical re-runs (the world is seeded + versioned).
EPOCH = "2026-08-09T12:00:00Z"


# ---------------------------------------------------------------------------
# World loading / seed DB
# ---------------------------------------------------------------------------

def load_world(path: str) -> dict:
    with open(path) as f:
        raw = json.load(f)
    return raw.get("world", raw)


def build_seed_db(world: dict) -> None:
    os.makedirs(STATE_DIR, exist_ok=True)
    os.makedirs(SESS_DIR, exist_ok=True)
    if os.path.exists(SEED_DB):
        os.remove(SEED_DB)
    conn = sqlite3.connect(SEED_DB)
    try:
        for table in world["tables"]:
            cols = table["columns"]
            defs = []
            for c in cols:
                d = f'"{c["name"]}" {c.get("type", "TEXT")}'
                if c.get("pk"):
                    d += " PRIMARY KEY"
                defs.append(d)
            conn.execute(f'CREATE TABLE "{table["name"]}" ({", ".join(defs)})')
            col_names = [c["name"] for c in cols]
            for row in table.get("sample_rows") or []:
                vals = []
                for cn in col_names:
                    v = row.get(cn)
                    if isinstance(v, (dict, list)):
                        v = json.dumps(v)
                    vals.append(v)
                ph = ", ".join("?" for _ in col_names)
                cq = ", ".join(f'"{c}"' for c in col_names)
                conn.execute(
                    f'INSERT INTO "{table["name"]}" ({cq}) VALUES ({ph})', vals
                )
        conn.commit()
    finally:
        conn.close()


def snapshot(db_path: str) -> dict:
    """{table: [row-dicts]} — the state shape the VCode verifiers consume."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    out: dict[str, list] = {}
    try:
        tables = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%'"
            )
        ]
        for t in tables:
            out[t] = [dict(r) for r in conn.execute(f'SELECT * FROM "{t}" ORDER BY rowid')]
    finally:
        conn.close()
    return out


# ---------------------------------------------------------------------------
# Deterministic friction
# ---------------------------------------------------------------------------

class Friction:
    def __init__(self, spec: dict):
        self.fail_rate = float(spec.get("tool_failure_signature_rate") or 0.0)
        self.ack_rate = float(spec.get("ambiguous_ack_rate") or 0.0)
        self.write_cap = int(spec.get("delegation_write_cap") or 0)
        self.seed = str(spec.get("tool_failure_seed") or "seed")

    def _h(self, kind: str, tool: str, idx: int) -> float:
        h = hashlib.sha256(f"{self.seed}:{kind}:{tool}:{idx}".encode()).hexdigest()
        return int(h[:12], 16) / float(16 ** 12)

    def fails(self, tool: str, idx: int) -> str | None:
        """Return an error signature if this call is scheduled to fail."""
        v = self._h("fail", tool, idx)
        if v < self.fail_rate:
            return "rate_limited" if int(v * 1e9) % 2 == 0 else "stale_reference"
        return None

    def ambiguous_ack(self, tool: str, idx: int) -> bool:
        return self._h("ack", tool, idx) < self.ack_rate


FRICTION_MESSAGES = {
    "rate_limited": (
        "ERROR rate_limited: upstream service throttled this call. "
        "Retry the operation."
    ),
    "stale_reference": (
        "ERROR stale_reference: the referenced record snapshot is stale. "
        "Re-read the record and retry with current data."
    ),
}


# ---------------------------------------------------------------------------
# Tool synthesis
# ---------------------------------------------------------------------------

def norm_params(tool: dict) -> list[dict]:
    """Normalize the spec's parameters into [{name, type}]."""
    p = tool.get("parameters")
    out = []
    if isinstance(p, dict):
        for name, spec in p.items():
            t = spec.get("type", "string") if isinstance(spec, dict) else str(spec)
            out.append({"name": name, "type": t})
    elif isinstance(p, list):
        for item in p:
            if isinstance(item, dict) and item.get("name"):
                out.append({"name": item["name"], "type": item.get("type", "string")})
    return out


def json_type(t: str) -> str:
    t = (t or "string").lower()
    if t in ("int", "integer"):
        return "integer"
    if t in ("float", "real", "number", "double"):
        return "number"
    if t in ("bool", "boolean"):
        return "boolean"
    return "string"


PREVIEW_CHARS = 240


class ToolRuntime:
    """Executes one synthesized tool against a session DB."""

    def __init__(self, world: dict):
        self.world = world
        self.tools = {t["name"]: t for t in world["tools"]}
        self.tables = {t["name"]: t for t in world["tables"]}
        # id prefix per TEXT-pk table, derived from seeded rows (e.g.
        # legal_matters_audit_events rows carry ids legal_matters_audit_event_NNN).
        self.id_prefix: dict[str, str] = {}
        for t in world["tables"]:
            pk = next((c for c in t["columns"] if c.get("pk")), None)
            if not pk or pk.get("type") != "TEXT":
                continue
            rows = t.get("sample_rows") or []
            prefix = None
            for r in rows:
                rid = str(r.get(pk["name"], ""))
                m = re.match(r"^(.*?_)(\d+)$", rid)
                if m:
                    prefix = m.group(1)
                    break
            self.id_prefix[t["name"]] = prefix or (t["name"] + "_")

    # -- helpers ------------------------------------------------------------
    def _text_columns(self, table: str) -> list[str]:
        return [
            c["name"]
            for c in self.tables[table]["columns"]
            if (c.get("type") or "TEXT").upper() == "TEXT"
        ]

    def _columns(self, table: str) -> list[str]:
        return [c["name"] for c in self.tables[table]["columns"]]

    def _pk(self, table: str) -> dict:
        return next(
            (c for c in self.tables[table]["columns"] if c.get("pk")),
            {"name": "id", "type": "TEXT"},
        )

    def _next_id(self, conn: sqlite3.Connection, table: str):
        pk = self._pk(table)
        if pk.get("type") == "INTEGER":
            row = conn.execute(f'SELECT MAX("{pk["name"]}") FROM "{table}"').fetchone()
            return (row[0] or 0) + 1
        prefix = self.id_prefix.get(table, table + "_")
        n = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        while True:
            n += 1
            cand = f"{prefix}{n:03d}"
            hit = conn.execute(
                f'SELECT 1 FROM "{table}" WHERE "{pk["name"]}" = ?', (cand,)
            ).fetchone()
            if not hit:
                return cand

    @staticmethod
    def _rowdicts(cur) -> list[dict]:
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    def _missing_args_error(self, name: str, missing: list[str]) -> str:
        n = len(missing)
        if n == 1:
            arglist = f"'{missing[0]}'"
            noun = "argument"
        else:
            noun = "arguments"
            quoted = [f"'{m}'" for m in missing]
            arglist = ", ".join(quoted[:-1]) + f", and {quoted[-1]}" if n > 2 else f"{quoted[0]} and {quoted[1]}"
        return f"TypeError: {name}() missing {n} required positional {noun}: {arglist}"

    # -- dispatch -----------------------------------------------------------
    def call(self, conn: sqlite3.Connection, name: str, args: dict) -> tuple[bool, str]:
        tool = self.tools.get(name)
        if tool is None:
            return False, f"ERROR: unknown tool '{name}'"
        args = args if isinstance(args, dict) else {}
        # Hosted envelopes sometimes wrap arguments; unwrap one level.
        if set(args.keys()) == {"arguments"} and isinstance(args["arguments"], dict):
            args = args["arguments"]
        params = norm_params(tool)
        targets = tool.get("target_tables") or []
        is_write = tool.get("type") == "write"

        if is_write:
            missing = [p["name"] for p in params if args.get(p["name"]) in (None, "")]
            if missing:
                return False, self._missing_args_error(name, missing)

        try:
            if name.endswith("_audit_list"):
                return self._audit_list(conn, targets[0], params, args)
            if name.endswith("_list") and not is_write:
                return self._entity_list(conn, targets[0], args)
            if name.endswith("_get"):
                return self._entity_get(conn, targets[0], args)
            if name == "read_matter_document":
                return self._read_record(conn, "matter_documents", args.get("id"))
            if name == "read_file":
                return self._read_file(conn, args)
            if name.startswith("query_"):
                return self._query(conn, targets[0], params, args)
            if name.startswith("search_"):
                return self._search(conn, targets[0], args)
            if name.startswith("lookup_") and len(targets) == 2:
                return self._lookup_join(conn, targets, args)
            if name.endswith("_records_agent"):
                return self._records_agent(conn, targets, args)
            if name == "draft_matter_document":
                return self._insert(
                    conn, "matter_documents",
                    {"title": args["title"], "doc_type": args["doc_type"],
                     "body": args["body"], "related_shape": None},
                    name,
                )
            if name.endswith("_create") and targets:
                row = {p["name"]: args.get(p["name"]) for p in params}
                if "created_at" in self._columns(targets[0]):
                    row["created_at"] = EPOCH
                return self._insert(conn, targets[0], row, name)
            if name == "save_memory":
                return self._insert(conn, "agent_memories", {"content": args["content"]}, name)
            if name == "add_to_knowledge":
                return self._insert(
                    conn, "agent_knowledge",
                    {"content": args["content"], "source": args.get("source")}, name)
            if name == "create_playbook":
                return self._insert(
                    conn, "agent_playbooks",
                    {"name": args["name"], "steps": args["steps"]}, name)
            if name == "create_scheduled_run":
                return self._insert(
                    conn, "agent_scheduled_runs",
                    {"name": args["name"], "schedule": args["schedule"],
                     "playbook_name": args.get("playbook_name")}, name)
            if name.startswith("update_"):
                return self._update(conn, targets[0], name, args)
            if name == "document_agent":
                return self._insert(
                    conn, "agent_documents",
                    {"title": str(args.get("request", ""))[:80],
                     "body": str(args.get("request", "")), "updated_at": EPOCH}, name)
            if name == "calendar_agent":
                return self._insert(
                    conn, "agent_events",
                    {"title": str(args.get("request", ""))[:120],
                     "event_date": EPOCH[:10], "created_at": EPOCH}, name)
            if name == "sheet_agent":
                ok, _ = self._insert(
                    conn, "agent_sheets",
                    {"name": str(args.get("request", ""))[:80]}, name)
                return ok, json.dumps({"status": "sheet created", "request": str(args.get("request", ""))[:200]})
            if name.endswith("_workflow_agent"):
                # Delegation surface: record the request as a work note; the
                # verifiers grade direct tool paths, not delegated ones.
                return True, json.dumps({
                    "status": "delegation acknowledged",
                    "note": "workflow agent recorded the request; perform "
                            "precise changes with the direct tools",
                    "request": str(args.get("request", ""))[:400],
                })
            if name.endswith("_list"):
                return self._entity_list(conn, targets[0], args)
            return False, f"ERROR: tool '{name}' has no synthesized behavior"
        except sqlite3.Error as e:
            return False, f"ERROR sqlite: {e}"
        except KeyError as e:
            return False, f"ERROR: missing argument {e}"

    # -- family implementations --------------------------------------------
    def _entity_list(self, conn, table, args):
        limit = int(args.get("limit") or 50)
        cols = self._columns(table)
        where, vals = "", []
        if args.get("status") and "status" in cols:
            where = ' WHERE "status" = ?'
            vals.append(args["status"])
        cur = conn.execute(f'SELECT * FROM "{table}"{where} ORDER BY rowid LIMIT ?', (*vals, limit))
        rows = self._rowdicts(cur)
        for r in rows:
            for k, v in r.items():
                if isinstance(v, str) and len(v) > PREVIEW_CHARS:
                    r[k] = v[:PREVIEW_CHARS] + "…"
        return True, json.dumps({"table": table, "count": len(rows), "rows": rows}, default=str)

    def _entity_get(self, conn, table, args):
        rid = args.get("id")
        if rid in (None, ""):
            return False, self._missing_args_error("get", ["id"])
        pk = self._pk(table)["name"]
        cur = conn.execute(f'SELECT * FROM "{table}" WHERE "{pk}" = ?', (rid,))
        rows = self._rowdicts(cur)
        if not rows:
            return False, f"ERROR: no {table} record with id '{rid}'"
        return True, json.dumps(rows[0], default=str)

    def _audit_list(self, conn, table, params, args):
        limit = int(args.get("limit") or 50)
        cols = self._columns(table)
        where, vals = [], []
        for p in params:
            n = p["name"]
            if n == "limit" or args.get(n) in (None, ""):
                continue
            if n in cols:
                where.append(f'"{n}" = ?')
                vals.append(args[n])
        wsql = (" WHERE " + " AND ".join(where)) if where else ""
        cur = conn.execute(f'SELECT * FROM "{table}"{wsql} ORDER BY rowid LIMIT ?', (*vals, limit))
        rows = self._rowdicts(cur)
        return True, json.dumps({"table": table, "count": len(rows), "rows": rows}, default=str)

    def _read_record(self, conn, table, rid):
        if rid in (None, ""):
            return False, self._missing_args_error("read_matter_document", ["id"])
        pk = self._pk(table)["name"]
        cur = conn.execute(f'SELECT * FROM "{table}" WHERE "{pk}" = ?', (rid,))
        rows = self._rowdicts(cur)
        if not rows:
            return False, f"ERROR: no {table} record with id '{rid}'"
        return True, json.dumps(rows[0], default=str)

    def _read_file(self, conn, args):
        fn = args.get("filename")
        if not fn:
            return False, self._missing_args_error("read_file", ["filename"])
        cur = conn.execute('SELECT * FROM "agent_files" WHERE "filename" = ?', (fn,))
        rows = self._rowdicts(cur)
        if not rows:
            return False, f"ERROR: no file named '{fn}'"
        return True, json.dumps(rows[0], default=str)

    def _query(self, conn, table, params, args):
        """Column-filter query. String filters match as substring; long text
        columns come back as previews — use the read tool for full bodies."""
        limit = int(args.get("limit") or 25)
        cols = self._columns(table)
        where, vals = [], []
        for p in params:
            n = p["name"]
            if n == "limit" or n not in cols or args.get(n) in (None, ""):
                continue
            if json_type(p["type"]) in ("integer", "number"):
                where.append(f'"{n}" = ?')
                vals.append(args[n])
            else:
                where.append(f'"{n}" LIKE ?')
                vals.append(f"%{args[n]}%")
        wsql = (" WHERE " + " AND ".join(where)) if where else ""
        cur = conn.execute(f'SELECT * FROM "{table}"{wsql} ORDER BY rowid LIMIT ?', (*vals, limit))
        rows = self._rowdicts(cur)
        preview_note = False
        for r in rows:
            for k, v in r.items():
                if isinstance(v, str) and len(v) > PREVIEW_CHARS:
                    r[k] = v[:PREVIEW_CHARS] + "…[preview]"
                    preview_note = True
        out = {"table": table, "count": len(rows), "rows": rows}
        if preview_note and table == "matter_documents":
            out["note"] = (
                "body fields are previews — call read_matter_document(id) "
                "to read a document in full before using it"
            )
        return True, json.dumps(out, default=str)

    def _search(self, conn, table, args):
        q = str(args.get("query") or "")
        limit = int(args.get("limit") or 20)
        tcols = self._text_columns(table)
        if not q or not tcols:
            cur = conn.execute(f'SELECT * FROM "{table}" ORDER BY rowid LIMIT ?', (limit,))
            return True, json.dumps({"table": table, "rows": self._rowdicts(cur)}, default=str)
        where = " OR ".join(f'"{c}" LIKE ?' for c in tcols)
        vals = [f"%{q}%"] * len(tcols)
        cur = conn.execute(f'SELECT * FROM "{table}" WHERE {where} ORDER BY rowid LIMIT ?', (*vals, limit))
        return True, json.dumps({"table": table, "query": q, "rows": self._rowdicts(cur)}, default=str)

    def _lookup_join(self, conn, targets, args):
        rid = args.get("id")
        if rid in (None, ""):
            return False, self._missing_args_error("lookup", ["id"])
        primary, related = targets[0], targets[1]
        pk = self._pk(primary)["name"]
        cur = conn.execute(f'SELECT * FROM "{primary}" WHERE "{pk}" = ?', (rid,))
        rows = self._rowdicts(cur)
        if not rows:
            return False, f"ERROR: no {primary} record with id '{rid}'"
        row = rows[0]
        out = {primary: row}
        fk_col = next(
            (c["name"] for c in self.tables[primary]["columns"]
             if (c.get("fk") or "").startswith(related + ".")),
            None,
        )
        if fk_col and row.get(fk_col) is not None:
            rcur = conn.execute(
                f'SELECT * FROM "{related}" WHERE "{self._pk(related)["name"]}" = ?',
                (row[fk_col],),
            )
            rrows = self._rowdicts(rcur)
            if rrows:
                out[related] = rrows[0]
        return True, json.dumps(out, default=str)

    def _records_agent(self, conn, targets, args):
        req = str(args.get("request") or "")
        words = [w for w in re.findall(r"[A-Za-z0-9_\-]{4,}", req)][:8]
        hits = []
        for table in targets:
            tcols = self._text_columns(table)
            if not tcols:
                continue
            for w in words:
                where = " OR ".join(f'"{c}" LIKE ?' for c in tcols)
                vals = [f"%{w}%"] * len(tcols)
                cur = conn.execute(
                    f'SELECT * FROM "{table}" WHERE {where} LIMIT 3', vals
                )
                for r in self._rowdicts(cur):
                    for k, v in r.items():
                        if isinstance(v, str) and len(v) > PREVIEW_CHARS:
                            r[k] = v[:PREVIEW_CHARS] + "…[preview]"
                    hits.append({"table": table, "row": r})
                if len(hits) >= 12:
                    break
            if len(hits) >= 12:
                break
        return True, json.dumps({
            "request": req[:300],
            "matches": hits[:12],
            "note": "previews only — use the table's read/get tools for full records",
        }, default=str)

    def _insert(self, conn, table, values, tool_name):
        cols = self._columns(table)
        pk = self._pk(table)["name"]
        row = {k: v for k, v in values.items() if k in cols}
        if pk not in row or row.get(pk) in (None, ""):
            row[pk] = self._next_id(conn, table)
        for extra in ("created_at", "updated_at"):
            if extra in cols and extra not in row:
                row[extra] = EPOCH
        cq = ", ".join(f'"{c}"' for c in row)
        ph = ", ".join("?" for _ in row)
        vals = [json.dumps(v) if isinstance(v, (dict, list)) else v for v in row.values()]
        conn.execute(f'INSERT INTO "{table}" ({cq}) VALUES ({ph})', vals)
        conn.commit()
        return True, json.dumps({"status": "created", "table": table, "id": row[pk]})

    def _update(self, conn, table, name, args):
        rid = args.get("id")
        if rid in (None, ""):
            return False, self._missing_args_error(name, ["id"])
        pk = self._pk(table)["name"]
        cols = self._columns(table)
        sets, vals = [], []
        for k, v in args.items():
            if k in ("id",) or v is None:
                continue
            col = k
            if col == "new_status":
                col = "status"
            if col in cols:
                sets.append(f'"{col}" = ?')
                vals.append(v)
        if not sets:
            return False, f"ERROR: {name}: no updatable fields supplied"
        if "updated_at" in cols:
            sets.append('"updated_at" = ?')
            vals.append(EPOCH)
        cur = conn.execute(
            f'UPDATE "{table}" SET {", ".join(sets)} WHERE "{pk}" = ?', (*vals, rid)
        )
        conn.commit()
        if cur.rowcount == 0:
            return False, f"ERROR: no {table} record with id '{rid}'"
        return True, json.dumps({"status": "updated", "table": table, "id": rid})


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

class Session:
    def __init__(self, sid: str):
        self.id = sid
        self.db_path = os.path.join(SESS_DIR, f"{sid}.db")
        shutil.copyfile(SEED_DB, self.db_path)
        self.call_index = 0
        self.write_count = 0

    def close(self):
        try:
            os.remove(self.db_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------

def make_handler(world: dict, runtime: ToolRuntime, friction: Friction,
                 initial_state: dict, verifiers: dict):
    sessions: dict[str, Session] = {}
    world_tools_mcp = []
    for t in world["tools"]:
        params = norm_params(t)
        props = {
            p["name"]: {"type": json_type(p["type"])}
            for p in params
        }
        required = [p["name"] for p in params] if t.get("type") == "write" else []
        desc = (t.get("description") or "")[:700]
        hint = t.get("input_format")
        if hint:
            desc = f"{desc} Input: {str(hint)[:180]}"
        world_tools_mcp.append({
            "name": t["name"],
            "description": desc,
            "inputSchema": {"type": "object", "properties": props,
                            **({"required": required} if required else {})},
        })

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *a):  # quiet
            pass

        def _json(self, code: int, obj) -> None:
            data = json.dumps(obj, default=str).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _body(self) -> dict:
            n = int(self.headers.get("Content-Length") or 0)
            if not n:
                return {}
            try:
                return json.loads(self.rfile.read(n).decode() or "{}")
            except json.JSONDecodeError:
                return {}

        def _session(self) -> Session | None:
            sid = (self.headers.get("Mcp-Session-Id")
                   or self.headers.get("X-Blobfish-Session"))
            return sessions.get(sid) if sid else None

        # ------------------------------------------------------------- GET
        def do_GET(self):
            if self.path == "/health":
                return self._json(200, {
                    "ok": True, "world_id": world.get("world_id"),
                    "tables": len(world["tables"]), "tools": len(world["tools"]),
                    "tasks": len(world["tasks"]), "sessions": len(sessions),
                })
            if self.path == "/world":
                return self._json(200, {
                    "world_id": world.get("world_id"),
                    "company": (world.get("thesis") or {}).get("company"),
                    "tables": len(world["tables"]), "tools": len(world["tools"]),
                    "tasks": len(world["tasks"]),
                })
            return self._json(404, {"error": "not_found"})

        # ---------------------------------------------------------- DELETE
        def do_DELETE(self):
            self._body()  # drain any body — see do_POST
            m = re.match(r"^/sessions/([\w\-]+)$", self.path)
            if m:
                s = sessions.pop(m.group(1), None)
                if s:
                    s.close()
                return self._json(200, {"deleted": bool(s)})
            return self._json(404, {"error": "not_found"})

        # ------------------------------------------------------------- POST
        def do_POST(self):
            # Always drain the request body FIRST: an unread body on a
            # keep-alive connection corrupts the next request on it (the
            # leftover bytes parse as a garbage request line → HTML 400).
            body = self._body()

            if self.path == "/sessions":
                sid = uuid.uuid4().hex[:16]
                sessions[sid] = Session(sid)
                return self._json(200, {"session_id": sid})

            m = re.match(r"^/verify/([\w\-]+)$", self.path)
            if m:
                return self._verify(m.group(1), body)

            if self.path == "/mcp":
                return self._mcp(body)

            return self._json(404, {"error": "not_found"})

        # ------------------------------------------------------------ verify
        def _verify(self, task_id: str, body: dict):
            v = verifiers.get(task_id)
            if not v:
                return self._json(404, {"error": f"no verifier for {task_id}"})
            sess = self._session()
            if not sess:
                return self._json(400, {"error": "missing or unknown session header"})
            trace = body.get("trace") or []
            final_state = snapshot(sess.db_path)
            ns: dict = {}
            try:
                exec(v["vcode"], ns)  # shipped verifier code, executed verbatim
                verdict = ns["verify"](copy.deepcopy(initial_state), final_state, trace)
            except Exception as e:  # noqa: BLE001 — surface verifier bugs
                return self._json(500, {"error": f"verifier crashed: {e!r}"})
            return self._json(200, verdict)

        # --------------------------------------------------------------- mcp
        def _mcp(self, body: dict):
            msg = body
            mid = msg.get("id")
            method = msg.get("method", "")
            params = msg.get("params") or {}

            def rpc(result):
                return self._json(200, {"jsonrpc": "2.0", "id": mid, "result": result})

            def rpc_err(code, message):
                return self._json(200, {"jsonrpc": "2.0", "id": mid,
                                        "error": {"code": code, "message": message}})

            if method == "initialize":
                return rpc({
                    "protocolVersion": params.get("protocolVersion", "2025-06-18"),
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "lawfirm-local-world", "version": "1.0.0"},
                    "world": {
                        "worldId": world.get("world_id"),
                        "company": (world.get("thesis") or {}).get("company")
                                   or "Eve Litigation (SIMULATED)",
                        "runtime": "local — hydrated from world/blobfish/world.json",
                    },
                })
            if method.startswith("notifications/"):
                return self._json(200, {"ok": True})
            if method == "ping":
                return rpc({})
            if method == "tools/list":
                return rpc({"tools": world_tools_mcp})
            if method == "tools/call":
                sess = self._session()
                if not sess:
                    return rpc_err(-32000, "missing or unknown session header")
                name = params.get("name")
                args = params.get("arguments") or {}
                tool = runtime.tools.get(name)
                if tool is None:
                    return rpc_err(-32602, f"Unknown tool '{name}'")
                sess.call_index += 1
                sig = friction.fails(name, sess.call_index)
                if sig:
                    return rpc({"content": [{"type": "text",
                                             "text": FRICTION_MESSAGES[sig]}],
                                "isError": True})
                if tool.get("type") == "write":
                    if friction.write_cap and sess.write_count >= friction.write_cap:
                        return rpc({"content": [{"type": "text",
                                                 "text": "ERROR delegation_write_cap: "
                                                         "write budget for this session "
                                                         "is exhausted"}],
                                    "isError": True})
                conn = sqlite3.connect(sess.db_path)
                try:
                    ok, text = runtime.call(conn, name, args)
                finally:
                    conn.close()
                if ok and tool.get("type") == "write":
                    sess.write_count += 1
                    if friction.ambiguous_ack(name, sess.call_index):
                        text = ("Request accepted and queued for processing. "
                                "The record change will be reflected shortly.")
                return rpc({"content": [{"type": "text", "text": text}],
                            "isError": not ok})
            return rpc_err(-32601, f"Method not found: {method}")

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8971)
    ap.add_argument("--world", default=os.path.join(ROOT, "world", "blobfish", "world.json"))
    args = ap.parse_args()

    set_state_dir(args.world)
    world = load_world(args.world)
    print(f"[local-world] loading {args.world} (state: {STATE_DIR})", file=sys.stderr)
    build_seed_db(world)
    initial_state = snapshot(SEED_DB)
    runtime = ToolRuntime(world)
    friction = Friction(world.get("friction") or {})
    verifiers = {v["task_id"]: v for v in world.get("verifiers") or []}

    rows = sum(len(t) for t in initial_state.values())
    print(f"[local-world] world {world.get('world_id')} — "
          f"{len(world['tables'])} tables / {rows} rows / "
          f"{len(world['tools'])} tools / {len(world['tasks'])} tasks / "
          f"{len(verifiers)} verifiers", file=sys.stderr)

    handler = make_handler(world, runtime, friction, initial_state, verifiers)
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"[local-world] serving on http://127.0.0.1:{args.port}", file=sys.stderr)
    srv.serve_forever()


if __name__ == "__main__":
    main()
