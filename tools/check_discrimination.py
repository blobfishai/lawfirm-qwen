#!/usr/bin/env python3
"""CI assertion over the discrimination report.

Behavioral guards (noop / text_only / blind_write) must NEVER leak.
wrong_value leaks are the known no-answer-key population (119 tasks until
M4.3 closes them) — the budget must not grow.

Usage: python3 tools/check_discrimination.py /tmp/discrimination.json [--budget 119]
"""
import argparse
import json
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("report")
    ap.add_argument("--budget", type=int, default=119,
                    help="allowed wrong_value leaks (the no-answer-key set)")
    args = ap.parse_args()

    s = json.load(open(args.report))["summary"]
    bad = s["discrimination_failures"]
    blind = [b for b in bad if b["mode"] == "wrong_value"]
    behavioral = [b for b in bad if b["mode"] != "wrong_value"]
    print(f"discrimination failures: {len(bad)} "
          f"(wrong_value/no-key: {len(blind)}, behavioral: {len(behavioral)})")
    for b in behavioral[:20]:
        print(f"  BEHAVIORAL LEAK {b['task_id']} mode={b['mode']}")
    if len(blind) > args.budget:
        print(f"  wrong_value leaks grew past budget: {len(blind)} > {args.budget}")
    return 1 if behavioral or len(blind) > args.budget else 0


if __name__ == "__main__":
    sys.exit(main())
