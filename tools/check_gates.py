#!/usr/bin/env python3
"""M0.2 gate-the-gates — assert the admission gates reject every badbank task.

Builds a patched copy of the world document with the six defective tasks from
tools/badbank/defects.py injected, serves it on its own port, and runs each
defect through the gate that must catch it:

  oracle gate          the reference walk must FAIL its own verifier
  discrimination gate  the named adversarial mode must PASS the verifier
                       (i.e. the leak is detected)
  drift lint           quoted record ids in the prompt must match the id the
                       verifier pins (closes the gap task_016 proved: drift is
                       invisible to both other gates)

Exit 0: 6/6 rejected. Exit 1: a gate went blind. Exit 2: harness error.

Run: python3 tools/check_gates.py   (spawns its own server on --port, default 8975)
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "world", "local"))
sys.path.insert(0, os.path.join(HERE, "badbank"))

import defects  # noqa: E402
import discriminate as D  # noqa: E402
import oracle as O  # noqa: E402


def wait_health(base: str, timeout_s: int = 60) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base + "/health", timeout=2) as r:
                if json.loads(r.read()).get("ok"):
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("badbank server never became healthy")


def drift_lint(task: dict, verifier: dict) -> bool:
    """True when the prompt's quoted record ids disagree with the verifier's
    pinned row id for the same table. Mirrors oracle.pinned_update naming."""
    pin = None
    for name in verifier.get("assertions") or []:
        m = re.match(r"^(?P<table>[a-z_]+?)_(?P<id>\d+)_[a-z_]+_is_", name)
        if m:
            pin = m.groupdict()
            break
    if not pin:
        return False
    quoted = re.findall(r'"([a-z][a-z0-9_]*?)_(\d{1,4})"', task.get("prompt") or "")
    for table, qid in quoted:
        if table == pin["table"] and int(qid) != int(pin["id"]):
            return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--world", default=os.path.join(
        ROOT, "world", "blobfish", "world-v16.json"))
    ap.add_argument("--port", type=int, default=8975)
    args = ap.parse_args()
    base = f"http://127.0.0.1:{args.port}"

    raw = json.load(open(args.world))
    world = copy.deepcopy(raw.get("world", raw))
    bad_tasks, bad_verifiers, expect = defects.build()
    world["tasks"] = bad_tasks                     # serve ONLY the badbank
    world["verifiers"] = bad_verifiers
    verifiers = {v["task_id"]: v for v in bad_verifiers}

    tmp = tempfile.NamedTemporaryFile(mode="w", suffix="-badbank.json",
                                      prefix="world-", delete=False)
    json.dump({"world": world}, tmp, default=str)
    tmp.close()

    server_log = tempfile.NamedTemporaryFile(
        mode="w+", suffix="-badbank-server.log", prefix="legal-sim-", delete=False
    )
    srv = subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "world", "local", "server.py"),
         "--port", str(args.port), "--world", tmp.name],
        stderr=server_log)
    results = []
    try:
        try:
            wait_health(base)
        except Exception:
            server_log.flush()
            server_log.seek(0)
            detail = server_log.read()[-4000:]
            raise RuntimeError(
                "badbank server failed its health gate:\n" + detail
            ) from None
        for task in bad_tasks:
            tid = task["task_id"]
            exp = expect[tid]
            rejected, detail = False, ""
            try:
                if exp["gate"] == "oracle":
                    v = O.run_task(base, world, task, verifiers.get(tid))
                    rejected = not v.get("passed")
                    detail = f"oracle passed={v.get('passed')}"
                elif exp["gate"] == "discrimination":
                    r = D.episode(base, world, task, verifiers.get(tid), exp["mode"])
                    rejected = bool(r["passed"])  # the leak IS the detection
                    detail = f"{exp['mode']} passed={r['passed']} (leak detected)" \
                        if rejected else f"{exp['mode']} did not leak — gate blind"
                elif exp["gate"] == "lint":
                    rejected = drift_lint(task, verifiers.get(tid) or {})
                    detail = "drift lint flagged" if rejected else "drift lint blind"
            except Exception as e:  # noqa: BLE001
                # An unsolvable-walk crash IS a rejection for the oracle gate.
                if exp["gate"] == "oracle":
                    rejected, detail = True, f"oracle errored: {str(e)[:60]}"
                else:
                    rejected, detail = False, f"harness error: {e!r}"
            results.append((tid, exp["gate"], rejected, exp["why"], detail))
    finally:
        srv.terminate()
        srv.wait(timeout=10)
        server_log.close()
        os.unlink(server_log.name)
        os.unlink(tmp.name)

    n_ok = sum(1 for r in results if r[2])
    for tid, gate, ok, why, detail in results:
        mark = "REJECTED" if ok else "!! MISSED"
        print(f"  {mark:10s} {tid}  [{gate}] {why}  ({detail})")
    print(f"\n{n_ok}/{len(results)} rejected")
    return 0 if n_ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
