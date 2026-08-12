#!/usr/bin/env python3
"""Acceptance checks for the M8 MCP schema-diff report."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/ecosystem/mcp-schema-diff.json"


def main() -> int:
    subprocess.run(
        [sys.executable, str(ROOT / "world/ecosystem/diff_mcp_schemas.py"), "--check"],
        cwd=ROOT,
        check=True,
    )
    report = json.loads(DATA.read_text())
    rows = report["tools"]
    if report["source"]["tool_count"] != 27 or len(rows) != 27:
        raise AssertionError("all 27 decorated legal-mcp tools must be represented exactly once")
    if len({row["name"] for row in rows}) != len(rows):
        raise AssertionError("duplicate legal-mcp tool in schema diff")
    if report["summary"]["exact_contracts"] != 0:
        raise AssertionError("no legal-mcp application tool has an exact vendor contract")
    if report["summary"]["executable_adapters"] != ["search_live_case_law"]:
        raise AssertionError("CourtListener search must be the sole currently proven adapter")

    contract_tools = set()
    for path in sorted((ROOT / "mcp/v3/contracts").glob("*.json")):
        contract = json.loads(path.read_text())
        contract_tools.update(tool["name"] for tool in contract.get("tools", []) if tool.get("name"))
    for row in rows:
        unknown = set(row["world_tools"]) - contract_tools
        if unknown:
            raise AssertionError(f"{row['name']} maps to unknown world tools: {sorted(unknown)}")
        if row["output_comparison"]["exact"]:
            raise AssertionError(f"unsupported exact-output claim for {row['name']}")

    module_path = ROOT / "world/ecosystem/diff_mcp_schemas.py"
    spec = importlib.util.spec_from_file_location("diff_mcp_schemas", module_path)
    if spec is None or spec.loader is None:
        raise AssertionError("could not load MCP diff compiler")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if module.expected_outputs() != module.expected_outputs():
        raise AssertionError("MCP schema diff is not bit-identical")

    print(
        f"MCP schema diff accepted: 27/27 source tools, {len(contract_tools)} world tools, "
        "0 false exactness claims, 1 executable adapter"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
