#!/usr/bin/env python3
"""Fail closed when the M0-M8 exit audit is stale, incomplete, or incoherent."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "data" / "program-exit-v19.json"


def main() -> int:
    subprocess.run(
        [sys.executable, str(ROOT / "tools" / "build_program_exit_audit.py"), "--check"],
        cwd=ROOT,
        check=True,
    )
    report = json.loads(AUDIT.read_text())
    milestones = report["milestones"]
    by_id = {item["id"]: item for item in milestones}
    if list(by_id) != [f"M{i}" for i in range(9)]:
        raise AssertionError("program audit must cover M0 through M8 exactly once and in order")
    if len(by_id) != len(milestones):
        raise AssertionError("duplicate milestone ids")

    for item in milestones:
        checks = item["checks"]
        if not checks or not item["verification_commands"]:
            raise AssertionError(f"{item['id']} lacks checks or a verification command")
        expected_passed = all(row["passed"] for row in checks)
        if item["passed"] != expected_passed:
            raise AssertionError(f"{item['id']} aggregate status disagrees with its checks")
        if item["checks_passed"] != sum(row["passed"] for row in checks):
            raise AssertionError(f"{item['id']} check count drift")
        for row in checks:
            if not row["proof"]:
                raise AssertionError(f"{item['id']}/{row['id']} lacks proof")
            for proof in row["proof"]:
                if not (ROOT / proof).exists():
                    raise AssertionError(f"missing proof for {item['id']}/{row['id']}: {proof}")

    open_checks = {
        (item["id"], row["id"])
        for item in milestones
        for row in item["checks"]
        if not row["passed"]
    }
    declared_open = {(row["milestone"], row["check"]) for row in report["open_gates"]}
    if open_checks != declared_open:
        raise AssertionError("open_gates does not exactly match failed milestone checks")
    if report["program_exit_ready"] != (not open_checks):
        raise AssertionError("program_exit_ready is not fail-closed")

    local_failures = [row for row in report["open_gates"] if "blocker" not in row]
    if report["local_implementation_complete"] != (not local_failures):
        raise AssertionError("local_implementation_complete does not match local failures")

    checkpoint = json.loads(
        (ROOT / "data" / "leaderboard" / "calibration-checkpoint-v19.json").read_text()
    )
    if report["handoff"]["episodes_committed"] != checkpoint["episodes_valid"]:
        raise AssertionError("resume handoff has a stale committed-episode denominator")
    calibration = next(
        row for row in by_id["M7"]["checks"] if row["id"] == "three_episode_calibration"
    )
    if calibration["passed"] != checkpoint["complete"]:
        raise AssertionError("M7 calibration gate does not track the canonical checkpoint")
    if not checkpoint["complete"]:
        if set(open_checks) != {("M7", "three_episode_calibration")}:
            raise AssertionError("incomplete calibration must be the only remaining gate")
        blocker = calibration.get("blocker") or {}
        if blocker.get("kind") != "external_provider_billing" or blocker.get("provider_status") != 402:
            raise AssertionError("incomplete calibration lacks its external provider proof")

    m5_note = report["denominator_notes"]["lab_practice_criteria"]
    if "58.7%" not in m5_note or "55%" not in m5_note or "estimate" not in m5_note:
        raise AssertionError("M5 criterion denominator/floor clarification disappeared")
    surface_note = report["denominator_notes"]["tool_surface"]
    if not all(token in surface_note for token in ("150-170", "91", "11", "2,324", "T2")):
        raise AssertionError("task-driven tool-surface variance is no longer explicit")
    surface_check = next(
        row for row in by_id["M2"]["checks"] if row["id"] == "task_used_surface_closure"
    )
    if not surface_check["passed"]:
        raise AssertionError("the admitted task bank no longer closes over the tool surface")
    if "--local-base http://127.0.0.1:8988" not in report["handoff"]["resume_command"]:
        raise AssertionError("resume command is not pinned to the preserved world server")
    if "--min-free-disk-mb 1024" not in report["handoff"]["resume_command"]:
        raise AssertionError("resume command lost the paid-sweep storage preflight")

    print(
        f"program exit audit accepted: {report['milestones_passed']}/"
        f"{report['milestones_total']} milestones; status={report['status']}; "
        f"open={len(report['open_gates'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
