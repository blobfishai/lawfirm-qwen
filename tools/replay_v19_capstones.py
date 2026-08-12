#!/usr/bin/env python3
"""Run every v19 capstone three times and require bit-identical verdicts."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "world" / "local"))

from oracle import run_task  # noqa: E402


def digest(value: dict) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8971")
    parser.add_argument("--world", type=Path,
                        default=ROOT / "world" / "blobfish" / "world-v19.json")
    parser.add_argument("--out", type=Path,
                        default=ROOT / "data" / "capstone-replay-v19.json")
    args = parser.parse_args()
    raw = json.loads(args.world.read_text("utf-8"))
    world = raw.get("world", raw)
    tasks = [task for task in world["tasks"]
             if task.get("method") == "m6_checkpointed_capstone"]
    verifiers = {verifier["task_id"]: verifier for verifier in world["verifiers"]}
    rows = []
    for task in tasks:
        verdicts = [run_task(args.base, world, task, verifiers[task["task_id"]])
                    for _ in range(3)]
        digests = [digest(verdict) for verdict in verdicts]
        identical = len(set(digests)) == 1
        passed = all(verdict.get("passed") for verdict in verdicts)
        rows.append({"task_id": task["task_id"], "passed_3_of_3": passed,
                     "bit_identical": identical, "digests": digests})
        print(f"{task['task_id']}: pass={passed} identical={identical} {digests[0]}")
    report = {
        "schema_version": 1,
        "tasks": len(rows),
        "runs": len(rows) * 3,
        "all_passed": all(row["passed_3_of_3"] for row in rows),
        "all_bit_identical": all(row["bit_identical"] for row in rows),
        "rows": rows,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", "utf-8")
    return 0 if report["all_passed"] and report["all_bit_identical"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
