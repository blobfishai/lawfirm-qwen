#!/usr/bin/env python3
"""Deterministic rotating CI sample of task ids.

Per-PR CI cannot afford the full 2,324-task trust chain, so it runs a sample
that ROTATES weekly: seed = ISO year-week, ids ranked by sha256(seed:id).
Over ~8 weeks every task cycles through PR-level checking; the weekly
scheduled run still covers everything at once.

Usage: python3 tools/ci_sample.py --world world/blobfish/world-v19.json --n 300
       [--seed 2026-W33]   (override for reproducing a past week's sample)
Prints a comma-separated id list.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--world", default="world/blobfish/world-v19.json")
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--seed", default=None)
    args = ap.parse_args()

    raw = json.load(open(args.world))
    world = raw.get("world", raw)
    ids = [t["task_id"] for t in world["tasks"]]
    iso = dt.date.today().isocalendar()
    seed = args.seed or f"{iso[0]}-W{iso[1]:02d}"
    ranked = sorted(ids, key=lambda i: hashlib.sha256(f"{seed}:{i}".encode()).hexdigest())
    print(",".join(sorted(ranked[: args.n])))


if __name__ == "__main__":
    main()
