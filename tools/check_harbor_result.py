#!/usr/bin/env python3
"""Fail closed on a Harbor smoke job.

Harbor can finish its CLI process successfully while one or more trials carry
an exception.  CI therefore validates both the aggregate job result and every
per-trial result instead of trusting the process exit code.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path


def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read {path}: {error}") from error


def task_id(result: dict) -> str:
    task_path = result.get("task_id", {}).get("path")
    if task_path:
        return Path(task_path).name
    trial_name = result.get("trial_name", "")
    return trial_name.split("__", 1)[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", type=Path, required=True)
    parser.add_argument("--tasks", nargs="+", required=True)
    parser.add_argument("--reward", type=float, required=True)
    parser.add_argument("--passed", type=float, required=True)
    args = parser.parse_args()

    errors: list[str] = []
    root_path = args.job / "result.json"
    try:
        root = load(root_path)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    expected = set(args.tasks)
    stats = root.get("stats") or {}
    expected_count = len(expected)
    if stats.get("n_completed_trials") != expected_count:
        errors.append(
            f"completed={stats.get('n_completed_trials')!r}; expected {expected_count}"
        )
    for field in ("n_errored_trials", "n_running_trials", "n_pending_trials", "n_cancelled_trials"):
        if stats.get(field) != 0:
            errors.append(f"{field}={stats.get(field)!r}; expected 0")

    trial_paths = sorted(args.job.glob("*/result.json"))
    if len(trial_paths) != expected_count:
        errors.append(f"trial result files={len(trial_paths)}; expected {expected_count}")

    seen: set[str] = set()
    for path in trial_paths:
        try:
            result = load(path)
        except ValueError as error:
            errors.append(str(error))
            continue
        current_task = task_id(result)
        if current_task in seen:
            errors.append(f"duplicate trial for {current_task}")
        seen.add(current_task)
        if result.get("exception_info") is not None:
            errors.append(f"{current_task}: exception={result['exception_info']!r}")
            continue
        rewards = (result.get("verifier_result") or {}).get("rewards") or {}
        for key, expected_value in (("reward", args.reward), ("passed", args.passed)):
            actual = rewards.get(key)
            if not isinstance(actual, (int, float)) or not math.isclose(
                float(actual), expected_value, rel_tol=0.0, abs_tol=0.0
            ):
                errors.append(
                    f"{current_task}: {key}={actual!r}; expected {expected_value}"
                )

    missing = sorted(expected - seen)
    unexpected = sorted(seen - expected)
    if missing:
        errors.append(f"missing tasks: {', '.join(missing)}")
    if unexpected:
        errors.append(f"unexpected tasks: {', '.join(unexpected)}")

    if errors:
        print(f"Harbor job {args.job} failed validation:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(
        f"Harbor job {args.job}: {expected_count}/{expected_count} trials "
        f"reward={args.reward:g}, passed={args.passed:g}, no exceptions"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
