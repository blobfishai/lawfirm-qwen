#!/usr/bin/env python3
"""Create a stable 10% human-read sheet for compiled LAB criteria."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSERTIONS = ROOT / "world" / "port" / "determinate" / "lab-assertions.jsonl"
OUTPUT = ROOT / "docs" / "audit" / "lab-determinization-10pct.csv"


def selected(source_task: str, criterion_id: str) -> bool:
    digest = hashlib.sha256(f"lab-v17-review\0{source_task}\0{criterion_id}".encode()).digest()
    return int.from_bytes(digest[:8], "big") < (1 << 64) // 10


def render() -> str:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=[
        "source_task", "family", "work_type", "criterion_id", "criterion_title",
        "reference_fragment", "source_files", "compiler_discrimination",
        "review_status", "review_notes",
    ])
    writer.writeheader()
    compiled_total = sample_total = 0
    for line in ASSERTIONS.read_text("utf-8").splitlines():
        if not line:
            continue
        task = json.loads(line)
        for criterion in task["criteria"]:
            compiled_total += 1
            criterion_id = str(criterion["criterion_id"])
            if not selected(task["source_task"], criterion_id):
                continue
            sample_total += 1
            sources = sorted({
                source["relative_path"]
                for assertion in criterion["assertions"]
                for source in assertion["source_files"]
            })
            writer.writerow({
                "source_task": task["source_task"],
                "family": task["family"],
                "work_type": task["work_type"],
                "criterion_id": criterion_id,
                "criterion_title": criterion["title"],
                "reference_fragment": criterion["reference_fragment"],
                "source_files": " | ".join(sources),
                "compiler_discrimination": "reference_passes;corrupted_fails",
                "review_status": "",
                "review_notes": "",
            })
    if compiled_total == 0 or not (0.08 <= sample_total / compiled_total <= 0.12):
        raise RuntimeError(
            f"stable review sample outside expected band: {sample_total}/{compiled_total}"
        )
    return buffer.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = render()
    if args.check:
        # CSV deliberately uses RFC-style CRLF records. Path.read_text()
        # performs universal-newline translation and would therefore declare
        # a byte-identical committed sheet stale on every platform.
        if not OUTPUT.is_file() or OUTPUT.read_bytes() != rendered.encode("utf-8"):
            raise SystemExit(f"stale review sheet: {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(rendered.encode("utf-8"))
    count = max(0, rendered.count("\n") - 1)
    print(f"LAB determinization review sheet {'current' if args.check else 'written'}: "
          f"{count:,} sampled criteria")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
