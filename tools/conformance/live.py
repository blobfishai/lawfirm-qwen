#!/usr/bin/env python3
"""Replay one deterministic success call per contract tool and validate schemas.

The report records arguments, response digests, and schema verdicts—not full seeded
records—so it is small enough to review and stable enough for CI. A schema mismatch is
a measured fidelity gap; a failed sample call or stale report is a harness failure.
"""

from __future__ import annotations

import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path
import sys
from typing import Any
import warnings

warnings.filterwarnings("ignore", message="jsonschema.RefResolver is deprecated.*", category=DeprecationWarning)
try:
    from jsonschema import Draft7Validator, RefResolver
except ImportError as exc:  # pragma: no cover - exercised by dependency-free CI failure
    raise SystemExit(
        "jsonschema is required for live conformance; install tools/conformance/requirements.txt"
    ) from exc


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "world" / "local"))

import run as registry_run  # noqa: E402
from oracle import OracleSession  # noqa: E402


WIRE_REPORT_PATH = ROOT / "data" / "conformance-wire.json"
INPUT_SCHEMA_BUNDLE = ROOT / "mcp" / "v3" / "contracts" / "_wire-input-schemas.json.gz"


def value_for(name: str, kind: str) -> object:
    lower = name.lower()
    if kind == "integer":
        return 1
    if kind == "number":
        return 10.0
    if kind == "boolean":
        return True
    if "email" in lower or lower in {"from_addr", "to_addr"}:
        return "conformance@example.com"
    if "date" in lower and not lower.endswith("_at"):
        return "2026-08-12"
    if lower.endswith("_at") or lower in {"timemin", "timemax"}:
        return "2026-08-12T12:00:00Z"
    if lower in {"status", "state"}:
        return "open"
    if lower == "kind":
        return "TimeEntry"
    if "range" in lower:
        return "A1"
    if lower in {"q", "query", "name", "anywhere", "citation"}:
        return "a"
    return "conformance"


def sample_arguments(tool: dict[str, Any]) -> dict[str, object]:
    if isinstance(tool.get("conformance_args"), dict):
        return copy.deepcopy(tool["conformance_args"])
    op = tool.get("op", {})
    kind = op.get("kind")
    params = tool.get("params", {})
    param_map = tool.get("param_map") or {}
    inverse = {internal: external for external, internal in param_map.items()}
    arguments: dict[str, object] = {}

    def external(internal: str) -> str:
        return inverse.get(internal, internal)

    def add(internal: str) -> None:
        name = external(internal)
        arguments[name] = value_for(name, params.get(name, "string"))

    if kind in {"get", "job_poll"}:
        add("id")
    elif kind == "search":
        preferred = "citation" if "citation" in op.get("fields", []) else "query"
        candidate = external(preferred)
        if candidate not in params:
            candidate = next(
                (name for name in ("q", "query", "name", "anywhere", "citation") if name in params),
                candidate,
            )
        arguments[candidate] = value_for(candidate, params.get(candidate, "string"))
    elif kind == "create":
        for required in op.get("required", []):
            add(required)
    elif kind == "update":
        add("id")
        allowed = op.get("allowed") or []
        if allowed:
            add(allowed[0])
    for required in op.get("required", []):
        name = external(required)
        if name not in arguments:
            arguments[name] = value_for(name, params.get(name, "string"))
    return arguments


def resolve_ref(document: dict[str, Any], value: Any) -> Any:
    while isinstance(value, dict) and isinstance(value.get("$ref"), str):
        ref = value["$ref"]
        if not ref.startswith("#/"):
            break
        current: Any = document
        for part in ref[2:].split("/"):
            current = current[part.replace("~1", "/").replace("~0", "~")]
        value = current
    return value


def success_response(operation: dict[str, Any]) -> dict[str, Any] | None:
    responses = operation.get("responses", {})
    for code in sorted(responses, key=str):
        if str(code).startswith("2"):
            value = responses[code]
            return value if isinstance(value, dict) else None
    return None


def openapi_schema(document: dict[str, Any], method: str, path: str) -> tuple[dict[str, Any] | None, Any]:
    operation = document.get("paths", {}).get(path, {}).get(method)
    if not isinstance(operation, dict):
        return None, None
    response = resolve_ref(document, success_response(operation))
    if not isinstance(response, dict):
        return None, None
    content = response.get("content", {})
    media = None
    if isinstance(content, dict):
        media = content.get("application/json")
        if not isinstance(media, dict):
            media = next(
                (value for key, value in content.items() if key.startswith("application/json")),
                None,
            )
    if not isinstance(media, dict):
        return None, None
    schema = media.get("schema")
    if not isinstance(schema, dict):
        return None, None
    return schema, RefResolver.from_schema(document)


def swagger_schema(document: dict[str, Any], operation_id: str) -> tuple[dict[str, Any] | None, Any]:
    operations = registry_run.swagger_operations(document)
    operation = operations.get(operation_id)
    if not operation:
        return None, None
    response = resolve_ref(document, success_response(operation[2]))
    schema = response.get("schema") if isinstance(response, dict) else None
    if not isinstance(schema, dict):
        return None, None
    return schema, RefResolver.from_schema(document)


def rewrite_google_refs(value: Any) -> Any:
    if isinstance(value, dict):
        result = {key: rewrite_google_refs(child) for key, child in value.items()}
        ref = result.get("$ref")
        if isinstance(ref, str) and not ref.startswith("#/"):
            result["$ref"] = f"#/definitions/{ref}"
        if result.get("type") == "any":
            result.pop("type")
        return result
    if isinstance(value, list):
        return [rewrite_google_refs(child) for child in value]
    return value


def normalize_schema(value: Any) -> Any:
    """Normalize machine-readable vendor quirks that are invalid JSON Schema.

    Clio currently serializes a few numeric bounds as strings.  Converting only
    JSON Schema's numeric keywords preserves the represented constraint and
    prevents validators (and MCP clients) from raising a Python type error.
    """
    if isinstance(value, dict):
        result = {key: normalize_schema(child) for key, child in value.items()}
        if result.get("type") == "file":
            result["type"] = "string"
            result.setdefault("format", "binary")
        for key in ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"):
            raw = result.get(key)
            if isinstance(raw, str):
                try:
                    number = float(raw)
                    result[key] = int(number) if number.is_integer() else number
                except ValueError:
                    pass
        return result
    if isinstance(value, list):
        return [normalize_schema(child) for child in value]
    return value


def google_schema(document: dict[str, Any], method_id: str) -> tuple[dict[str, Any] | None, Any]:
    operation = registry_run.google_methods(document).get(method_id)
    response = operation.get("response") if operation else None
    if not isinstance(response, dict):
        return None, None
    root = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "definitions": rewrite_google_refs(copy.deepcopy(document.get("schemas", {}))),
        **rewrite_google_refs(copy.deepcopy(response)),
    }
    return root, None


def _parameter_schema(parameter: dict[str, Any]) -> dict[str, Any]:
    schema = parameter.get("schema")
    if isinstance(schema, dict):
        return copy.deepcopy(schema)
    return {
        key: copy.deepcopy(value)
        for key, value in parameter.items()
        if key in {"type", "format", "enum", "items", "minimum", "maximum", "pattern"}
    } or {"type": "string"}


def _merged_request_schema(
    parameters: list[dict[str, Any]], body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    required: list[str] = []
    for raw in parameters:
        parameter = resolve_ref({}, raw) if not raw.get("$ref") else raw
        name = parameter.get("name")
        if not isinstance(name, str) or parameter.get("in") == "header":
            continue
        if parameter.get("in") == "body":
            properties["body"] = _parameter_schema(parameter)
            if parameter.get("required"):
                required.append("body")
            continue
        properties[name] = _parameter_schema(parameter)
        if parameter.get("required"):
            required.append(name)
    if body is not None:
        properties["body"] = copy.deepcopy(body)
        required.append("body")
    return {"type": "object", "properties": properties,
            "additionalProperties": False,
            **({"required": sorted(set(required))} if required else {})}


def request_schema_for(
    row: dict[str, Any], products: dict[str, Any], specs: dict[str, Any]
) -> tuple[dict[str, Any] | None, Any]:
    product = products[row["product"]]
    document = specs.get(product.get("source"))
    if not isinstance(document, dict):
        return None, None
    mode = row["mode"]
    if mode == "openapi":
        method, path = row["target"]
        path_item = document.get("paths", {}).get(path, {})
        operation = path_item.get(method)
        if not isinstance(operation, dict):
            return None, None
        parameters = [
            resolve_ref(document, item)
            for item in [*(path_item.get("parameters") or []), *(operation.get("parameters") or [])]
            if isinstance(item, dict)
        ]
        return _merged_request_schema(parameters, registry_run.body_schema(operation)), RefResolver.from_schema(document)
    if mode in {"swagger", "imanage_connector"}:
        operation_id = row["target"][0]
        operation = registry_run.swagger_operations(document).get(operation_id)
        if not operation:
            return None, None
        parameters = [resolve_ref(document, item) for item in operation[2].get("parameters", [])
                      if isinstance(item, dict)]
        return _merged_request_schema(parameters), RefResolver.from_schema(document)
    if mode == "google_discovery":
        operation = registry_run.google_methods(document).get(row["target"][0])
        if not operation:
            return None, None
        properties = rewrite_google_refs(copy.deepcopy(operation.get("parameters", {})))
        required = [name for name, value in properties.items()
                    if isinstance(value, dict) and value.get("required")]
        for value in properties.values():
            if isinstance(value, dict):
                value.pop("required", None)
                value.pop("location", None)
        request = operation.get("request")
        if isinstance(request, dict):
            properties["body"] = rewrite_google_refs(copy.deepcopy(request))
            required.append("body")
        schema = {"$schema": "http://json-schema.org/draft-07/schema#",
                  "definitions": rewrite_google_refs(copy.deepcopy(document.get("schemas", {}))),
                  "type": "object", "properties": properties, "additionalProperties": False,
                  **({"required": sorted(set(required))} if required else {})}
        return schema, None
    return None, None


def schema_for(
    row: dict[str, Any], products: dict[str, Any], specs: dict[str, Any]
) -> tuple[dict[str, Any] | None, Any]:
    product = products[row["product"]]
    document = specs.get(product.get("source"))
    if not isinstance(document, dict):
        return None, None
    if row["mode"] == "openapi":
        method, path = row["target"]
        return openapi_schema(document, method, path)
    if row["mode"] == "swagger":
        return swagger_schema(document, row["target"][0])
    if row["mode"] == "google_discovery":
        return google_schema(document, row["target"][0])
    if row["mode"] == "imanage_connector":
        return swagger_schema(document, row["target"][0])
    return None, None


def schema_verdict(schema: dict[str, Any] | None, resolver: Any, value: Any) -> dict[str, Any]:
    if schema is None:
        return {"applicable": False, "passed": False, "reason": "no public machine-readable response schema"}
    validator = Draft7Validator(normalize_schema(schema), resolver=resolver)
    errors = sorted(validator.iter_errors(value), key=lambda error: list(error.absolute_path))
    if not errors:
        return {"applicable": True, "passed": True}
    first = errors[0]
    path = "$" + "".join(
        f"[{part}]" if isinstance(part, int) else f".{part}" for part in first.absolute_path
    )
    return {
        "applicable": True,
        "passed": False,
        "error_count": len(errors),
        "first_error": f"{path}: {first.message}"[:600],
    }


def load_contract_documents() -> dict[str, dict[str, Any]]:
    tools: dict[str, dict[str, Any]] = {}
    for path in sorted((ROOT / "mcp" / "v3" / "contracts").glob("*.json")):
        for tool in json.loads(path.read_text()).get("tools", []):
            tools[tool["name"]] = tool
    return tools


def call_one(base: str, name: str, arguments: dict[str, object]) -> tuple[bool, str]:
    # Contract probes measure the underlying endpoint response. Benchmark
    # friction (429/stale references/ambiguous acks/write caps) is exercised by
    # golden episodes and must not replace the response being schema-checked.
    session = OracleSession(base, profile="contract")
    try:
        return session.call(name, arguments, retries=2)
    finally:
        session.close()


def build_report(base: str) -> tuple[dict[str, Any], list[str]]:
    registry = registry_run.load_json(registry_run.REGISTRY_PATH)
    manifest = registry_run.load_json(registry_run.SPEC_MANIFEST_PATH)
    rows, registry_failures = registry_run.flatten_registry(registry)
    specs, spec_failures = registry_run.source_documents(manifest)
    contracts = load_contract_documents()
    failures = [*registry_failures, *spec_failures]
    results: list[dict[str, Any]] = []

    with gzip.open(INPUT_SCHEMA_BUNDLE, "rt", encoding="utf-8") as handle:
        expected_input_schemas = (json.load(handle).get("tools") or {})
    list_session = OracleSession(base, profile="contract")
    try:
        published_tools = {item["name"]: item for item in list_session.list_tools()}
    finally:
        list_session.close()

    for name in sorted(rows):
        tool = contracts.get(name)
        if tool is None:
            failures.append(f"{name}: registry row has no contract tool")
            continue
        arguments = sample_arguments(tool)
        schema, resolver = schema_for(rows[name], registry.get("products", {}), specs)
        request_schema, request_resolver = request_schema_for(
            rows[name], registry.get("products", {}), specs
        )
        ok, text = call_one(base, name, arguments)
        item: dict[str, Any] = {
            "arguments": arguments,
            "name": name,
            "success_call": ok,
            "request": schema_verdict(request_schema, request_resolver, arguments),
        }
        expected_input = expected_input_schemas.get(name)
        published_input = (published_tools.get(name) or {}).get("inputSchema")
        item["published_input_schema"] = {
            "applicable": expected_input is not None,
            "passed": expected_input is not None and published_input == expected_input,
        }
        if expected_input is not None and published_input != expected_input:
            failures.append(f"{name}: published MCP input schema differs from pinned generated schema")
        if not ok:
            failures.append(f"{name}: deterministic success sample failed: {text[:240]}")
            item.update({"response_digest": None, "schema": {"applicable": False, "passed": False}})
            results.append(item)
            continue
        if schema is None or (isinstance(schema, dict) and schema.get("type") == "string"):
            value = text
        else:
            try:
                value = json.loads(text)
            except json.JSONDecodeError as exc:
                failures.append(f"{name}: success response is not JSON: {exc}")
                item.update({"response_digest": None, "schema": {"applicable": False, "passed": False}})
                results.append(item)
                continue
        canonical = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
        item["response_digest"] = hashlib.sha256(canonical).hexdigest()
        item["schema"] = schema_verdict(schema, resolver, value)
        results.append(item)

    applicable = [item for item in results if item["schema"]["applicable"]]
    passed = [item for item in applicable if item["schema"]["passed"]]
    request_applicable = [item for item in results if (item.get("request") or {}).get("applicable")]
    request_passed = [item for item in request_applicable if item["request"]["passed"]]
    published_applicable = [item for item in results if item["published_input_schema"]["applicable"]]
    published_passed = [item for item in published_applicable if item["published_input_schema"]["passed"]]
    report = {
        "schema_version": 1,
        "session_profile": "contract (fault-injection overlay disabled)",
        "specs_as_of": manifest.get("as_of"),
        "summary": {
            # Registry rows are the agent-visible contract. Hidden simulator
            # helpers can remain in contract files without inflating coverage.
            "contract_tools": len(rows),
            "harness_failures": len(failures),
            "schema_applicable": len(applicable),
            "schema_passed": len(passed),
            "request_schema_applicable": len(request_applicable),
            "request_schema_passed": len(request_passed),
            "published_input_schema_applicable": len(published_applicable),
            "published_input_schema_passed": len(published_passed),
            "success_calls": sum(bool(item["success_call"]) for item in results),
            "tools_checked": len(results),
        },
        "failures": failures,
        "tools": results,
    }
    return report, failures


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="replace the committed wire report")
    mode.add_argument("--check", action="store_true", help="compare with the committed wire report (default)")
    parser.add_argument("--base", default="http://127.0.0.1:8974")
    parser.add_argument("--strict", action="store_true", help="require every applicable response schema to pass")
    args = parser.parse_args()

    report, failures = build_report(args.base)
    rendered = registry_run.canonical_json(report)
    if args.write:
        WIRE_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        WIRE_REPORT_PATH.write_text(rendered)
    elif not WIRE_REPORT_PATH.is_file():
        failures.append(f"missing {WIRE_REPORT_PATH.relative_to(ROOT)}; run --write")
    elif WIRE_REPORT_PATH.read_text() != rendered:
        failures.append(f"stale {WIRE_REPORT_PATH.relative_to(ROOT)}; run --write")

    summary = report["summary"]
    if args.strict and summary["schema_passed"] != summary["schema_applicable"]:
        failures.append(
            f"wire schema gate is red: {summary['schema_passed']}/{summary['schema_applicable']} passed"
        )
    print(
        f"success calls {summary['success_calls']}/{summary['tools_checked']}; "
        f"response schemas {summary['schema_passed']}/{summary['schema_applicable']}; "
        f"request schemas {summary['request_schema_passed']}/{summary['request_schema_applicable']}; "
        f"published input schemas {summary['published_input_schema_passed']}/{summary['published_input_schema_applicable']}; "
        f"harness failures {summary['harness_failures']}"
    )
    if failures:
        for failure in failures:
            print(f"ERROR: {failure}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
