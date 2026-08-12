#!/usr/bin/env python3
"""Compile the vendored legal-skill corpus into auditable task candidates.

This is deliberately a census and a compiler front-end, not an admission
shortcut.  A skill can supply workflow shape and procedural ordering; it
cannot supply US law, task evidence, or an answer key.  Every emitted candidate
therefore remains ``not_admitted`` until a manifest, authority pack, oracle and
discrimination run exist.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SOURCE_REPO = ROOT / "research/repos/CSlawyer1985@claude-for-legal-ZH"
COMMITS = ROOT / "research/repos-commits.json"
CONTRACTS = ROOT / "mcp/v3/contracts"
CENSUS_OUT = ROOT / "data/ecosystem/skill-census.json"
CANDIDATES_OUT = ROOT / "data/ecosystem/skill-task-candidates.json"
DOC_OUT = ROOT / "docs/SKILL-TO-TASK.md"
SOURCE_NAME = "CSlawyer1985/claude-for-legal-ZH"
SOURCE_KEY = "CSlawyer1985@claude-for-legal-ZH"
LICENSE = "Apache-2.0"
JURISDICTION = "CN_source_requires_US_authority_pack"


CAPABILITIES = {
    1: "Extraction & determination",
    2: "Rule application",
    3: "Computation",
    4: "Retrieval & review at scale",
    5: "Grounded drafting & redlining",
    6: "Workflow execution",
    7: "Abstention & escalation",
    8: "Operational robustness",
    9: "Multi-turn & interruption",
    10: "Long-horizon composite matters",
}

META_NAMES = {
    "auto-updater", "build-guide", "cold-start-interview", "customize",
    "disable", "matter-workspace", "ramp", "registry-browser",
    "related-skills-surfacer", "skill-installer", "skill-manager",
    "skills-qa", "uninstall",
}

KEYWORD_TO_CAPABILITY = (
    (7, ("escalat", "gap-surfacer", "gaps", "is-this-a-problem")),
    (3, ("deadline", "renewal", "leave", "closing-checklist", "wage-hour")),
    (4, ("research", "search", "monitor", "watcher", "portfolio", "chronology",
         "diligence", "clearance", "fto", "matter-briefing")),
    (5, ("draft", "letter", "memo", "brief", "consent", "minutes", "policy",
         "takedown", "cease-desist", "claim-chart", "handbook")),
    (1, ("extract", "intake", "metadata", "issue", "history", "log-", "inventory")),
    (2, ("triage", "assessment", "classification", "termination", "bail",
         "case-analysis", "review", "compliance")),
    (8, ("feed-watcher", "auto-update", "status")),
    (9, ("update", "investigation-add", "investigation-query")),
    (10, ("integration-management",)),
)


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_frontmatter(text: str, fallback_name: str) -> dict[str, str | None]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {"name": fallback_name, "description": "", "argument_hint": None}
    try:
        end = next(i for i, line in enumerate(lines[1:], 1) if line.strip() == "---")
    except StopIteration:
        return {"name": fallback_name, "description": "", "argument_hint": None}

    values: dict[str, str] = {}
    current: str | None = None
    for line in lines[1:end]:
        match = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$", line)
        if match:
            current = match.group(1).replace("-", "_")
            raw = match.group(2).strip()
            values[current] = "" if raw in {">", "|", ">-", "|-"} else raw
        elif current and (line.startswith(" ") or line.startswith("\t")):
            value = line.strip()
            if value:
                values[current] = (values[current] + " " + value).strip()

    def clean(value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        return re.sub(r"\s+", " ", value).strip()

    return {
        "name": clean(values.get("name")) or fallback_name,
        "description": clean(values.get("description")) or "",
        "argument_hint": clean(values.get("argument_hint")),
    }


def extract_procedure(text: str) -> list[str]:
    """Extract explicit procedural steps without interpreting legal content."""
    steps: list[str] = []
    in_fence = False
    for raw in text.splitlines():
        if raw.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        numbered = re.match(r"^\s*(\d{1,2}[.)])\s+(.+)$", raw)
        heading = re.match(
            r"^#{2,4}\s+((?:步骤|Step|模式|Phase)\s*[0-9A-Za-z一二三四五六七八九十]*[:：]?\s*.*)$",
            raw,
            re.IGNORECASE,
        )
        value = numbered.group(2) if numbered else (heading.group(1) if heading else None)
        if value:
            value = re.sub(r"[`*_#]", "", value)
            value = re.sub(r"\s+", " ", value).strip()
            if value and value not in steps:
                steps.append(value)
    return steps


def detect_guards(text: str) -> list[str]:
    lower = text.lower()
    patterns = {
        "confidentiality_or_privilege": ("保密", "特权", "confidential", "privilege"),
        "gap_disclosure": ("缺口", "无法验证", "绝不填补", "do not invent", "unverified"),
        "version_or_diff": ("版本", "变更", "diff", "version history"),
        "source_attribution": ("引用", "来源", "source", "citation"),
        "human_confirmation": ("确认", "主管", "律师", "supervisor", "human review", "approval"),
        "posture_dependent": ("立场", "不利证人", "有利证人", "adverse", "friendly witness"),
    }
    return sorted(name for name, needles in patterns.items() if any(n in lower for n in needles))


def disposition(area: str, name: str) -> tuple[str, str]:
    if area == ".agents":
        return "census_only", "Codex routing wrapper, not an independent workflow"
    if area == "law-student":
        return "census_only", "educational workflow outside the firm-work benchmark"
    if area == "legal-builder-hub":
        return "census_only", "skill-management workflow, not legal matter work"
    if name in META_NAMES:
        return "census_only", "configuration or workspace bootstrap, not a scored matter outcome"
    return "workflow_shape_candidate", "procedural shape can seed a manifest-backed US workflow"


def capability_for(area: str, name: str) -> int:
    haystack = f"{area} {name}".lower()
    for capability, needles in KEYWORD_TO_CAPABILITY:
        if any(needle in haystack for needle in needles):
            return capability
    return 6


def tool_walk_for(area: str, name: str, available: set[str]) -> list[str]:
    haystack = f"{area} {name}".lower()
    tools = ["documents_search_fulltext", "documents_download"]

    research = any(word in haystack for word in (
        "research", "case", "brief", "legal-writing", "claim", "bail",
        "subpoena", "cease", "fto", "clearance", "infringement",
    ))
    discovery = any(word in haystack for word in (
        "diligence", "deposition", "hold", "privilege", "investigation",
        "chronology", "subpoena", "matter-briefing",
    ))
    deadline = any(word in haystack for word in ("deadline", "renewal", "leave", "docket"))
    closing = any(word in haystack for word in ("closing", "written-consent", "board-minutes"))
    communicate = any(word in haystack for word in (
        "letter", "status", "summary", "update", "demand", "escalat",
        "takedown", "comments",
    ))

    if research:
        tools.extend(["opinions_search", "citation_lookup"])
    if discovery:
        tools.extend(["review_documents_search", "review_documents_get"])
    if deadline:
        tools.append("deadlines_compute")
    if closing:
        tools.extend(["esign_envelopes_create", "esign_envelopes_send"])
    if communicate:
        tools.append("gmail_messages_send")

    if area in {"corporate-legal", "employment-legal", "legal-clinic", "litigation-legal"}:
        tools.extend(["matters_list", "tasks_create"])
    tools.append("documents_create")

    result: list[str] = []
    for tool in tools:
        if tool in available and tool not in result:
            result.append(tool)
    return result


def load_available_tools() -> tuple[set[str], dict[str, str]]:
    names: set[str] = set()
    systems: dict[str, str] = {}
    for path in sorted(CONTRACTS.glob("*.json")):
        contract = json.loads(path.read_text())
        system = str(contract.get("system") or path.stem)
        for tool in contract.get("tools", []):
            name = tool.get("name")
            if name:
                names.add(name)
                systems[name] = system
    return names, systems


def candidate_for(skill: dict[str, Any], available: set[str], systems: dict[str, str]) -> dict[str, Any]:
    walk = tool_walk_for(skill["area"], skill["name"], available)
    capability = capability_for(skill["area"], skill["name"])
    return {
        "candidate_id": f"skill-{skill['area'].strip('.').replace('_', '-')}-{skill['name']}",
        "source_skill_id": skill["skill_id"],
        "status": "not_admitted",
        "status_reason": (
            "workflow shape only; requires a US authority pack, fact manifest, rendered evidence, "
            "compiled assertions, oracle proof, and discrimination proof"
        ),
        "jurisdiction_gate": JURISDICTION,
        "capability": {"id": capability, "name": CAPABILITIES[capability]},
        "workflow": {
            "procedure": skill["procedure"],
            "tool_walk_template": walk,
            "systems": sorted({systems[name] for name in walk}),
        },
        "manifest_requirements": {
            "facts": ["parties", "dates", "obligations", "determinations"],
            "evidence": "rendered or licensed US-practice source documents",
            "authority": "pinned US primary authority where legal rules or deadlines are applied",
            "absences": "enumerated unsupported facts for fabrication traps",
            "distractors": "non-colliding values proven by round-trip extraction",
        },
        "deterministic_grading_template": {
            "required_path": walk,
            "required_reads": [name for name in walk if name.endswith(("download", "get")) or "search" in name],
            "terminal_state": "documents_create or the workflow-specific state write must persist",
            "grounded_anchors": "compiled from the validated manifest; grounding failure vetoes reward to 0",
            "collateral_damage_veto": True,
            "fabrication_veto": True,
        },
        "admission_gates": [
            "round_trip_manifest",
            "oracle_reference_walk",
            "reject_noop",
            "reject_text_only",
            "reject_blind_write",
            "reject_corrupted_value",
        ],
    }


def build() -> tuple[dict[str, Any], dict[str, Any], str]:
    commits = json.loads(COMMITS.read_text())
    source_commit = commits[SOURCE_KEY]
    available, systems = load_available_tools()
    paths = sorted(SOURCE_REPO.rglob("SKILL.md"), key=lambda p: p.as_posix())
    skills: list[dict[str, Any]] = []

    for path in paths:
        rel = path.relative_to(SOURCE_REPO).as_posix()
        parts = path.relative_to(SOURCE_REPO).parts
        area = ".agents" if parts[0] == ".agents" else parts[0]
        text = path.read_text(errors="replace")
        meta = parse_frontmatter(text, path.parent.name)
        name = str(meta["name"] or path.parent.name)
        state, reason = disposition(area, name)
        procedure = extract_procedure(text)
        skills.append({
            "skill_id": f"{area}/{name}",
            "area": area,
            "name": name,
            "description": meta["description"],
            "argument_hint": meta["argument_hint"],
            "source_path": rel,
            "source_sha256": sha256(path),
            "source_bytes": path.stat().st_size,
            "procedure": procedure,
            "procedure_step_count": len(procedure),
            "guards": detect_guards(text),
            "disposition": state,
            "disposition_reason": reason,
            "jurisdiction": JURISDICTION,
        })

    candidates = [
        candidate_for(skill, available, systems)
        for skill in skills
        if skill["disposition"] == "workflow_shape_candidate"
    ]
    by_area = Counter(skill["area"] for skill in skills)
    by_disposition = Counter(skill["disposition"] for skill in skills)
    by_capability = Counter(str(item["capability"]["id"]) for item in candidates)
    guard_counts = Counter(guard for skill in skills for guard in skill["guards"])

    source = {
        "repo": SOURCE_NAME,
        "vendored_path": str(SOURCE_REPO.relative_to(ROOT)),
        "commit": source_commit,
        "license": LICENSE,
    }
    census = {
        "schema": "legal-agent-simulation.skill-census.v1",
        "source": source,
        "policy": {
            "role": "demand census and procedure evidence",
            "jurisdiction": JURISDICTION,
            "automatic_task_admission": False,
            "rule": "skills define workflow shape; manifests and code define correctness",
        },
        "counts": {
            "skills": len(skills),
            "areas": len(by_area),
            "by_area": dict(sorted(by_area.items())),
            "by_disposition": dict(sorted(by_disposition.items())),
            "guards": dict(sorted(guard_counts.items())),
        },
        "skills": skills,
    }
    candidate_doc = {
        "schema": "legal-agent-simulation.skill-task-candidates.v1",
        "source": source,
        "contract_surface": {
            "directory": "mcp/v3/contracts",
            "available_tool_count": len(available),
            "all_template_tools_validated": True,
        },
        "counts": {
            "candidates": len(candidates),
            "admitted": 0,
            "by_capability": dict(sorted(by_capability.items(), key=lambda item: int(item[0]))),
        },
        "candidates": candidates,
    }
    return census, candidate_doc, render_doc(census, candidate_doc)


def render_doc(census: dict[str, Any], candidate_doc: dict[str, Any]) -> str:
    counts = census["counts"]
    lines = [
        "# Skill → task compiler",
        "",
        "This is an evidence-backed demand census, not an automatic task import. The vendored Chinese-law skills provide procedural shapes; every scored task still needs US-practice evidence and mechanically proven answer keys.",
        "",
        "## Provenance and scope",
        "",
        f"- Source: `{census['source']['repo']}@{census['source']['commit']}` ({census['source']['license']})",
        f"- Skills inspected: **{counts['skills']}** across **{counts['areas']}** areas; every source file is SHA-256 pinned.",
        f"- Workflow-shape candidates: **{candidate_doc['counts']['candidates']}**; admitted tasks: **0**.",
        "- Jurisdiction boundary: no Chinese legal proposition or deadline is copied into the US benchmark. A candidate cannot advance without a US authority pack.",
        "",
        "## Disposition by area",
        "",
        "| Area | Skills | Candidates | Census-only |",
        "|---|---:|---:|---:|",
    ]
    candidate_area = Counter(
        item["source_skill_id"].split("/", 1)[0]
        for item in candidate_doc["candidates"]
    )
    for area, total in counts["by_area"].items():
        candidate_count = candidate_area.get(area, 0)
        lines.append(f"| `{area}` | {total} | {candidate_count} | {total - candidate_count} |")

    lines.extend([
        "",
        "## Candidate capability mix",
        "",
        "| Type | Capability | Candidates |",
        "|---:|---|---:|",
    ])
    for capability, name in CAPABILITIES.items():
        lines.append(
            f"| {capability} | {name} | {candidate_doc['counts']['by_capability'].get(str(capability), 0)} |"
        )

    lines.extend([
        "",
        "## Compiler contract",
        "",
        "For each candidate the compiler preserves source provenance, extracts only explicit procedure steps, maps the shape onto existing spec-backed tools, and emits a grading template. It does not invent facts or law.",
        "",
        "A candidate remains `not_admitted` until all six gates pass:",
        "",
        "1. Manifest round trip proves every planted fact and distractor.",
        "2. A reference walk passes the compiled verifier.",
        "3. No-op behavior fails.",
        "4. Chat/text-only behavior fails when state must change.",
        "5. Blind writes fail required-read checks.",
        "6. Corrupted values fail grounded assertions.",
        "",
        "## Rebuild",
        "",
        "```bash",
        "python3 world/ecosystem/compile_skills.py",
        "python3 tools/check_skill_task_compiler.py",
        "```",
        "",
        "Machine-readable artifacts: `data/ecosystem/skill-census.json` and `data/ecosystem/skill-task-candidates.json`.",
        "",
    ])
    return "\n".join(lines)


def expected_outputs() -> dict[Path, str]:
    census, candidates, doc = build()
    return {
        CENSUS_OUT: stable_json(census),
        CANDIDATES_OUT: stable_json(candidates),
        DOC_OUT: doc,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if committed artifacts differ")
    args = parser.parse_args()
    if not SOURCE_REPO.exists():
        # The 175-skill census source is the gitignored research corpus and is
        # absent on CI runners. The census is only recomputable where the
        # corpus lives — regenerating without it would replace real artifacts
        # with empty ones (same class as the parity-audit CI defect).
        print("skill corpus absent (gitignored research/repos/) — census not "
              "recomputable here; committed artifacts left as-is.")
        return 0
    outputs = expected_outputs()
    if args.check:
        stale = [str(path.relative_to(ROOT)) for path, value in outputs.items()
                 if not path.exists() or path.read_text() != value]
        if stale:
            print("stale skill compiler artifacts: " + ", ".join(stale))
            return 1
        census = json.loads(outputs[CENSUS_OUT])
        candidates = json.loads(outputs[CANDIDATES_OUT])
        print(
            f"skill compiler current: {census['counts']['skills']} skills, "
            f"{candidates['counts']['candidates']} candidates, 0 auto-admitted"
        )
        return 0

    for path, value in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)
    census = json.loads(outputs[CENSUS_OUT])
    candidates = json.loads(outputs[CANDIDATES_OUT])
    print(
        f"compiled {census['counts']['skills']} skills into "
        f"{candidates['counts']['candidates']} non-admitted workflow candidates"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
