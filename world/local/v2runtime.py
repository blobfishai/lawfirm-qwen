"""v2 contract runtime — executes the per-product tool contracts in
mcp/v2/contracts/*.json against SQLite: deterministic seeding (fixed-seed
PRNG, no LLM) and a data-driven executor (list/get/create/update/search/
aggregate) so a dense real-API-mirrored surface needs zero per-tool code.
"""
from __future__ import annotations

import json
import gzip
import os
import sqlite3
import copy

try:
    from v3dialects import translate_args, wrap_output
except ImportError:  # v3 layer optional
    translate_args = None
    wrap_output = None

try:
    from product_workflows import execute_special
except ImportError:  # package import in unit tests
    from .product_workflows import execute_special

try:
    from query_dsl import QuerySyntaxError, gmail_where, relativity_where, vendor_error
except ImportError:  # package import in unit tests
    from .query_dsl import QuerySyntaxError, gmail_where, relativity_where, vendor_error

EPOCH = "2026-08-10T12:00:00Z"


def _wire_type_error(tool: dict, args: dict) -> str | None:
    """Validate provided top-level wire parameters before any state change."""
    expected_python = {
        "string": (str,),
        "integer": (int,),
        "number": (int, float),
        "boolean": (bool,),
        "object": (dict,),
        "array": (list,),
    }
    for name, definition in (tool.get("params") or {}).items():
        if name not in args or args[name] is None:
            continue
        schema = definition if isinstance(definition, dict) else {"type": definition}
        declared = schema.get("type", "string")
        types = declared if isinstance(declared, list) else [declared]
        value = args[name]
        valid = False
        for type_name in types:
            if type_name == "null" and value is None:
                valid = True
            elif type_name in expected_python:
                valid = isinstance(value, expected_python[type_name])
                if type_name in {"integer", "number"} and isinstance(value, bool):
                    valid = False
            if valid:
                break
        if not valid:
            return f"{name}: expected {' or '.join(types)}, got {type(value).__name__}"
        if schema.get("enum") is not None and value not in schema["enum"]:
            return f"{name}: unsupported value {value!r}"
    return None


# ------------------------------------------------------------------ PRNG
class Rng:
    def __init__(self, seed: int = 0x5EED_1A3):
        self.s = seed & 0xFFFFFFFF

    def next(self) -> int:
        self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
        return self.s

    def _u(self) -> int:
        # LCG low bits have tiny periods (mod 2^k cycles); always draw from
        # the high bits or small-modulus picks degenerate (found live: a
        # 4-option pick produced the same option 90/90 times).
        return self.next() >> 15

    def int(self, lo: int, hi: int) -> int:
        return lo + self._u() % (hi - lo + 1)

    def money(self, lo: float, hi: float) -> float:
        return round(lo + (self._u() % 10_000) / 10_000 * (hi - lo), 2)

    def pick(self, xs):
        return xs[self._u() % len(xs)]


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
        # sign MUST agree with the row's kind: deposits credit the client
        # ledger, disbursements and earned-fee transfers debit it.
        kind = row.get("kind") or "deposit"
        mag = rng.money(500, 45000)
        return mag if kind == "deposit" else -mag
    if d == "trust_memo":
        kind = row.get("kind") or "deposit"
        if kind == "deposit":
            return rng.pick(["Retainer deposit per engagement letter",
                             "Settlement funds received in trust",
                             "Replenishment deposit per fee agreement"])
        if kind == "earned_fee_transfer":
            return rng.pick(["Earned fees transferred to operating per invoice",
                             "Earned fees transferred after 10-day client notice"])
        return rng.pick(["Filing fee disbursement to clerk",
                         "Expert retainer disbursement",
                         "Court reporter invoice paid from trust"])
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
        self.wire_input_schemas = {}
        schema_bundle = os.path.join(contracts_dir, "_wire-input-schemas.json.gz")
        if os.path.isfile(schema_bundle):
            with gzip.open(schema_bundle, "rt", encoding="utf-8") as handle:
                self.wire_input_schemas = (json.load(handle).get("tools") or {})
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
    def create_and_seed(
        self, conn: sqlite3.Connection, skip_seed_tables: set[str] | None = None
    ) -> None:
        """Create contract tables and seed tables not already owned by a world.

        Product-only worlds embed their exact contract seed plus migrated rows
        so per-task seed bundles can upsert those tables.  ``skip_seed_tables``
        prevents the runtime from inserting the contract seed a second time;
        legacy worlds omit it and retain the original behavior.
        """
        rng = Rng()
        counts = {}
        skip_seed_tables = skip_seed_tables or set()
        for c in self.contracts:
            for t in c["tables"]:
                cols = ", ".join(
                    f'"{col["name"]}" {col["type"]}' + (" PRIMARY KEY" if col.get("pk") else "")
                    for col in t["columns"])
                conn.execute(f'CREATE TABLE IF NOT EXISTS "{t["name"]}" ({cols})')
                if t["name"] not in skip_seed_tables:
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
        self._coherence_pass(conn)
        conn.commit()

    # -------------------------------------------------------------- realism
    OVERDRAWN_MATTERS = (3, 10, 17)  # deliberate anomalies the sweep must find

    def _coherence_pass(self, conn: sqlite3.Connection) -> None:
        """Post-seed fixups that per-row generation cannot express.

        Trust ledgers: a client account is funded before it is spent. Every
        matter's ledger is rebuilt so deposits precede and cover debits —
        except for OVERDRAWN_MATTERS, which are deliberately overdrawn so the
        compliance-sweep tasks have a controlled, findable answer key.
        """
        try:
            rows = conn.execute(
                'SELECT id, matter_id, kind, amount FROM pm_trust_transactions '
                'ORDER BY matter_id, id').fetchall()
        except sqlite3.Error:
            return
        by_matter: dict[int, list] = {}
        for rid, matter_id, kind, amount in rows:
            by_matter.setdefault(matter_id, []).append([rid, kind, amount])
        for matter_id, entries in by_matter.items():
            debits = [e for e in entries if e[1] != "deposit"]
            deposits = [e for e in entries if e[1] == "deposit"]
            debit_total = sum(abs(e[2]) for e in debits)
            if matter_id in self.OVERDRAWN_MATTERS:
                # leave under-funded on purpose: fund only ~40% of the debits
                target = round(debit_total * 0.4, 2)
            else:
                # fund the debits with headroom so the ledger stays positive
                target = round(debit_total * 1.35 + 2500, 2)
            if not deposits and debits:
                # no deposit row exists: convert the earliest debit into the
                # funding deposit so the ledger is chronologically sensible
                first = debits[0]
                conn.execute('UPDATE pm_trust_transactions SET kind = ?, amount = ?, '
                             'memo = ? WHERE id = ?',
                             ("deposit", target, "Retainer deposit per engagement letter", first[0]))
                deposits, debits = [first], debits[1:]
                debit_total = sum(abs(e[2]) for e in debits)
                target = round(debit_total * (0.4 if matter_id in self.OVERDRAWN_MATTERS else 1.35) + (0 if matter_id in self.OVERDRAWN_MATTERS else 2500), 2)
                if not debits:
                    continue
                conn.execute('UPDATE pm_trust_transactions SET amount = ? WHERE id = ?',
                             (target, deposits[0][0]))
                continue
            if not deposits:
                continue
            share = round(target / len(deposits), 2)
            for i, dep in enumerate(deposits):
                amt = share if i < len(deposits) - 1 else round(target - share * (len(deposits) - 1), 2)
                conn.execute('UPDATE pm_trust_transactions SET amount = ? WHERE id = ?',
                             (amt, dep[0]))

        # CourtListener fidelity: DocketAlert.alert_type is the documented
        # integer subscription enum and one user cannot hold duplicate alerts
        # for the same docket.  Keep the two workflow target dockets (1 and 7)
        # free so create calls match the real unique(user, docket) constraint.
        try:
            alerts = conn.execute(
                'SELECT id FROM cl_docket_alerts ORDER BY id'
            ).fetchall()
            for index, (alert_id,) in enumerate(alerts):
                conn.execute(
                    'UPDATE cl_docket_alerts SET docket_id = ?, alert_type = ? WHERE id = ?',
                    (8 + index, 1 if index % 3 else 0, alert_id),
                )
        except sqlite3.Error:
            pass

        # Use a reporter citation Eyecite and CourtListener actually parse so
        # the positive citation-lookup task exercises the real endpoint shape.
        try:
            conn.execute(
                'UPDATE cl_opinions SET citation = ? WHERE id = 1',
                ("410 U.S. 113",),
            )
        except sqlite3.Error:
            pass

    # ------------------------------------------------------------ mcp glue
    def mcp_tools(self) -> list[dict]:
        out = []
        for tool in self.tools.values():
            if tool.get("agent_visible") is False:
                continue
            params = dict(tool.get("params") or {})
            if tool.get("_dialect") == "clio" and tool["op"].get("kind") in ("list", "search", "get"):
                params.setdefault("fields", "string")
            if tool["op"].get("kind") in ("list", "search"):
                dialect = tool.get("_dialect")
                if dialect == "clio":
                    params.setdefault("page_token", "string")
                elif dialect == "courtlistener":
                    pagination = tool.get("courtlistener_pagination")
                    if pagination == "page":
                        params.setdefault("page", "integer")
                    elif pagination == "cursor" or tool.get("wire_search_type"):
                        params.setdefault("cursor", "string")
                elif dialect == "google":
                    params.setdefault("pageToken", "string")
                    params.setdefault("pageSize", "integer")
                elif dialect == "relativity":
                    params.setdefault("start", "integer")
                    params.setdefault("length", "integer")
                    if tool["op"].get("query_dsl") == "relativity":
                        params.setdefault("condition", "string")
                elif dialect == "imanage":
                    params.setdefault("offset", "integer")
            props = {}
            for param, definition in params.items():
                if isinstance(definition, dict):
                    props[param] = definition
                else:
                    props[param] = {
                        "type": {"integer": "integer", "number": "number",
                                 "boolean": "boolean", "array": "array",
                                 "object": "object"}.get(definition, "string")
                    }
            required = tool["op"].get("required", [])
            input_schema = copy.deepcopy(self.wire_input_schemas.get(tool["name"]))
            if input_schema is None:
                input_schema = {"type": "object", "properties": props,
                                **({"required": required} if required else {})}
            out.append({
                "name": tool["name"],
                "description": f'[{tool["_product"].split("(")[0].strip()}] {tool["description"]} '
                               f'(mirrors {tool["mirrors"].split(" — ")[0].split(" (")[0]})',
                "inputSchema": input_schema,
            })
        return out

    # ------------------------------------------------------------- execute
    def is_write(self, name: str) -> bool:
        """Return whether a successful call is an agent-authored mutation.

        Contract state machines are not all generic CRUD operations, so the
        HTTP layer must ask the runtime instead of guessing from two op kinds.
        """
        tool = self.tools.get(name) or {}
        op = tool.get("op") or {}
        return bool(op.get("writes") or op.get("kind") in {
            "create", "update", "efiling_create", "docusign_create",
            "docusign_update", "docusign_recipient_complete", "ledes_submit",
        })

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
        wire_error = _wire_type_error(tool, args)
        if wire_error:
            return False, vendor_error(tool.get("_dialect"), wire_error)
        if tool.get("_dialect") and translate_args is not None:
            args = translate_args(tool, args)
        try:
            special = execute_special(conn, op, args, name)
            if special is not None:
                return special
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
            if kind == "job_poll":
                return self._job_poll(conn, op, args, name)
            return False, f"ERROR: unsupported op kind '{kind}'"
        except QuerySyntaxError as e:
            return False, vendor_error(tool.get("_dialect"), str(e))
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
        if op.get("query_dsl") == "relativity" and args.get("condition"):
            clause, query_values = relativity_where(str(args["condition"]))
            clauses.append(clause)
            vals.extend(query_values)
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

    def _sparse(self, op, args, rows):
        requested = str(args.get("fields") or "").strip()
        if not requested:
            return rows
        fields = [field.strip() for field in requested.split(",") if field.strip()]
        allowed = {column["name"] for column in self.tables[op["table"]]["columns"]}
        unknown = sorted(set(fields) - allowed)
        if unknown:
            raise QuerySyntaxError(f"Unknown sparse field(s): {', '.join(unknown)}")
        keep = set(fields) | {"id"}
        return [{key: value for key, value in row.items() if key in keep} for row in rows]

    def _list(self, conn, op, args):
        where, vals = self._where(op, args)
        limit = max(1, min(100, int(args.get("limit") or 25)))
        offset = int(args.get("offset") or 0)
        if offset < 0:
            return False, "ERROR 400: invalid page cursor"
        requested_order = str(args.get("order_by") or op.get("default_order") or "").strip()
        descending = requested_order.startswith("-")
        requested_field = requested_order[1:] if descending else requested_order
        order_map = op.get("order_map") or {}
        order_field = order_map.get(requested_field, requested_field)
        columns = {column["name"] for column in self.tables[op["table"]]["columns"]}
        if requested_field and order_field not in columns:
            raise QuerySyntaxError(f"Unsupported ordering field: {requested_field}")
        order_clause = (
            f'"{order_field}" {"DESC" if descending else "ASC"}, rowid ASC'
            if requested_field else "rowid ASC"
        )
        total = int(conn.execute(f'SELECT COUNT(*) FROM "{op["table"]}"{where}', vals).fetchone()[0])
        cur = conn.execute(f'SELECT * FROM "{op["table"]}"{where} ORDER BY {order_clause} LIMIT ? OFFSET ?',
                           (*vals, limit, offset))
        rows = self._sparse(op, args, self._clip(self._rows(cur), op.get("preview")))
        next_offset = offset + len(rows) if offset + len(rows) < total else None
        previous_offset = max(0, offset - limit) if offset else None
        return True, json.dumps({"count": len(rows), "total": total, "results": rows,
                                 "limit": limit, "offset": offset, "has_more": next_offset is not None,
                                 "next_offset": next_offset, "previous_offset": previous_offset}, default=str)

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
        row = self._sparse(op, args, [row])[0]
        return True, json.dumps(row, default=str)

    def _search(self, conn, op, args):
        q = str(args.get("query") or args.get("citation") or "").strip()
        limit = max(1, min(100, int(args.get("limit") or 20)))
        offset = int(args.get("offset") or 0)
        if offset < 0:
            return False, "ERROR 400: invalid page cursor"
        if not q:
            return False, "ERROR 400: query required"
        if op.get("query_dsl") == "gmail":
            where, terms = gmail_where(q)
            total = int(conn.execute(f'SELECT COUNT(*) FROM "{op["table"]}" WHERE {where}', terms).fetchone()[0])
            cur = conn.execute(
                f'SELECT * FROM "{op["table"]}" WHERE {where} ORDER BY rowid LIMIT ? OFFSET ?',
                (*terms, limit, offset))
        elif op.get("exactish"):
            f = op["fields"][0]
            total = int(conn.execute(
                f'SELECT COUNT(*) FROM "{op["table"]}" WHERE LOWER("{f}") = LOWER(?)', (q,)).fetchone()[0])
            cur = conn.execute(
                f'SELECT * FROM "{op["table"]}" WHERE LOWER("{f}") = LOWER(?) LIMIT ? OFFSET ?', (q, limit, offset))
        else:
            where = " OR ".join(f'"{f}" LIKE ?' for f in op["fields"])
            terms = [f"%{q}%"] * len(op["fields"])
            total = int(conn.execute(
                f'SELECT COUNT(*) FROM "{op["table"]}" WHERE {where}', terms).fetchone()[0])
            cur = conn.execute(
                f'SELECT * FROM "{op["table"]}" WHERE {where} ORDER BY rowid LIMIT ? OFFSET ?',
                (*terms, limit, offset))
        rows = self._sparse(op, args, self._clip(self._rows(cur), op.get("preview")))
        next_offset = offset + len(rows) if offset + len(rows) < total else None
        previous_offset = max(0, offset - limit) if offset else None
        return True, json.dumps({"query": q, "count": len(rows), "total": total, "results": rows,
                                 "limit": limit, "offset": offset, "has_more": next_offset is not None,
                                 "next_offset": next_offset, "previous_offset": previous_offset}, default=str)

    def _job_poll(self, conn, op, args, name):
        """Async job semantics without a wall clock: state advances one step
        per poll of THIS session's row (staged -> running -> completed), so
        an agent that answers before the job finishes is deterministically
        catchable, and re-runs are bit-identical. Never regresses a row that
        was seeded further along."""
        rid = args.get("id")
        if rid in (None, ""):
            return False, f"TypeError: {name}() missing 1 required positional argument: 'id'"
        cur = conn.execute(f'SELECT * FROM "{op["table"]}" WHERE id = ?', (rid,))
        rows = self._rows(cur)
        if not rows:
            return False, f"ERROR 404: no {op['table']} record with id {rid}"
        row = rows[0]
        states = op["states"]
        polls = int(row.get("poll_count") or 0) + 1
        cur_idx = states.index(row["status"]) if row.get("status") in states else 0
        new_idx = max(cur_idx, min(polls, len(states) - 1))
        status = states[new_idx]
        conn.execute(
            f'UPDATE "{op["table"]}" SET poll_count = ?, status = ? WHERE id = ?',
            (polls, status, rid))
        if status == states[-1]:
            for f, v in (op.get("on_complete") or {}).items():
                conn.execute(f'UPDATE "{op["table"]}" SET "{f}" = ? WHERE id = ? '
                             f'AND ("{f}" IS NULL OR "{f}" = 0)', (v, rid))
        conn.commit()
        cur = conn.execute(f'SELECT * FROM "{op["table"]}" WHERE id = ?', (rid,))
        return True, json.dumps(self._rows(cur)[0], default=str)

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
        updated = conn.execute(
            f'SELECT * FROM "{op["table"]}" WHERE id = ?', (rid,)
        )
        return True, json.dumps(self._rows(updated)[0], default=str)

    def _aggregate(self, conn, op, args):
        where, vals = self._where(op, args)
        cur = conn.execute(
            f'SELECT {op["agg"].upper()}("{op["field"]}") AS value, COUNT(*) AS n '
            f'FROM "{op["table"]}"{where}', vals)
        r = self._rows(cur)[0]
        return True, json.dumps({"aggregate": op["agg"], "field": op["field"],
                                 "value": round(r["value"] or 0, 2), "rows_considered": r["n"]})
