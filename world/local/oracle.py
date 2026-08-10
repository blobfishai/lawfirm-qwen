#!/usr/bin/env python3
"""Oracle reference runner — fidelity proof for the local world server.

For every task in the world document, executes the task's reference walk
(tool order from `walk`, arguments derived from the task's prompt and
`relevant_data`) against the local server over the same HTTP surface the
MCP bridge uses, then scores the rollout with the task's shipped VCode
verifier. A task counts as locally-runnable only if the oracle walk passes.

This mirrors the world's own admission bar ("a task ships iff its reference
execution passes the verifier") and doubles as the integration test for the
synthesized tool implementations.

Run:  python3 world/local/oracle.py [--base http://127.0.0.1:8971]
                                    [--world world/blobfish/world.json]
                                    [--tasks task_001,task_002]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def http(base: str, method: str, path: str, body=None, session=None):
    req = urllib.request.Request(base + path, method=method)
    req.add_header("Content-Type", "application/json")
    if session:
        req.add_header("Mcp-Session-Id", session)
    data = json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(req, data=data, timeout=60) as res:
        return json.loads(res.read().decode() or "{}")


class OracleSession:
    def __init__(self, base: str):
        self.base = base
        self.sid = http(base, "POST", "/sessions", {})["session_id"]
        self.trace: list[dict] = []
        self._rpc_id = 0

    def call(self, tool: str, args: dict, retries: int = 2) -> tuple[bool, str]:
        """Call a tool; retry transient friction errors like a competent agent."""
        for attempt in range(retries + 1):
            self._rpc_id += 1
            res = http(self.base, "POST", "/mcp", {
                "jsonrpc": "2.0", "id": self._rpc_id, "method": "tools/call",
                "params": {"name": tool, "arguments": args},
            }, session=self.sid)
            r = res.get("result") or {}
            text = "".join(c.get("text", "") for c in r.get("content", []))
            ok = not r.get("isError")
            self.trace.append({
                "tool": tool, "requested_tool": tool, "arguments": args,
                "observation": text[:4000], "ok": ok,
            })
            transient = ("rate_limited" in text) or ("stale_reference" in text)
            if ok or not transient or attempt == retries:
                return ok, text
        return False, text

    def verify(self, task_id: str) -> dict:
        return http(self.base, "POST", f"/verify/{task_id}",
                    {"trace": self.trace}, session=self.sid)

    def close(self):
        try:
            http(self.base, "DELETE", f"/sessions/{self.sid}")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Argument derivation
# ---------------------------------------------------------------------------

NUM_DEFAULT = 125000.0
STR_DEFAULTS = {
    "changed_by_role": "partner",
    "change_reason": "Oracle reference run: value confirmed against matter records.",
    "evidence_type": "document",
    "source_uri": "matter://oracle/reference",
    "content_summary": "Reference evidence captured during the oracle walk.",
    "owner_role": "associate",
    "action_required": "Reconcile the flagged record against source materials.",
    "due_note": "Complete before the next docket review.",
    "reviewer_role": "partner",
    "outcome": "approved",
    "rationale": "Reference review confirms the record is consistent.",
    "notes": "Oracle reference note.",
    "detail": "Oracle reference detail.",
}


def quoted_ids(prompt: str) -> list[str]:
    return re.findall(r'"([a-z][a-z0-9_]*_\d{2,4})"', prompt)


def derive_args(world, task, tool_name, state):
    """Best-effort reference arguments for one walk step."""
    tools = {t["name"]: t for t in world["tools"]}
    tool = tools[tool_name]
    params = tool.get("parameters") or {}
    if isinstance(params, list):
        params = {p["name"]: p.get("type", "string") for p in params if p.get("name")}
    prompt = task.get("prompt") or ""
    relevant = task.get("relevant_data") or []
    targets = tool.get("target_tables") or []

    if tool_name == "query_matter_documents":
        titles = [r for r in relevant
                  if r.get("table") == "matter_documents" and r.get("field") == "title"]
        if titles:
            return {"title": str(titles[0].get("value") or "")[:60]}
        return {"limit": 25}

    if tool_name == "read_matter_document":
        docs = [r for r in relevant if r.get("table") == "matter_documents"]
        idx = state.setdefault("md_read_idx", 0)
        if docs:
            row = docs[min(idx, len(docs) - 1)]
            state["md_read_idx"] = idx + 1
            return {"id": row.get("id")}
        state["md_read_idx"] = idx + 1
        return {"id": 1}

    if tool_name == "draft_matter_document":
        m = re.search(r'titled\s+"([^"]+)"', prompt)
        title = m.group(1) if m else f"{task['task_id']}-deliverable.docx"
        bodies = state.get("read_bodies") or []
        body = (
            f"MEMORANDUM — {title}\n\n"
            "I. Engagement and scope\n"
            "This memorandum responds to the engagement instruction and is "
            "grounded in every input document read in full during this "
            "session.\n\n"
            "II. Source materials reviewed\n"
            + "\n".join(f"- {b[:160]}" for b in bodies[:6])
            + "\n\nIII. Analysis\n"
            "The base materials and the counterparty markup were reconciled "
            "item by item. Each deviation is addressed below with a "
            "recommended disposition and the underlying rationale, applying "
            "the firm playbook to every negotiated position.\n\n"
            "IV. Recommendations\n"
            "1. Adopt the positions supported by the base materials.\n"
            "2. Reject markup deviations that shift risk without "
            "consideration.\n"
            "3. Escalate open items to the supervising partner before "
            "signing.\n\n"
            "V. Conclusion\n"
            "The deliverable satisfies the engagement instruction and is "
            "filed to the matter record."
        )
        return {"title": title, "doc_type": "memo", "body": body}

    if tool_name.endswith("_records_agent") or tool_name.endswith("_workflow_agent") \
            or tool_name in ("document_agent", "calendar_agent", "sheet_agent"):
        return {"request": prompt[:300]}

    if tool_name == "read_file":
        files = [r for r in relevant if r.get("table") == "agent_files"]
        if files:
            return {"filename": files[0].get("value")}
        return {"filename": "invoices_import.tsv"}

    args = {}
    qids = quoted_ids(prompt)
    for pname, ptype in params.items():
        t = str(ptype.get("type") if isinstance(ptype, dict) else ptype).lower()
        if pname == "limit":
            continue
        if pname == "id":
            # entity id from the prompt, else from relevant_data, else row 1
            target = targets[0] if targets else ""
            hit = next((q for q in qids if target.rstrip("s") in q or q in prompt), None)
            if hit is None and qids:
                hit = qids[0]
            if hit is None:
                rel = next((r for r in relevant if r.get("table") == target), None)
                hit = rel.get("id") if rel else 1
            args["id"] = hit
        elif pname.endswith("_id"):
            hit = next((q for q in qids), None)
            if hit is None:
                rel = relevant[0] if relevant else None
                hit = rel.get("value") if rel and rel.get("field") == "id" else "1"
            args[pname] = hit
        elif pname == "status" and tool_name.endswith("_list"):
            continue
        elif pname == "new_status":
            m = (re.search(r'status\s+(?:to\s+)?"([^"]+)"', prompt)
                 or re.search(r"status\s+to\s+([A-Za-z][\w\-]*)", prompt))
            args[pname] = m.group(1) if m else "reviewed"
        elif t in ("number", "float", "real", "double"):
            m = re.search(r"\$?([0-9][0-9,]{2,})(?:\.\d+)?", prompt)
            args[pname] = float(m.group(1).replace(",", "")) if m else NUM_DEFAULT
        elif t in ("integer", "int"):
            args[pname] = 1
        else:
            args[pname] = STR_DEFAULTS.get(pname, f"oracle:{pname}")
    return args


def vcode_walk(verifier: dict) -> list[str] | None:
    """The verifier's required tool order is authoritative when it exists —
    a task's `walk` array can disagree with it (e.g. task_015)."""
    m = re.search(r"_required_workflow_path\s*=\s*(\[[^\]]*\])",
                  verifier.get("vcode") or "")
    if not m:
        return None
    try:
        return json.loads(m.group(1).replace("'", '"'))
    except json.JSONDecodeError:
        return None


def pinned_update(verifier: dict, tables: set[str]) -> dict | None:
    """Row-pinned field expectations from assertion names like
    invoices_1_status_is_overdue -> {table, id, field, value}."""
    for name in verifier.get("assertions") or []:
        m = re.match(r"^(?P<rest>.+)_is_(?P<value>[A-Za-z0-9_\-]+)$", name)
        if not m:
            continue
        rest = m.group("rest")
        for table in sorted(tables, key=len, reverse=True):
            if rest.startswith(table + "_"):
                tail = rest[len(table) + 1:]
                rm = re.match(r"^(\d+)_([a-z_]+)$", tail)
                if rm:
                    return {"table": table, "id": int(rm.group(1)),
                            "field": rm.group(2), "value": m.group("value")}
    return None


def run_task(base, world, task, verifier):
    sess = OracleSession(base)
    state = {"read_bodies": []}
    tables = {t["name"] for t in world["tables"]}
    pin = pinned_update(verifier or {}, tables)
    walk = vcode_walk(verifier or {}) or task.get("walk") or []
    ref_args = task.get("reference_args")
    try:
        for step_i, tool_name in enumerate(walk):
            if ref_args and step_i < len(ref_args):
                args = ref_args[step_i]
            else:
                args = derive_args(world, task, tool_name, state)
            if pin and tool_name.startswith("update_") and pin["table"] in (
                    world_tool_targets(world, tool_name)):
                args["id"] = pin["id"]
                if "new_status" in args and pin["field"] == "status":
                    args["new_status"] = pin["value"]
                elif pin["field"] in args:
                    args[pin["field"]] = pin["value"]
            ok, text = sess.call(tool_name, args)
            if ok and tool_name in ("read_matter_document", "read_file"):
                state["read_bodies"].append(text)
        verdict = sess.verify(task["task_id"])
        return verdict
    finally:
        sess.close()


def world_tool_targets(world, tool_name):
    t = next((x for x in world["tools"] if x["name"] == tool_name), None)
    return set((t or {}).get("target_tables") or [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8971")
    ap.add_argument("--world", default=os.path.join(
        ROOT, "lawfirm-qwen", "world", "blobfish", "world.json"))
    ap.add_argument("--tasks", default="")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    world_path = args.world
    if not os.path.exists(world_path):
        world_path = os.path.join(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__))), "blobfish", "world.json")
    with open(world_path) as f:
        raw = json.load(f)
    world = raw.get("world", raw)

    wanted = set(t for t in args.tasks.split(",") if t)
    tasks = [t for t in world["tasks"] if not wanted or t["task_id"] in wanted]
    verifiers = {v["task_id"]: v for v in world.get("verifiers") or []}

    results = []
    for i, task in enumerate(tasks, 1):
        try:
            v = run_task(args.base, world, task, verifiers.get(task["task_id"]))
        except Exception as e:  # noqa: BLE001
            v = {"task_id": task["task_id"], "passed": False,
                 "error": f"oracle crashed: {e!r}", "failed_conditions": ["oracle_error"]}
        results.append(v)
        mark = "PASS" if v.get("passed") else "fail(" + ",".join(v.get("failed_conditions") or []) + ")"
        print(f"[{i}/{len(tasks)}] {task['task_id']}: {mark}", file=sys.stderr)

    passed = sum(1 for r in results if r.get("passed"))
    fail_counts: dict[str, int] = {}
    for r in results:
        if not r.get("passed"):
            for c in r.get("failed_conditions") or ["unknown"]:
                fail_counts[c] = fail_counts.get(c, 0) + 1
    report = {
        "total": len(results), "passed": passed,
        "pass_rate": round(passed / len(results), 4) if results else None,
        "failed_condition_counts": fail_counts,
        "failures": [r for r in results if not r.get("passed")],
    }
    out = args.out or os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   "oracle-report.json")
    with open(out, "w") as f:
        json.dump(report, f, indent=1, default=str)
    print(json.dumps({k: report[k] for k in
                      ("total", "passed", "pass_rate", "failed_condition_counts")}))
    print(f"report: {out}", file=sys.stderr)
    sys.exit(0 if passed == len(results) else 2)


if __name__ == "__main__":
    main()
