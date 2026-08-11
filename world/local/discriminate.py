#!/usr/bin/env python3
"""Discrimination harness — does every task REJECT wrong behavior?

The oracle proves a task is *satisfiable*: its reference walk executes and
passes. That is only half of admission. A task that also passes when the agent
does nothing, or reads without writing, or writes the wrong value, grades
nothing — and measuring a model on it spends money to learn noise.

This harness drives four adversarial episodes per task against the live world
and asserts the verifier rejects each one:

  A no-op        agent makes no calls at all
  B text-only    every READ checkpoint, no writes  (the deliverable-in-chat mode)
  C blind-write  every WRITE checkpoint, no reads  (the shortcut mode)
  D wrong-value  the full reference walk with the terminal write's payload
                 corrupted — strings suffixed, numbers shifted, ids preserved

D is the sharp one: it is the only case that catches a task whose pinned
answer key is missing or vacuous, because the workflow, the reads and the row
insertion are all identical to the reference run. Its result is reported as
INCONCLUSIVE rather than as a pass when the corrupted write is rejected by the
tool itself (enum/constraint violation) — the episode then fails for the wrong
reason and proves nothing about the answer key.

Reuses the oracle's own session and argument derivation so the walks are
identical to the admitted reference run.

Run (server must be up, with --v2-contracts for the v3 surface):
  python3 world/local/discriminate.py --base http://localhost:8791 \
      --world world/blobfish/world-v13.json
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oracle import (  # noqa: E402
    OracleSession, derive_args, pinned_update, vcode_walk, world_tool_targets,
)

PRESERVE = {"id", "session_id"}  # never corrupt an identifier — that changes the target, not the answer


def is_write(world, tool_name):
    t = next((x for x in world["tools"] if x["name"] == tool_name), None)
    if t is not None:
        return t.get("type") == "write"
    return tool_name.endswith((
        "_create", "_update", "_submit", "_delete", "_checkin", "_checkout",
        "_upload", "_post", "_send", "_file"))


def corrupt(args: dict) -> dict:
    """Change every answer-bearing value while keeping the call well-formed."""
    out = copy.deepcopy(args)
    for k, v in list(out.items()):
        if k in PRESERVE or k.endswith("_id"):
            continue
        if isinstance(v, bool):
            out[k] = not v
        elif isinstance(v, (int, float)):
            out[k] = round(float(v) + 4242.42, 2)
        elif isinstance(v, str) and v:
            out[k] = v + " XX-WRONG"
    return out


def build_walk(world, task, verifier):
    walk = vcode_walk(verifier or {}) or task.get("walk") or []
    tables = {t["name"] for t in world["tables"]}
    pin = pinned_update(verifier or {}, tables)
    ref_args = task.get("reference_args")
    state = {"read_bodies": []}
    plan = []
    for i, tool in enumerate(walk):
        args = ref_args[i] if (ref_args and i < len(ref_args)) else None
        plan.append((tool, args, is_write(world, tool)))
    return plan, pin, state


def realize(sess, world, task, plan, pin, state, *, skip_writes=False,
            skip_reads=False, corrupt_last_write=False):
    """Execute a plan; returns (any_write_errored,)."""
    last_write_idx = max((i for i, p in enumerate(plan) if p[2]), default=-1)
    write_errored = False
    for i, (tool, args, writes) in enumerate(plan):
        if writes and skip_writes:
            continue
        if (not writes) and skip_reads:
            continue
        a = copy.deepcopy(args) if args is not None else derive_args(world, task, tool, state)
        if pin and tool.startswith("update_") and pin["table"] in world_tool_targets(world, tool):
            a["id"] = pin["id"]
            if "new_status" in a and pin["field"] == "status":
                a["new_status"] = pin["value"]
            elif pin["field"] in a:
                a[pin["field"]] = pin["value"]
        if corrupt_last_write and i == last_write_idx:
            a = corrupt(a)
        ok, text = sess.call(tool, a)
        if corrupt_last_write and i == last_write_idx and not ok:
            write_errored = True
        if ok and tool in ("read_matter_document", "read_file"):
            state["read_bodies"].append(text)
    return write_errored


def episode(base, world, task, verifier, mode):
    plan, pin, _ = build_walk(world, task, verifier)
    sess = OracleSession(base, task_id=task.get("task_id"))
    state = {"read_bodies": []}
    try:
        write_errored = False
        if mode == "noop":
            pass
        elif mode == "text_only":
            realize(sess, world, task, plan, pin, state, skip_writes=True)
        elif mode == "blind_write":
            realize(sess, world, task, plan, pin, state, skip_reads=True)
        elif mode == "wrong_value":
            write_errored = realize(sess, world, task, plan, pin, state,
                                    corrupt_last_write=True)
        v = sess.verify(task["task_id"])
        return {"passed": bool(v.get("passed")), "reward": v.get("reward"),
                "failed": v.get("failed_conditions") or [], "write_errored": write_errored}
    finally:
        sess.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8791")
    ap.add_argument("--world", default="world/blobfish/world-v13.json")
    ap.add_argument("--tasks", default="")
    ap.add_argument("--out", default="world/local/discrimination-report.json")
    a = ap.parse_args()

    raw = json.load(open(a.world))
    world = raw.get("world", raw)
    verifiers = {v["task_id"]: v for v in world.get("verifiers", [])}
    tasks = world["tasks"]
    if a.tasks:
        want = set(a.tasks.split(","))
        tasks = [t for t in tasks if t["task_id"] in want]

    MODES = ["noop", "text_only", "blind_write", "wrong_value"]
    rows, leaks = [], []
    for n, t in enumerate(tasks, 1):
        tid = t["task_id"]
        rec = {"task_id": tid}
        for m in MODES:
            try:
                r = episode(a.base, world, t, verifiers.get(tid), m)
            except Exception as e:  # a harness error is not a task verdict
                rec[m] = {"error": str(e)[:120]}
                continue
            rec[m] = r
            if r["passed"]:
                if m == "wrong_value" and r["write_errored"]:
                    pass  # cannot happen (errored write + pass) but keep the guard
                leaks.append({"task_id": tid, "mode": m, "reward": r["reward"]})
        rows.append(rec)
        if n % 25 == 0:
            print(f"  [{n}/{len(tasks)}] checked", flush=True)

    incon = [r["task_id"] for r in rows
             if isinstance(r.get("wrong_value"), dict) and r["wrong_value"].get("write_errored")]
    summary = {
        "tasks": len(rows),
        "modes": MODES,
        "discrimination_failures": leaks,
        "wrong_value_inconclusive": incon,
    }
    json.dump({"summary": summary, "rows": rows}, open(a.out, "w"), indent=1)

    print()
    print(f"tasks checked: {len(rows)}")
    for m in MODES:
        bad = [l for l in leaks if l["mode"] == m]
        extra = ""
        if m == "wrong_value":
            extra = f"  ({len(incon)} inconclusive — corrupted write rejected by the tool)"
        print(f"  {m:12s} rejected by {len(rows) - len(bad) - (len(incon) if m=='wrong_value' else 0)}"
              f"/{len(rows)} tasks · {len(bad)} DISCRIMINATION FAILURES{extra}")
    if leaks:
        print()
        print("tasks that accept wrong behavior:")
        for l in leaks[:40]:
            print(f"  {l['task_id']}  mode={l['mode']}  reward={l['reward']}")
    print(f"\nreport: {a.out}")
    return 1 if leaks else 0


if __name__ == "__main__":
    sys.exit(main())
