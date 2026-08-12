#!/usr/bin/env python3
"""Acceptance checks for the M8 skill-to-task compiler."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CENSUS_PATH = ROOT / "data/ecosystem/skill-census.json"
CANDIDATES_PATH = ROOT / "data/ecosystem/skill-task-candidates.json"
SOURCE = ROOT / "research/repos/CSlawyer1985@claude-for-legal-ZH"


def fail(message: str) -> None:
    raise AssertionError(message)


def main() -> int:
    if not SOURCE.exists():
        # Gitignored research corpus is absent on CI runners; this gate is
        # only computable where the corpus lives (parity-audit defect class).
        print("corpus absent (gitignored research/repos/) — skill-compiler gate skipped; "
              "committed artifacts left as-is.")
        return 0
    subprocess.run(
        [sys.executable, str(ROOT / "world/ecosystem/compile_skills.py"), "--check"],
        cwd=ROOT,
        check=True,
    )
    census = json.loads(CENSUS_PATH.read_text())
    candidate_doc = json.loads(CANDIDATES_PATH.read_text())
    source_paths = sorted(SOURCE.rglob("SKILL.md"))
    skills = census["skills"]
    candidates = candidate_doc["candidates"]

    if len(source_paths) != 175 or census["counts"]["skills"] != 175 or len(skills) != 175:
        fail("the census must account for exactly all 175 vendored SKILL.md files")
    if candidate_doc["counts"]["admitted"] != 0:
        fail("workflow-shape compilation must never auto-admit a scored task")
    if any(item["status"] != "not_admitted" for item in candidates):
        fail("every skill-derived task candidate must remain not_admitted")

    expected_paths = {path.relative_to(SOURCE).as_posix(): path for path in source_paths}
    observed_paths = {item["source_path"]: item for item in skills}
    if expected_paths.keys() != observed_paths.keys():
        fail("census source paths do not exactly match the vendored skill corpus")
    for rel, path in expected_paths.items():
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if observed_paths[rel]["source_sha256"] != digest:
            fail(f"source digest drift for {rel}")
        if observed_paths[rel]["disposition"] not in {"census_only", "workflow_shape_candidate"}:
            fail(f"missing disposition for {rel}")
        if observed_paths[rel]["jurisdiction"] != "CN_source_requires_US_authority_pack":
            fail(f"jurisdiction boundary missing for {rel}")

    contract_tools = set()
    for path in sorted((ROOT / "mcp/v3/contracts").glob("*.json")):
        contract = json.loads(path.read_text())
        contract_tools.update(tool["name"] for tool in contract.get("tools", []) if tool.get("name"))
    for candidate in candidates:
        unknown = set(candidate["workflow"]["tool_walk_template"]) - contract_tools
        if unknown:
            fail(f"{candidate['candidate_id']} maps to unknown tools: {sorted(unknown)}")
        if candidate["jurisdiction_gate"] != "CN_source_requires_US_authority_pack":
            fail(f"{candidate['candidate_id']} bypasses the jurisdiction gate")
        required = set(candidate["admission_gates"])
        if {"oracle_reference_walk", "reject_noop", "reject_corrupted_value"} - required:
            fail(f"{candidate['candidate_id']} is missing mandatory admission gates")

    # Prove in-process determinism in addition to the committed-artifact check.
    module_path = ROOT / "world/ecosystem/compile_skills.py"
    spec = importlib.util.spec_from_file_location("compile_skills", module_path)
    if spec is None or spec.loader is None:
        fail("could not load compiler")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    first = module.expected_outputs()
    second = module.expected_outputs()
    if first != second:
        fail("skill compiler is not bit-identical across repeated builds")

    print(
        f"skill compiler accepted: 175/175 files pinned, {len(candidates)} workflow-shape "
        "candidates, 0 auto-admitted, all tool mappings valid"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
