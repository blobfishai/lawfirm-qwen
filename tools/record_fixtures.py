#!/usr/bin/env python3
"""M0.1 recorder — freeze today's correct behavior as executable truth.

For every task in the world document, runs FIVE episodes against a live world
server and records each episode's full tool trace and verifier verdict:

    oracle        the reference walk (must pass)
    noop          no calls at all              (must fail)
    text_only     reads only                   (must fail)
    blind_write   writes only                  (must fail)
    wrong_value   walk with corrupted payload  (must fail or be inconclusive)

Fixtures land in tools/fixtures/verdicts/<task_id>.json. They are the input to
tools/check_fixtures.py, which replays the recorded traces against a live
server and asserts the verdicts are identical — the regression net under every
future change to server.py, the verifiers, or the world document.

Run (server must be up with --v2-contracts):
  python3 tools/record_fixtures.py --base http://127.0.0.1:8974 \
      --world world/blobfish/world-v15.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "world", "local"))

import discriminate as D  # noqa: E402
import oracle as O  # noqa: E402

MODES = ("oracle", "noop", "text_only", "blind_write", "wrong_value")


def oracle_episode(base: str, world: dict, task: dict, verifier: dict) -> dict:
    """The reference walk, mirroring oracle.run_task but keeping the trace."""
    sess = O.OracleSession(base, task_id=task["task_id"])
    try:
        state = {"read_bodies": []}
        tables = {t["name"] for t in world["tables"]}
        pin = O.pinned_update(verifier or {}, tables)
        walk = O.vcode_walk(verifier or {}) or task.get("walk") or []
        ref_args = task.get("reference_args")
        for i, tool in enumerate(walk):
            if ref_args and i < len(ref_args):
                args = ref_args[i]
            else:
                args = O.derive_args(world, task, tool, state)
            if pin and tool.startswith("update_") and pin["table"] in (
                    O.world_tool_targets(world, tool)):
                args["id"] = pin["id"]
                if "new_status" in args and pin["field"] == "status":
                    args["new_status"] = pin["value"]
                elif pin["field"] in args:
                    args[pin["field"]] = pin["value"]
            ok, text = sess.call(tool, args)
            if ok and tool in ("read_matter_document", "read_file"):
                state["read_bodies"].append(text)
        verdict = sess.verify(task["task_id"])
        return {"trace": sess.trace, "verdict": verdict}
    finally:
        sess.close()


def adversarial_episode(base: str, world: dict, task: dict, verifier: dict,
                        mode: str) -> dict:
    plan, pin, _ = D.build_walk(world, task, verifier)
    sess = O.OracleSession(base, task_id=task["task_id"])
    try:
        state = {"read_bodies": []}
        if mode == "text_only":
            D.realize(sess, world, task, plan, pin, state, skip_writes=True)
        elif mode == "blind_write":
            D.realize(sess, world, task, plan, pin, state, skip_reads=True)
        elif mode == "wrong_value":
            D.realize(sess, world, task, plan, pin, state, corrupt_last_write=True)
        # noop: no calls
        verdict = sess.verify(task["task_id"])
        return {"trace": sess.trace, "verdict": verdict}
    finally:
        sess.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8974")
    ap.add_argument("--world", default=os.path.join(
        ROOT, "world", "blobfish", "world-v15.json"))
    ap.add_argument("--out", default=os.path.join(HERE, "fixtures", "verdicts"))
    ap.add_argument("--tasks", default="", help="comma-separated task_id filter")
    args = ap.parse_args()

    raw = json.load(open(args.world))
    world = raw.get("world", raw)
    verifiers = {v["task_id"]: v for v in world.get("verifiers") or []}
    tasks = world["tasks"]
    if args.tasks:
        want = set(args.tasks.split(","))
        tasks = [t for t in tasks if t["task_id"] in want]

    os.makedirs(args.out, exist_ok=True)
    n_bad_oracle = 0
    for n, task in enumerate(tasks, 1):
        tid = task["task_id"]
        v = verifiers.get(tid)
        episodes: dict[str, dict] = {}
        for mode in MODES:
            if mode == "oracle":
                episodes[mode] = oracle_episode(args.base, world, task, v)
            else:
                episodes[mode] = adversarial_episode(args.base, world, task, v, mode)
        if not episodes["oracle"]["verdict"].get("passed"):
            n_bad_oracle += 1
            print(f"  !! {tid}: ORACLE EPISODE DID NOT PASS — fixture suspect",
                  file=sys.stderr)
        with open(os.path.join(args.out, f"{tid}.json"), "w") as f:
            # NO sort_keys: argument insertion order must be preserved exactly —
            # the server echoes rows in merge order, so alphabetizing recorded
            # args makes replayed observation strings diverge spuriously.
            json.dump({"task_id": tid, "world": os.path.basename(args.world),
                       "episodes": episodes}, f, indent=1, default=str)
        if n % 25 == 0:
            print(f"  [{n}/{len(tasks)}] recorded", flush=True)

    print(f"recorded {len(tasks)} tasks x {len(MODES)} episodes -> {args.out}")
    if n_bad_oracle:
        print(f"WARNING: {n_bad_oracle} oracle episodes did not pass", file=sys.stderr)
    return 2 if n_bad_oracle else 0


if __name__ == "__main__":
    sys.exit(main())
