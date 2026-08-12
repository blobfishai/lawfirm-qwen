#!/usr/bin/env python3
"""Prove that obeying superseded instructions fails v19 final-state grading."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from oracle import OracleSession


ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8971")
    parser.add_argument("--world", type=Path,
                        default=ROOT / "world" / "blobfish" / "world-v19.json")
    parser.add_argument("--tasks", default="")
    parser.add_argument("--out", type=Path,
                        default=ROOT / "data" / "precorrection-v19.json")
    args = parser.parse_args()

    raw = json.loads(args.world.read_text("utf-8"))
    world = raw.get("world", raw)
    wanted = {value for value in args.tasks.split(",") if value}
    tasks = [task for task in world["tasks"]
             if task.get("pre_correction_walk")
             and (not wanted or task["task_id"] in wanted)]
    rows = []
    for index, task in enumerate(tasks, 1):
        session = OracleSession(args.base, task_id=task["task_id"])
        calls = []
        try:
            for tool, call_args in zip(task["pre_correction_walk"],
                                       task["pre_correction_reference_args"], strict=True):
                ok, observation = session.call(tool, call_args)
                calls.append({"tool": tool, "ok": ok, "observation": observation[:500]})
            verdict = session.verify(task["task_id"])
        finally:
            session.close()
        rejected = verdict.get("passed") is False
        rows.append({"task_id": task["task_id"], "rejected": rejected,
                     "failed_conditions": verdict.get("failed_conditions") or [],
                     "calls": calls})
        print(f"[{index}/{len(tasks)}] {task['task_id']}: "
              f"{'REJECTED' if rejected else 'INCORRECTLY PASSED'}")

    report = {
        "schema_version": 1,
        "tasks": len(rows),
        "rejected": sum(row["rejected"] for row in rows),
        "incorrectly_passed": [row["task_id"] for row in rows if not row["rejected"]],
        "rows": rows,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", "utf-8")
    print(json.dumps({key: report[key] for key in ("tasks", "rejected", "incorrectly_passed")}))
    return 0 if report["rejected"] == report["tasks"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
