#!/usr/bin/env python3
"""Render the auditable LAB determinization/quarantine report from v17 artifacts."""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSERTIONS = ROOT / "world" / "port" / "determinate" / "lab-assertions.jsonl"
COMPILER = ROOT / "world" / "port" / "determinate" / "lab-report.json"
BUILD = ROOT / "world" / "v17" / "build-report.json"
OUTPUT = ROOT / "docs" / "LAB-DETERMINIZATION.md"


def _load(path: Path):
    return json.loads(path.read_text("utf-8"))


def render() -> str:
    compiler = _load(COMPILER)
    build = _load(BUILD)
    rows = [json.loads(line) for line in ASSERTIONS.read_text("utf-8").splitlines() if line]
    if len(rows) != compiler["tasks"]:
        raise RuntimeError("compiler report/task artifact count mismatch")

    admissions = Counter(row["admission"] for row in rows)
    drop_reasons: Counter[str] = Counter()
    family: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        bucket = family[row["family"]]
        bucket["tasks"] += 1
        bucket["criteria"] += row["criteria_total"]
        bucket["determinate"] += row["criteria_determinate"]
        bucket["assertions"] += row["assertion_count"]
        for dropped in row.get("dropped") or []:
            drop_reasons[dropped["reason"]] += 1

    lines = [
        "# Harvey LAB deterministic import — world-v17",
        "",
        "This report is generated from the committed compiler artifact and world build report.",
        "An LLM may propose text while authoring future manifests, but no LLM judges an episode:",
        "only source-validated assertions, state transitions, traces, and file contracts affect the",
        "deterministic score. Criteria that cannot be compiled are dropped and counted below.",
        "",
        "## Acceptance summary",
        "",
        "| Measure | Result |",
        "|---|---:|",
        f"| LAB tasks hosted | {build['lab_hosted_tasks']:,} / 2,010 ({100 * build['lab_hosted_tasks'] / 2010:.2f}%) |",
        f"| Practice source tasks accounted for | {build['lab_source_accounting']['accounted']:,} / 1,760 |",
        f"| Practice criteria determinized | {compiler['criteria_determinate']:,} / {compiler['criteria']:,} ({100 * compiler['criteria_coverage']:.1f}%) |",
        f"| Compiled assertions | {compiler['assertions']:,} |",
        f"| Compiler headline-eligible practice sources | {admissions['compiled']:,} / {compiler['tasks']:,} |",
        f"| Runtime-hosted headline practice sources | {build['lab_source_accounting']['represented_by_migrated_graph_task'] + build['lab_source_accounting']['added_as_v17_practice_task']:,} / 1,760 |",
        f"| Thin-grading tasks, hosted but headline-excluded | {admissions['thin_grading']:,} |",
        f"| Quarantined practice tasks | {build['lab_quarantined_tasks']:,} |",
        "",
        "## Criteria coverage by family",
        "",
        "| Family | Tasks | Determinate criteria | Total criteria | Coverage | Assertions |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in sorted(family):
        values = family[name]
        coverage = values["determinate"] / max(1, values["criteria"])
        lines.append(
            f"| {name} | {values['tasks']:,} | {values['determinate']:,} | "
            f"{values['criteria']:,} | {100 * coverage:.1f}% | {values['assertions']:,} |"
        )

    lines.extend([
        "",
        "## Criteria coverage by work type",
        "",
        "| Work type | Tasks | Determinate criteria | Total criteria | Coverage |",
        "|---|---:|---:|---:|---:|",
    ])
    for name, values in sorted(compiler["work_types"].items()):
        lines.append(
            f"| {name} | {values['tasks']:,} | {values['determinate']:,} | "
            f"{values['criteria']:,} | {100 * values['coverage']:.1f}% |"
        )

    lines.extend([
        "",
        "## Dropped criteria, by mechanical reason",
        "",
        "| Reason | Criteria |",
        "|---|---:|",
    ])
    for reason, count in sorted(drop_reasons.items(), key=lambda item: (-item[1], item[0])):
        lines.append(f"| {reason.replace('|', '\\|')} | {count:,} |")

    quarantine = build.get("practice_import", {}).get("quarantine") or []
    lines.extend([
        "",
        "## Quarantine bank",
        "",
        "Nothing is silently discarded. A quarantined source remains in the accounting manifest",
        "and is excluded from hosted and headline scores.",
        "",
        "| Source task | Reason | Detail |",
        "|---|---|---|",
    ])
    if quarantine:
        for row in sorted(quarantine, key=lambda value: value["source_task"]):
            source = row["source_task"].replace("|", "\\|")
            reason = row["reason"].replace("|", "\\|")
            detail = str(row.get("detail") or "—").replace("|", "\\|").replace("\n", " ")
            lines.append(f"| `{source}` | `{reason}` | {detail} |")
    else:
        lines.append("| — | — | No practice tasks quarantined |")

    lines.extend([
        "",
        "## Interpretation and limits",
        "",
        "- **Hosted is not the same as fully judged.** Thin tasks retain deterministic read → file →",
        "  DMS-state contracts but are excluded from the headline determinate score.",
        "- **Dropped prose is not guessed.** Style, persuasion, and open-ended synthesis criteria do",
        "  not receive a score unless they can be converted into source-grounded mechanical checks.",
        "- **Public-task contamination remains possible.** Verbatim LAB tasks are reported separately",
        "  from future manifest-resampled variants.",
        "- **The two delivery lanes never average together.** File-lane and system-of-record outcomes",
        "  remain separate, with divergence exposed as `lane_split`.",
        "",
        f"Compiler: `{compiler['compiler_version']}` · source index `{compiler['source_index_sha256']}` · output `{compiler['output_sha256']}`",
        "",
        "Regenerate with `python3 tools/report_lab_determinization.py`.",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = render()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text("utf-8") != rendered:
            raise SystemExit(f"stale report: {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, "utf-8")
    print(f"LAB determinization report {'current' if args.check else 'written'}: {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
