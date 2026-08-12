#!/usr/bin/env python3
"""Fail closed unless canonical v16 is entirely product-contract-backed."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
V15 = ROOT / "world" / "blobfish" / "world-v15.json"
V16 = ROOT / "world" / "blobfish" / "world-v16.json"
CONTRACTS = ROOT / "mcp" / "v3" / "contracts"
ROUTES = ROOT / "mcp" / "systems.json"
RECONCILIATION = ROOT / "world" / "migrate" / "reconciliation.json"
SERVER = ROOT / "world" / "local" / "server.py"


def load(path: Path):
    value = json.loads(path.read_text())
    return value.get("world", value)


def main() -> int:
    old = load(V15)
    world = load(V16)
    failures: list[str] = []
    legacy = {tool["name"] for tool in old.get("tools") or []}
    contract_names: list[str] = []
    for path in sorted(CONTRACTS.glob("*.json")):
        contract_names.extend(
            tool["name"] for tool in json.loads(path.read_text()).get("tools") or []
        )
    routes = json.loads(ROUTES.read_text()).get("systems") or {}
    routed = [name for system in routes.values() for name in system.get("tools") or []]
    walks = [name for task in world.get("tasks") or [] for name in task.get("walk") or []]

    if world.get("tools"):
        failures.append(f"canonical world embeds {len(world['tools'])} tool specs")
    duplicates = sorted(name for name, count in Counter(contract_names).items() if count > 1)
    if duplicates:
        failures.append(f"contract tool names are not unique: {duplicates[:8]}")
    route_duplicates = sorted(name for name, count in Counter(routed).items() if count > 1)
    if route_duplicates:
        failures.append(f"tools routed more than once: {route_duplicates[:8]}")
    if set(routed) != set(contract_names):
        failures.append(
            "route/contract mismatch: "
            f"unrouted={sorted(set(contract_names) - set(routed))[:8]} "
            f"unknown={sorted(set(routed) - set(contract_names))[:8]}"
        )
    unknown_walk = sorted(set(walks) - set(contract_names))
    if unknown_walk:
        failures.append(f"task walks use non-contract tools: {unknown_walk[:8]}")
    leaked_walk = sorted(set(walks) & legacy)
    if leaked_walk:
        failures.append(f"task walks retain Gen-1 tools: {leaked_walk[:8]}")

    tasks = world.get("tasks") or []
    verifiers = world.get("verifiers") or []
    task_ids = [task["task_id"] for task in tasks]
    verifier_ids = [verifier["task_id"] for verifier in verifiers]
    if len(tasks) != 291 or len(verifiers) != 291:
        failures.append(f"expected 291 tasks/verifiers, got {len(tasks)}/{len(verifiers)}")
    if Counter(task_ids) != Counter(verifier_ids):
        failures.append("task/verifier id coverage differs")
    for task in tasks:
        args = task.get("reference_args")
        if not isinstance(args, list) or len(args) != len(task.get("walk") or []):
            failures.append(f"{task['task_id']}: reference_args do not cover the walk")
            if len(failures) >= 20:
                break

    vcode = "\n".join(verifier.get("vcode") or "" for verifier in verifiers)
    leaked_vcode = sorted(name for name in legacy if name in vcode)
    if leaked_vcode:
        failures.append(f"verifier code retains Gen-1 tool names: {leaked_vcode[:8]}")
    server = SERVER.read_text()
    for forbidden in ("class ToolRuntime", "def norm_params", "PREVIEW_CHARS"):
        if forbidden in server:
            failures.append(f"server retains synthesized runtime symbol: {forbidden}")

    reconciliation = json.loads(RECONCILIATION.read_text())
    if not reconciliation.get("passed"):
        failures.append("migration reconciliation is not passed")
    if reconciliation.get("rows_dropped") or reconciliation.get("rows_duplicated"):
        failures.append("migration reconciliation reports dropped/duplicated rows")
    if reconciliation.get("gen1_tools_remaining_in_walks") != 0:
        failures.append("migration reconciliation reports Gen-1 walk tools")

    if failures:
        print("product-surface gate failed:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(
        f"product surface: {len(tasks)} tasks / {len(verifiers)} verifiers; "
        f"{len(contract_names)} tools routed exactly once; 0 Gen-1/runtime leaks"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
