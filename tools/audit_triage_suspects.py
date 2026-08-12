#!/usr/bin/env python3
"""Mechanically audit systematic M7.2 failures against golden gate evidence.

A mid-tier model failing the same assertion three times is not enough to call a
task broken.  This audit checks that the oracle passes that exact assertion and
that at least one adversarial fixture fails it.  Anything that cannot be proved
that way stays unresolved instead of being relabeled by intuition.
"""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
TRIAGE = ROOT / "data/triage/world-v19.json"
FIXTURES = ROOT / "tools/fixtures/verdicts"
JSON_OUT = ROOT / "data/triage/world-v19-suspect-audit.json"
MD_OUT = ROOT / "docs/TRIAGE-SUSPECT-AUDIT-v19.md"
ADVERSARIES = ("noop", "text_only", "blind_write", "wrong_value")


def load_fixture(task_id: str, fixtures: Path = FIXTURES) -> dict[str, Any] | None:
    plain = fixtures / f"{task_id}.json"
    compressed = fixtures / f"{task_id}.json.gz"
    if plain.exists():
        return json.loads(plain.read_text())
    if compressed.exists():
        with gzip.open(compressed, "rt") as handle:
            return json.load(handle)
    return None


def assertion_results(verdict: dict[str, Any]) -> dict[str, bool]:
    return {
        str(row.get("name")): row.get("passed") is True
        for row in verdict.get("assertions") or []
        if row.get("name")
    }


def audit_task(task_id: str, triage_row: dict[str, Any], fixture: dict[str, Any] | None) -> dict[str, Any]:
    conditions = list(map(str, triage_row.get("systematic_failed_assertions") or []))
    if fixture is None:
        return {
            "task_id": task_id,
            "decision": "unresolved_missing_fixture",
            "systematic_failed_assertions": conditions,
            "reason": "no golden fixture exists",
        }
    episodes = fixture.get("episodes") or {}
    oracle = (episodes.get("oracle") or {}).get("verdict") or {}
    oracle_assertions = assertion_results(oracle)
    adversarial = {
        mode: (episodes.get(mode) or {}).get("verdict") or {}
        for mode in ADVERSARIES
    }
    all_adversaries_rejected = all(row.get("passed") is False for row in adversarial.values())
    condition_proof = []
    unresolved = []
    for condition in conditions:
        oracle_passed = oracle_assertions.get(condition)
        failed_by = []
        for mode, verdict in adversarial.items():
            failed_conditions = set(map(str, verdict.get("failed_conditions") or []))
            assertions = assertion_results(verdict)
            if condition in failed_conditions or assertions.get(condition) is False:
                failed_by.append(mode)
        row = {
            "assertion": condition,
            "oracle_passed": oracle_passed is True,
            "adversarial_modes_rejecting_assertion": failed_by,
        }
        condition_proof.append(row)
        if oracle_passed is not True or not failed_by:
            unresolved.append(condition)

    if oracle.get("passed") is not True:
        decision = "unresolved_oracle_failure"
        reason = "golden oracle does not pass"
    elif not all_adversaries_rejected:
        decision = "unresolved_admission_failure"
        reason = "one or more golden adversarial behaviors pass"
    elif unresolved:
        decision = "unresolved_assertion_not_discriminated"
        reason = "systematic model failure is not independently proven by the assertion fixtures"
    else:
        decision = "harness_cleared_model_boundary"
        reason = (
            "the exact systematic assertion passes under the oracle and fails under an admitted "
            "adversarial behavior; retain as a genuine reference-model difficulty"
        )
    return {
        "task_id": task_id,
        "decision": decision,
        "systematic_failed_assertions": conditions,
        "oracle_passed": oracle.get("passed") is True,
        "all_adversaries_rejected": all_adversaries_rejected,
        "condition_proof": condition_proof,
        "reason": reason,
    }


def build(triage_path: Path = TRIAGE, fixtures: Path = FIXTURES) -> tuple[dict[str, Any], str]:
    triage = json.loads(triage_path.read_text())
    task_ids = sorted(triage.get("suspect_tasks") or [])
    rows = [audit_task(task_id, triage["labels"][task_id], load_fixture(task_id, fixtures))
            for task_id in task_ids]
    unresolved = [row["task_id"] for row in rows if row["decision"].startswith("unresolved_")]
    report = {
        "schema": "legal-agent-simulation.triage-suspect-audit.v1",
        "world_version": triage["world_version"],
        "triage": triage_path.relative_to(ROOT).as_posix() if triage_path.is_relative_to(ROOT) else str(triage_path),
        "suspect_tasks": len(rows),
        "harness_cleared": sum(row["decision"] == "harness_cleared_model_boundary" for row in rows),
        "unresolved": unresolved,
        "complete": not unresolved,
        "decision_boundary": (
            "mechanical gate validity only; this does not substitute for the standing multi-model "
            "legal-key audit trigger"
        ),
        "rows": rows,
    }
    lines = [
        "# Triage suspect audit — world-v19",
        "",
        "> A three-run systematic model failure is checked against the exact oracle and adversarial assertion fixtures. This clears harness mechanics only; it does not replace the standing legal-key audit when three strong models disagree with the same key.",
        "",
        f"- Suspect tasks: **{len(rows)}**",
        f"- Harness-cleared model boundaries: **{report['harness_cleared']}**",
        f"- Unresolved: **{len(unresolved)}**",
        f"- Complete: **{'yes' if report['complete'] else 'no'}**",
        "",
    ]
    if rows:
        lines.extend([
            "| Task | Decision | Systematic assertions |",
            "|---|---|---|",
        ])
        for row in rows:
            assertions = ", ".join(f"`{name}`" for name in row["systematic_failed_assertions"])
            lines.append(f"| `{row['task_id']}` | `{row['decision']}` | {assertions or '—'} |")
        lines.append("")
    else:
        lines.extend(["No task is currently in the suspect queue.", ""])
    lines.extend([
        "Rebuild with `python3 tools/audit_triage_suspects.py --check`.",
        "",
    ])
    return report, "\n".join(lines)


def outputs() -> dict[Path, str]:
    report, markdown = build()
    return {
        JSON_OUT: json.dumps(report, indent=2, sort_keys=True) + "\n",
        MD_OUT: markdown,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    expected = outputs()
    if args.check:
        stale = [str(path.relative_to(ROOT)) for path, value in expected.items()
                 if not path.exists() or path.read_text() != value]
        if stale:
            print("stale suspect-audit artifacts: " + ", ".join(stale))
            return 1
    else:
        for path, value in expected.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
    report = json.loads(expected[JSON_OUT])
    print(
        f"triage suspect audit: {report['harness_cleared']}/{report['suspect_tasks']} "
        f"harness-cleared; unresolved={len(report['unresolved'])}"
    )
    return 2 if args.require_complete and not report["complete"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
