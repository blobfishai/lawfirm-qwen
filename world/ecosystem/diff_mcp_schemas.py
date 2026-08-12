#!/usr/bin/env python3
"""Diff the vendored legal-mcp application tools against the world contracts.

The two surfaces intentionally live at different layers: legal-mcp exposes
analysis helpers, while this world exposes vendor-system APIs.  The report
therefore distinguishes exact schema matches from executable adapters,
structural analogues, workflow compositions, and true gaps.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "research/repos/agentic-ops@legal-mcp"
TOOLS_DIR = SOURCE / "tools"
CONTRACTS = ROOT / "mcp/v3/contracts"
COMMITS = ROOT / "research/repos-commits.json"
DATA_OUT = ROOT / "data/ecosystem/mcp-schema-diff.json"
DOC_OUT = ROOT / "docs/MCP-SCHEMA-DIFF.md"


ALIGNMENTS: dict[str, tuple[str, list[str], str]] = {
    "queue_document_analysis": (
        "structural_analogue", ["documents_download", "productions_create", "jobs_get"],
        "Both expose submit/poll async discipline, but a Relativity production is not document analysis.",
    ),
    "get_analysis_status": (
        "structural_analogue", ["jobs_get"],
        "The lifecycle/poll behavior aligns; identifiers and job payloads do not.",
    ),
    "get_analysis_result": (
        "structural_analogue", ["jobs_get", "documents_create"],
        "Retrieval-after-completion aligns, while the world requires an explicit system-of-record write.",
    ),
    "list_analysis_jobs": (
        "structural_analogue", ["productions_list"],
        "Both list async work, but they represent different underlying legal operations.",
    ),
    "generate_brief_outline": (
        "workflow_composition", ["opinions_search", "citation_lookup", "documents_create"],
        "Brief generation is agent work over research and DMS tools, not a mirrored vendor endpoint.",
    ),
    "create_argument_structure": (
        "workflow_composition", ["citation_lookup", "documents_create"],
        "Argument synthesis remains agent behavior; the world verifies sources and the filed deliverable.",
    ),
    "generate_issue_statement": (
        "workflow_composition", ["documents_create"],
        "Drafting logic is evaluated as work product rather than delegated to an analysis tool.",
    ),
    "validate_citation": (
        "structural_analogue", ["citation_lookup"],
        "Citation resolution overlaps, but legal-mcp also applies local formatting rules.",
    ),
    "normalize_citation": (
        "structural_analogue", ["citation_lookup"],
        "The world proves authority resolution; it does not expose a Bluebook normalization endpoint.",
    ),
    "check_demo_database": (
        "structural_analogue", ["citation_lookup"],
        "Both check a seeded authority set, with different input and output contracts.",
    ),
    "compare_contracts": (
        "workflow_composition", ["documents_download", "documents_create"],
        "Comparison is agent work over versioned documents and a filed result.",
    ),
    "analyze_clauses": (
        "workflow_composition", ["documents_search_fulltext", "documents_download", "documents_create"],
        "Clause analysis composes DMS reads and a grounded deliverable; no vendor API performs the analysis.",
    ),
    "extract_clauses": (
        "workflow_composition", ["documents_search_fulltext", "documents_download", "documents_create"],
        "Extraction is graded from source evidence rather than represented as a vendor endpoint.",
    ),
    "suggest_clause_alternatives": (
        "workflow_composition", ["documents_search_fulltext", "documents_create"],
        "Playbook-grounded drafting is agent behavior with deterministic anchors.",
    ),
    "generate_negotiation_guide": (
        "workflow_composition", ["documents_download", "documents_create"],
        "The output maps to a DMS deliverable, while its analysis remains model work.",
    ),
    "deep_analyze_clause": (
        "workflow_composition", ["documents_download", "documents_create"],
        "Provider-backed clause reasoning is intentionally not mocked as a product system.",
    ),
    "analyze_document": (
        "workflow_composition", ["documents_download", "documents_create"],
        "File-path analysis becomes a required DMS read plus grounded filed output.",
    ),
    "compare_documents": (
        "workflow_composition", ["documents_download", "document_versions_list", "documents_create"],
        "The world supplies version state and grades the comparison deliverable.",
    ),
    "export_analysis_report": (
        "workflow_composition", ["documents_create"],
        "Export maps to a DMS write, with a different identifier/profile contract.",
    ),
    "extract_contract_metadata": (
        "workflow_composition", ["documents_download", "documents_create"],
        "Metadata extraction is a task assertion over a source document, not a vendor method.",
    ),
    "integration_status": (
        "no_counterpart", [],
        "This is legal-mcp configuration introspection, outside a simulated firm system.",
    ),
    "search_live_case_law": (
        "compatibility_adapter", ["opinions_search"],
        "The CourtListener base-URL facade executes this route locally; source/jurisdiction options are narrowed.",
    ),
    "check_privilege_risk": (
        "workflow_composition", ["review_documents_get", "privilege_log_create"],
        "Privilege analysis remains agent work; review coding and privilege-log state are vendor surfaces.",
    ),
    "search_precedents": (
        "structural_analogue", ["opinions_search"],
        "Both search case law, but legal-mcp searches a local demo dataset and returns an application envelope.",
    ),
    "extract_statute": (
        "no_counterpart", [],
        "The US-practice world has no seeded statutory-code system; adding one requires licensed authority and a public API.",
    ),
    "search_case_law": (
        "structural_analogue", ["opinions_search"],
        "Semantic search overlaps while parameters, pagination, corpus, and response shape differ.",
    ),
    "research_legal_issue": (
        "workflow_composition", ["opinions_search", "citation_lookup", "documents_create"],
        "Research synthesis is evaluated as an attributed workflow over resolvable authorities.",
    ),
}


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def annotation(node: ast.expr | None) -> str | None:
    return ast.unparse(node) if node is not None else None


def default_value(node: ast.expr | None) -> Any:
    if node is None:
        return None
    try:
        return ast.literal_eval(node)
    except (ValueError, TypeError):
        return ast.unparse(node)


def is_tool_decorator(node: ast.expr) -> bool:
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "tool"
    )


def extract_source_tools() -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    for path in sorted(TOOLS_DIR.glob("*_tools.py")):
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if not any(is_tool_decorator(item) for item in node.decorator_list):
                continue
            positional = list(node.args.posonlyargs) + list(node.args.args)
            default_nodes: list[ast.expr | None] = [None] * (len(positional) - len(node.args.defaults)) + list(node.args.defaults)
            parameters = []
            for arg, default in zip(positional, default_nodes):
                arg_annotation = annotation(arg.annotation)
                injected = arg.arg in {"ctx", "context"} or (arg_annotation or "").endswith("Context")
                parameters.append({
                    "name": arg.arg,
                    "annotation": arg_annotation,
                    "required": default is None,
                    "default": default_value(default),
                    "injected": injected,
                })
            tools.append({
                "name": node.name,
                "module": path.name,
                "line": node.lineno,
                "async": isinstance(node, ast.AsyncFunctionDef),
                "parameters": parameters,
                "return_annotation": annotation(node.returns),
                "description": (ast.get_docstring(node) or "").strip(),
                "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
    return sorted(tools, key=lambda item: item["name"])


def load_world_tools() -> dict[str, dict[str, Any]]:
    tools: dict[str, dict[str, Any]] = {}
    for path in sorted(CONTRACTS.glob("*.json")):
        contract = json.loads(path.read_text())
        for tool in contract.get("tools", []):
            name = tool.get("name")
            if name:
                tools[name] = {
                    "name": name,
                    "contract": path.name,
                    "system": contract.get("system"),
                    "mirrors": tool.get("mirrors"),
                    "params": tool.get("params") or {},
                    "response_adapter": tool.get("response_adapter"),
                }
    return tools


def parameter_diff(source: dict[str, Any], targets: list[dict[str, Any]]) -> dict[str, Any]:
    source_names = [item["name"] for item in source["parameters"] if not item["injected"]]
    target_names = sorted({name for target in targets for name in target["params"]})
    shared = sorted(set(source_names) & set(target_names))
    return {
        "source": source_names,
        "target_union": target_names,
        "shared": shared,
        "source_only": sorted(set(source_names) - set(target_names)),
        "target_only": sorted(set(target_names) - set(source_names)),
        "exact": len(targets) == 1 and source_names == target_names,
    }


def build() -> tuple[dict[str, Any], str]:
    source_tools = extract_source_tools()
    world_tools = load_world_tools()
    source_names = {item["name"] for item in source_tools}
    missing_alignment = source_names - ALIGNMENTS.keys()
    extra_alignment = ALIGNMENTS.keys() - source_names
    if missing_alignment or extra_alignment:
        raise RuntimeError(
            f"alignment registry drift; missing={sorted(missing_alignment)}, extra={sorted(extra_alignment)}"
        )

    rows: list[dict[str, Any]] = []
    for source in source_tools:
        relation, target_names, rationale = ALIGNMENTS[source["name"]]
        targets = [world_tools[name] for name in target_names]
        input_diff = parameter_diff(source, targets)
        exact_name = len(target_names) == 1 and source["name"] == target_names[0]
        rows.append({
            **source,
            "source_layer": "application_analysis_tool",
            "relation": relation,
            "world_tools": target_names,
            "world_systems": sorted({target["system"] for target in targets}),
            "input_comparison": input_diff,
            "output_comparison": {
                "source": "JSON-encoded string or generated file path",
                "world": "vendor-specific wire envelope plus persisted session state",
                "exact": False,
            },
            "exact_name": exact_name,
            "exact_contract": exact_name and input_diff["exact"],
            "rationale": rationale,
        })

    relation_counts = Counter(row["relation"] for row in rows)
    commits = json.loads(COMMITS.read_text())
    report = {
        "schema": "legal-agent-simulation.mcp-schema-diff.v1",
        "method": "Python AST over decorated legal-mcp tools; JSON contract parse over every v3 world tool",
        "source": {
            "repo": "agentic-ops/legal-mcp",
            "commit": commits["agentic-ops@legal-mcp"],
            "license": "AGPL-3.0-only",
            "layer": "application-level analysis and workflow helpers",
            "tool_count": len(source_tools),
        },
        "target": {
            "path": "mcp/v3/contracts/*.json",
            "layer": "spec-backed vendor-system operations",
            "tool_count": len(world_tools),
        },
        "summary": {
            "exact_name_matches": sum(row["exact_name"] for row in rows),
            "exact_input_schemas": sum(row["input_comparison"]["exact"] for row in rows),
            "exact_output_schemas": sum(row["output_comparison"]["exact"] for row in rows),
            "exact_contracts": sum(row["exact_contract"] for row in rows),
            "relations": dict(sorted(relation_counts.items())),
            "executable_adapters": [row["name"] for row in rows if row["relation"] == "compatibility_adapter"],
        },
        "conclusion": (
            "The surfaces are complementary, not schema-equivalent: legal-mcp packages legal analysis; "
            "the world exposes systems of record. Preserve both layers and test compositions rather "
            "than renaming vendor contracts to imply false exactness."
        ),
        "tools": rows,
        "world_only_tools": sorted(set(world_tools) - source_names),
    }
    return report, render_doc(report)


def render_doc(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# MCP schema diff: legal-mcp vs the simulation world",
        "",
        f"Pinned source: `{report['source']['repo']}@{report['source']['commit']}` ({report['source']['license']}). The comparison parses **{report['source']['tool_count']}** decorated source tools and **{report['target']['tool_count']}** spec-backed world tools.",
        "",
        "## Result",
        "",
        f"- Exact tool-name matches: **{summary['exact_name_matches']}**",
        f"- Exact input schemas: **{summary['exact_input_schemas']}**",
        f"- Exact output schemas: **{summary['exact_output_schemas']}**",
        f"- Exact end-to-end contracts: **{summary['exact_contracts']}**",
        f"- Executable compatibility adapters: **{len(summary['executable_adapters'])}** (`search_live_case_law` through the CourtListener base-URL facade)",
        "",
        "That zero is expected and important. `legal-mcp` exposes application-level research, drafting, and analysis helpers. The world exposes Clio-, CourtListener-, iManage-, Relativity-, Google-, LEDES-, ECF-, CalendarRules-, and DocuSign-shaped operations with persistent state. Similar legal purpose does not make inputs or outputs identical.",
        "",
        "## Per-tool alignment",
        "",
        "| legal-mcp tool | Relation | World composition | Input exact? | Output exact? |",
        "|---|---|---|---:|---:|",
    ]
    for row in report["tools"]:
        targets = ", ".join(f"`{name}`" for name in row["world_tools"]) or "—"
        lines.append(
            f"| `{row['name']}` | {row['relation'].replace('_', ' ')} | {targets} | "
            f"{'yes' if row['input_comparison']['exact'] else 'no'} | "
            f"{'yes' if row['output_comparison']['exact'] else 'no'} |"
        )

    lines.extend([
        "",
        "## Design consequences",
        "",
        "1. Do not rename the vendor contracts to legal-mcp names. That would erase the distinction between doing legal analysis and changing a system of record.",
        "2. Evaluate legal-mcp as an application layer composed over the world. The first executable path is its configurable CourtListener client through `mcp/byo/courtlistener_facade.py`.",
        "3. Keep async submit/poll/retrieve as a cross-layer failure-mode test, while documenting that Relativity production and document analysis are different jobs.",
        "4. Treat statute retrieval as a real gap. It needs a licensed, version-pinned authority corpus and a provable API before a mock is admitted.",
        "5. Preserve world-only state surfaces: practice management, DMS versions, e-filing, billing, deadlines, and e-signature are precisely what analysis-only MCP tools cannot verify.",
        "",
        "## Rebuild",
        "",
        "```bash",
        "python3 world/ecosystem/diff_mcp_schemas.py",
        "python3 tools/check_mcp_schema_diff.py",
        "```",
        "",
        "The complete parameter-level diff and source locations live in `data/ecosystem/mcp-schema-diff.json`.",
        "",
    ])
    return "\n".join(lines)


def expected_outputs() -> dict[Path, str]:
    report, doc = build()
    return {DATA_OUT: stable_json(report), DOC_OUT: doc}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs = expected_outputs()
    if args.check:
        stale = [str(path.relative_to(ROOT)) for path, value in outputs.items()
                 if not path.exists() or path.read_text() != value]
        if stale:
            print("stale MCP schema-diff artifacts: " + ", ".join(stale))
            return 1
        report = json.loads(outputs[DATA_OUT])
        print(
            f"MCP schema diff current: {report['source']['tool_count']} source vs "
            f"{report['target']['tool_count']} world tools; "
            f"{report['summary']['exact_contracts']} exact, "
            f"{len(report['summary']['executable_adapters'])} executable adapter"
        )
        return 0
    for path, value in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)
    report = json.loads(outputs[DATA_OUT])
    print(
        f"diffed {report['source']['tool_count']} legal-mcp tools against "
        f"{report['target']['tool_count']} world tools"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
