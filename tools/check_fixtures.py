#!/usr/bin/env python3
"""M0.1 checker — replay every recorded episode and assert identical verdicts.

For each fixture in tools/fixtures/verdicts/: open a fresh session for the
task, re-execute the recorded trace call-for-call (single calls, no retry
logic — the recorded trace already contains every attempt, so replay preserves
the friction schedule's call indices), rebuild the trace from live responses,
verify, and compare BOTH the rebuilt trace and the verdict against the
recording. Any divergence is a regression in server.py, a verifier, the world
document, or the friction schedule — and the checker names the first one.

Exit 0: all identical. Exit 1: divergence (listed). Exit 2: harness error.

Run (server must be up with --v2-contracts):
  python3 tools/check_fixtures.py --base http://127.0.0.1:8974
"""
from __future__ import annotations

import argparse
import glob
import gzip
import json
import os
import sys
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "world", "local"))

from oracle import http  # noqa: E402


def replay_episode(base: str, task_id: str, recorded: dict) -> dict:
    opened = http(base, "POST", "/sessions", {"task_id": task_id})
    sid = opened["session_id"]
    token = opened["access_token"]
    trace = []
    try:
        for i, entry in enumerate(recorded["trace"]):
            try:
                res = http(base, "POST", "/mcp", {
                    "jsonrpc": "2.0", "id": i + 1, "method": "tools/call",
                    "params": {"name": entry["tool"],
                               "arguments": entry["arguments"]},
                }, session=sid, token=token)
                r = res.get("result") or {}
                text = "".join(c.get("text", "") for c in r.get("content", []))
                ok = not r.get("isError")
            except urllib.error.HTTPError as exc:
                if exc.headers.get("X-Simulator-Failure") not in {
                        "rate_limited", "stale_reference"}:
                    raise
                text = exc.read().decode(errors="replace")
                ok = False
            trace.append({
                "tool": entry["tool"], "requested_tool": entry["tool"],
                "arguments": entry["arguments"],
                "observation": text[:4000], "ok": ok,
            })
        verdict = http(base, "POST", f"/verify/{task_id}",
                       {"trace": trace}, session=sid, token=token)
        return {"trace": trace, "verdict": verdict}
    finally:
        try:
            http(base, "DELETE", f"/sessions/{sid}", session=sid, token=token)
        except Exception:
            pass


def canon(obj) -> str:
    return json.dumps(obj, sort_keys=True, default=str)


def first_diff(a, b, path="$"):
    """Human-oriented first divergence between two JSON values."""
    if type(a) is not type(b):
        return f"{path}: type {type(a).__name__} != {type(b).__name__}"
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                return f"{path}.{k}: missing in recording"
            if k not in b:
                return f"{path}.{k}: missing in replay"
            d = first_diff(a[k], b[k], f"{path}.{k}")
            if d:
                return d
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{path}: length {len(a)} != {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            d = first_diff(x, y, f"{path}[{i}]")
            if d:
                return d
        return None
    if a != b:
        return f"{path}: {str(a)[:80]!r} != {str(b)[:80]!r}"
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8974")
    ap.add_argument("--fixtures", default=os.path.join(HERE, "fixtures", "verdicts"))
    ap.add_argument("--tasks", default="", help="comma-separated task_id filter")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(args.fixtures, "*.json"))
                   + glob.glob(os.path.join(args.fixtures, "*.json.gz")))
    if args.tasks:
        want = set()
        for t in args.tasks.split(","):
            want.add(t + ".json")
            want.add(t + ".json.gz")
        paths = [p for p in paths if os.path.basename(p) in want]
    if not paths:
        print("no fixtures found — run tools/record_fixtures.py first",
              file=sys.stderr)
        return 2

    n_ep = 0
    failures = []
    for n, path in enumerate(paths, 1):
        opener = gzip.open if path.endswith(".gz") else open
        with opener(path, "rt") as fh:
            fx = json.load(fh)
        tid = fx["task_id"]
        for mode, recorded in sorted(fx["episodes"].items()):
            n_ep += 1
            try:
                live = replay_episode(args.base, tid, recorded)
            except Exception as e:  # noqa: BLE001
                failures.append((tid, mode, f"replay error: {e!r}"))
                continue
            if canon(live["verdict"]) != canon(recorded["verdict"]):
                failures.append((tid, mode, "verdict: " + (
                    first_diff(recorded["verdict"], live["verdict"]) or "?")))
            elif canon(live["trace"]) != canon(recorded["trace"]):
                failures.append((tid, mode, "trace: " + (
                    first_diff(recorded["trace"], live["trace"]) or "?")))
            elif args.verbose:
                print(f"  ok {tid} {mode}")
        if n % 50 == 0:
            print(f"  [{n}/{len(paths)}] checked", flush=True)

    if failures:
        print(f"\n{len(failures)} DIVERGENCES across {n_ep} episodes:")
        for tid, mode, why in failures[:40]:
            print(f"  {tid}  {mode}  {why}")
        return 1
    print(f"{len(paths)} tasks / {n_ep} episodes: all verdicts and traces identical")
    return 0


if __name__ == "__main__":
    sys.exit(main())
