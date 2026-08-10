"""v2 contract runtime — executes the per-product tool contracts in
mcp/v2/contracts/*.json against SQLite: deterministic seeding (fixed-seed
PRNG, no LLM) and a data-driven executor (list/get/create/update/search/
aggregate) so a dense real-API-mirrored surface needs zero per-tool code.
"""
from __future__ import annotations

import json
import os
import sqlite3

try:
    from v3dialects import translate_args, wrap_output
except ImportError:  # v3 layer optional
    translate_args = None
    wrap_output = None

EPOCH = "2026-08-10T12:00:00Z"


# ------------------------------------------------------------------ PRNG
class Rng:
    def __init__(self, seed: int = 0x5EED_1A3):
        self.s = seed & 0xFFFFFFFF

    def next(self) -> int:
        self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
        return self.s

    def int(self, lo: int, hi: int) -> int:
        return lo + self.next() % (hi - lo + 1)

    def money(self, lo: float, hi: float) -> float:
        return round(lo + (self.next() % 10_000) / 10_000 * (hi - lo), 2)

    def pick(self, xs):
        return xs[self.next() % len(xs)]


FIRST = ["Mara", "Devlin", "Priya", "Jonas", "Aiko", "Tomas", "Nadia", "Wes",
         "Celine", "Rohan", "Ingrid", "Marcus", "Yara", "Felix", "Dana", "Omar"]
LAST = ["Calloway", "Whitfield", "Okafor", "Lindqvist", "Marchetti", "Tanaka",
        "Beaumont", "Ellery", "Vasquez", "Holt", "Kessler", "Abara", "Novak", "Reyes"]
ORGS = ["Meridian Cloud", "Talvern Logistics", "Harbor Systems", "Ironwood Ops",
        "Bluewater Components", "Argent Motors", "Summit Holdings", "Corvess Analytics",
        "Halcyon Therapeutics", "Silverline Data", "Northgale Industries", "Fairview Works"]
AREAS = ["Antitrust", "Arbitration", "Financing", "Restructuring", "Securities",
         "Contract", "Governance", "Acquisition", "Privacy", "Employment", "Patent", "Lease"]
NARR = ["Review and revise draft agreement; correspondence with opposing counsel",
        "Analyze discovery responses; prepare deficiency letter",
        "Research controlling authority re limitation of liability; memo to partner",
        "Prepare deposition outline; review key exhibits",
        "Draft motion section; cite-check; conference with team",
        "Client call re strategy; follow-up summary email",
        "Review disclosure schedules against data room index"]
DOCKET_DESC = ["COMPLAINT filed", "SUMMONS issued", "ANSWER to complaint",
               "MOTION to dismiss", "OPPOSITION to motion", "REPLY in support",
               "ORDER granting in part", "MINUTE ENTRY: status conference",
               "STIPULATION and proposed order", "NOTICE of appearance",
               "DECLARATION in support", "EXHIBIT list filed"]
FILING_TEXT = ("This document is synthetic simulation content. It sets out the parties' "
               "positions, the operative facts as pleaded, and the relief requested, "
               "with numbered paragraphs and defined terms used consistently throughout. ")


def _gen_value(directive, rng: Rng, counts: dict, row: dict):
    if directive is None or not isinstance(directive, str) or not directive.startswith("@"):
        return directive
    d = directive[1:]
    if d == "person":
        return f"{rng.pick(FIRST)} {rng.pick(LAST)}"
    if d == "email":
        return f"{rng.pick(FIRST).lower()}.{rng.pick(LAST).lower()}@simulated-firm.example"
    if d == "phone":
        return f"555-{rng.int(1000, 9999)}"
    if d == "company":
        return rng.pick(ORGS)
    if d == "org_or_person":
        return rng.pick(ORGS) if rng.int(0, 2) else f"{rng.pick(FIRST)} {rng.pick(LAST)}"
    if d.startswith("pick:"):
        return rng.pick(d[5:].split(","))
    if d.startswith("money:"):
        lo, hi = d[6:].split(",")
        return rng.money(float(lo), float(hi))
    if d.startswith("int:"):
        lo, hi = d[4:].split(",")
        return rng.int(int(lo), int(hi))
    if d.startswith("date:"):
        a, b = d[5:].split(",")
        y1, m1, _ = a.split("-")
        y2, m2, _ = b.split("-")
        y = rng.int(int(y1), int(y2))
        m = rng.int(1, 12) if y1 != y2 else rng.int(int(m1), int(m2))
        return f"{y:04d}-{m:02d}-{rng.int(1, 28):02d}"
    if d.startswith("ref:"):
        n = counts.get(d[4:], 1)
        return rng.int(1, max(1, n))
    if d.startswith("derived:"):
        expr = d[8:]
        try:
            return round(eval(expr, {"__builtins__": {}}, dict(row)), 2)  # noqa: S307 (fields only)
        except Exception:
            return 0
    if d.startswith("id_list:"):
        return ",".join(str(rng.int(1, 14)) for _ in range(rng.int(1, 3)))
    if d == "matter_number":
        return f"{rng.int(1, 999):05d}-{rng.pick(ORGS).split()[0]}"
    if d == "matter_name":
        return f"{rng.pick(ORGS)} {rng.pick(AREAS)} Matter"
    if d == "matter_description":
        return f"{rng.pick(AREAS)} engagement for {rng.pick(ORGS)}; scope per engagement letter."
    if d in ("time_narrative", "expense_narrative", "note_detail", "comm_body"):
        return rng.pick(NARR)
    if d == "bill_number":
        return f"INV-{rng.int(10000, 99999)}"
    if d == "trust_amount":
        return rng.pick([1, 1, -1]) * rng.money(500, 45000)
    if d == "trust_memo":
        return rng.pick(["Retainer deposit per engagement letter", "Filing fee disbursement",
                         "Expert retainer disbursement", "Earned fees transferred per invoice",
                         "Settlement funds received in trust"])
    if d in ("event_summary",):
        return rng.pick(["Status conference", "Deposition — custodian", "Client strategy meeting",
                         "Mediation session", "Filing deadline", "Expert prep call"])
    if d == "task_name":
        return rng.pick(["Draft responses to RFPs", "Cite-check brief", "Prepare privilege log",
                         "Update conflicts memo", "Assemble closing set", "Circulate engagement letter"])
    if d in ("note_subject", "comm_subject"):
        return rng.pick(["Scheduling", "Discovery dispute", "Settlement posture", "Fee arrangement",
                         "Document production", "Expert disclosure", "Board update"])
    if d == "docket_number":
        return f"{rng.int(1, 9)}:{rng.int(20, 26)}-cv-{rng.int(1000, 9999)}"
    if d == "case_name":
        return f"{rng.pick(ORGS)} v. {rng.pick(ORGS)}"
    if d == "judge":
        return f"Hon. {rng.pick(FIRST)} {rng.pick(LAST)}"
    if d == "docket_entry":
        return rng.pick(DOCKET_DESC)
    if d in ("filing_text", "opinion_text"):
        return FILING_TEXT * rng.int(3, 8)
    if d == "citation":
        return f"{rng.int(100, 899)} Sim. {rng.pick(['2d', '3d'])} {rng.int(100, 999)}"
    if d == "opinion_snippet":
        return "…the court holds that the parties' agreement controls and the motion is "
    if d == "doc_name":
        return rng.pick(["Engagement Letter", "MSA Draft v3", "Deposition Outline", "Board Deck",
                         "Settlement Model", "Privilege Log", "Closing Checklist"]) + f" — {rng.pick(ORGS)}"
    if d == "control_number":
        return f"{rng.pick(['MER', 'TAL', 'DEF'])}{rng.int(100000, 999999)}"
    if d == "cell":
        return f"{rng.pick('ABCDEFG')}{rng.int(1, 40)}"
    if d == "sheet_value":
        return str(rng.pick([rng.int(100, 99999), rng.money(1000, 250000),
                             rng.pick(["open", "closed", "pending", "Q3", "forecast"])]))
    return directive


class V2Runtime:
    def __init__(self, contracts_dir: str):
        self.contracts = []
        self.tools = {}
        self.tables = {}
        for f in sorted(os.listdir(contracts_dir)):
            if not f.endswith(".json"):
                continue
            c = json.load(open(os.path.join(contracts_dir, f)))
            self.contracts.append(c)
            for t in c["tables"]:
                self.tables[t["name"]] = t
            for tool in c["tools"]:
                tool["_system"] = c["system"]
                tool["_product"] = c["product"]
                tool["_dialect"] = c.get("dialect")
                self.tools[tool["name"]] = tool

    # ---------------------------------------------------------------- seed
    def create_and_seed(self, conn: sqlite3.Connection) -> None:
        rng = Rng()
        counts = {}
        for c in self.contracts:
            for t in c["tables"]:
                cols = ", ".join(
                    f'"{col["name"]}" {col["type"]}' + (" PRIMARY KEY" if col.get("pk") else "")
                    for col in t["columns"])
                conn.execute(f'CREATE TABLE IF NOT EXISTS "{t["name"]}" ({cols})')
                seed = t.get("seed") or {}
                rows = seed.get("rows")
                if rows is None and seed.get("template"):
                    rows = [dict(seed["template"]) for _ in range(seed.get("count", 0))]
                for raw in rows or []:
                    row = {}
                    for col in t["columns"]:
                        n = col["name"]
                        if col.get("pk"):
                            continue
                        row[n] = _gen_value(raw.get(n), rng, counts, row)
                    cq = ", ".join(f'"{k}"' for k in row)
                    ph = ", ".join("?" for _ in row)
                    conn.execute(f'INSERT INTO "{t["name"]}" ({cq}) VALUES ({ph})',
                                 [json.dumps(v) if isinstance(v, (list, dict)) else v
                                  for v in row.values()])
                counts[t["name"]] = conn.execute(
                    f'SELECT COUNT(*) FROM "{t["name"]}"').fetchone()[0]
        conn.commit()

    # ------------------------------------------------------------ mcp glue
    def mcp_tools(self) -> list[dict]:
        out = []
        for tool in self.tools.values():
            props = {p: {"type": {"integer": "integer", "number": "number"}.get(ty, "string")}
                     for p, ty in (tool.get("params") or {}).items()}
            required = tool["op"].get("required", []) if tool["op"]["kind"] == "create" else []
            out.append({
                "name": tool["name"],
                "description": f'[{tool["_product"].split("(")[0].strip()}] {tool["description"]} '
                               f'(mirrors {tool["mirrors"].split(" — ")[0].split(" (")[0]})',
                "inputSchema": {"type": "object", "properties": props,
                                **({"required": required} if required else {})},
            })
        return out

    # ------------------------------------------------------------- execute
    def call(self, conn: sqlite3.Connection, name: str, args: dict) -> tuple[bool, str]:
        ok, text = self._call_raw(conn, name, args)
        tool = self.tools.get(name)
        if tool is not None and tool.get("_dialect") and wrap_output is not None:
            ok, text = wrap_output(tool["_dialect"], tool, ok, text)
        return ok, text

    def _call_raw(self, conn: sqlite3.Connection, name: str, args: dict) -> tuple[bool, str]:
        tool = self.tools.get(name)
        if tool is None:
            return False, f"ERROR: unknown tool '{name}'"
        op = tool["op"]
        kind = op["kind"]
        table = op["table"]
        args = args if isinstance(args, dict) else {}
        if tool.get("_dialect") and translate_args is not None:
            args = translate_args(tool, args)
        try:
            if kind == "list":
                return self._list(conn, op, args)
            if kind == "get":
                return self._get(conn, op, args, name)
            if kind == "search":
                return self._search(conn, op, args)
            if kind == "create":
                return self._create(conn, op, args, name)
            if kind == "update":
                return self._update(conn, op, args, name)
            if kind == "aggregate":
                return self._aggregate(conn, op, args)
            return False, f"ERROR: unsupported op kind '{kind}'"
        except sqlite3.Error as e:
            return False, f"ERROR sqlite: {e}"

    @staticmethod
    def _rows(cur):
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    @staticmethod
    def _clip(rows, preview_fields):
        for r in rows:
            for f in preview_fields or []:
                v = r.get(f)
                if isinstance(v, str) and len(v) > 240:
                    r[f] = v[:240] + "…[preview — use the get tool for full text]"
        return rows

    def _where(self, op, args):
        clauses, vals = [], []
        for f in op.get("filters", []):
            if args.get(f) not in (None, ""):
                clauses.append(f'"{f}" = ?')
                vals.append(args[f])
        rng = op.get("range")
        if rng:
            if args.get(rng["from_param"]):
                clauses.append(f'"{rng["field"]}" >= ?')
                vals.append(args[rng["from_param"]])
            if args.get(rng["to_param"]):
                clauses.append(f'"{rng["field"]}" <= ?')
                vals.append(args[rng["to_param"]])
        return (" WHERE " + " AND ".join(clauses)) if clauses else "", vals

    def _list(self, conn, op, args):
        where, vals = self._where(op, args)
        limit = int(args.get("limit") or 25)
        cur = conn.execute(f'SELECT * FROM "{op["table"]}"{where} ORDER BY rowid LIMIT ?',
                           (*vals, limit))
        rows = self._clip(self._rows(cur), op.get("preview"))
        return True, json.dumps({"count": len(rows), "results": rows}, default=str)

    def _get(self, conn, op, args, name):
        rid = args.get("id")
        if rid in (None, ""):
            return False, f"TypeError: {name}() missing 1 required positional argument: 'id'"
        cur = conn.execute(f'SELECT * FROM "{op["table"]}" WHERE id = ?', (rid,))
        rows = self._rows(cur)
        if not rows:
            return False, f"ERROR 404: no {op['table']} record with id {rid}"
        row = rows[0]
        red = op.get("redact")
        if red and all(row.get(k) == v for k, v in red["when"].items()):
            for f in red["fields"]:
                row[f] = red["message"]
        return True, json.dumps(row, default=str)

    def _search(self, conn, op, args):
        q = str(args.get("query") or args.get("citation") or "").strip()
        limit = int(args.get("limit") or 20)
        if not q:
            return False, "ERROR 400: query required"
        if op.get("exactish"):
            f = op["fields"][0]
            cur = conn.execute(
                f'SELECT * FROM "{op["table"]}" WHERE LOWER("{f}") = LOWER(?) LIMIT ?', (q, limit))
        else:
            where = " OR ".join(f'"{f}" LIKE ?' for f in op["fields"])
            cur = conn.execute(
                f'SELECT * FROM "{op["table"]}" WHERE {where} ORDER BY rowid LIMIT ?',
                (*[f"%{q}%"] * len(op["fields"]), limit))
        rows = self._clip(self._rows(cur), op.get("preview"))
        return True, json.dumps({"query": q, "count": len(rows), "results": rows}, default=str)

    def _create(self, conn, op, args, name):
        missing = [p for p in op.get("required", []) if args.get(p) in (None, "")]
        if missing:
            n = len(missing)
            lst = ", ".join(f"'{m}'" for m in missing)
            return False, (f"TypeError: {name}() missing {n} required positional "
                           f"argument{'s' if n > 1 else ''}: {lst}")
        tdef = self.tables[op["table"]]
        cols = [c["name"] for c in tdef["columns"] if not c.get("pk")]
        row = {k: v for k, v in {**op.get("defaults", {}), **args}.items() if k in cols}
        for f, expr in (op.get("computed") or {}).items():
            try:
                env = {k: (row.get(k) or 0) for k in cols}
                row[f] = round(eval(expr, {"__builtins__": {}}, env), 2)  # noqa: S307
            except Exception:
                pass
        if "created_at" in cols and "created_at" not in row:
            row["created_at"] = EPOCH
        cq = ", ".join(f'"{k}"' for k in row)
        ph = ", ".join("?" for _ in row)
        cur = conn.execute(f'INSERT INTO "{op["table"]}" ({cq}) VALUES ({ph})',
                           list(row.values()))
        conn.commit()
        return True, json.dumps({"id": cur.lastrowid, "created": op["table"], **row}, default=str)

    def _update(self, conn, op, args, name):
        rid = args.get("id")
        if rid in (None, ""):
            return False, f"TypeError: {name}() missing 1 required positional argument: 'id'"
        cur = conn.execute(f'SELECT * FROM "{op["table"]}" WHERE id = ?', (rid,))
        rows = self._rows(cur)
        if not rows:
            return False, f"ERROR 404: no {op['table']} record with id {rid}"
        current = rows[0]
        for f, msg in (op.get("require_null") or {}).items():
            if args.get(f) not in (None, "") and current.get(f) not in (None, ""):
                return False, f"ERROR 409: {msg} (by {current.get(f)})"
        sets, vals = [], []
        row = dict(current)
        for f in op.get("allowed", []):
            if args.get(f) is not None:
                sets.append(f'"{f}" = ?')
                vals.append(args[f])
                row[f] = args[f]
        for f, expr in (op.get("computed") or {}).items():
            try:
                env = {k: (row.get(k) or 0) for k in row}
                sets.append(f'"{f}" = ?')
                vals.append(round(eval(expr, {"__builtins__": {}}, env), 2))  # noqa: S307
            except Exception:
                pass
        if not sets:
            return False, f"ERROR 400: no updatable fields supplied to {name}"
        conn.execute(f'UPDATE "{op["table"]}" SET {", ".join(sets)} WHERE id = ?', (*vals, rid))
        conn.commit()
        return True, json.dumps({"id": rid, "updated": op["table"],
                                 "fields": [s.split(" ")[0].strip('"') for s in sets]})

    def _aggregate(self, conn, op, args):
        where, vals = self._where(op, args)
        cur = conn.execute(
            f'SELECT {op["agg"].upper()}("{op["field"]}") AS value, COUNT(*) AS n '
            f'FROM "{op["table"]}"{where}', vals)
        r = self._rows(cur)[0]
        return True, json.dumps({"aggregate": op["agg"], "field": op["field"],
                                 "value": round(r["value"] or 0, 2), "rows_considered": r["n"]})
