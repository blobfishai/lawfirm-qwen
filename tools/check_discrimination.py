#!/usr/bin/env python3
"""Compatibility entry point for the canonical discrimination classifier.

The former checker allowed a numeric wrong-value leak budget. That could hide a
BROKEN-KEY because raw sweep output alone cannot distinguish an intentionally
unkeyed task from a claimed key that does not bind. The world-aware classifier
is now the only admission policy.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLASSIFIER = ROOT / "world" / "expansion" / "discrimination-report.mjs"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument(
        "--world", type=Path, default=ROOT / "world" / "blobfish" / "world-v15.json"
    )
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="legal-agent-discrimination-") as tmp:
        output = Path(tmp)
        completed = subprocess.run(
            [
                "node",
                str(CLASSIFIER),
                "--sweep",
                str(args.report.resolve()),
                "--world",
                str(args.world.resolve()),
                "--docs-out",
                str(output / "DISCRIMINATION.md"),
                "--data-out",
                str(output / "discrimination.json"),
            ],
            cwd=ROOT,
            check=False,
        )
    return completed.returncode


if __name__ == "__main__":
    sys.exit(main())
