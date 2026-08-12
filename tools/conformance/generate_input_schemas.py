#!/usr/bin/env python3
"""Compile vendor request contracts into self-contained MCP input schemas.

The generated artifact is consumed by ``V2Runtime.mcp_tools``.  This keeps the
agent-visible schema mechanically tied to the pinned OpenAPI/Swagger/discovery
documents instead of maintaining a second, hand-written approximation.
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


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / "mcp" / "v3" / "contracts" / "_wire-input-schemas.json.gz"
sys.path.insert(0, str(HERE))

import live  # noqa: E402
import run as registry_run  # noqa: E402


def _lookup(document: dict[str, Any], ref: str) -> Any:
    if not ref.startswith("#/"):
        raise ValueError(f"external schema reference is not self-contained: {ref}")
    current: Any = document
    for part in ref[2:].split("/"):
        current = current[part.replace("~1", "/").replace("~0", "~")]
    return current


def _refs(value: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        ref = value.get("$ref")
        if isinstance(ref, str):
            found.add(ref)
        for child in value.values():
            found.update(_refs(child))
    elif isinstance(value, list):
        for child in value:
            found.update(_refs(child))
    return found


def self_contained(schema: dict[str, Any], document: dict[str, Any]) -> dict[str, Any]:
    """Attach only definitions reachable from ``schema`` and their dependencies."""
    result = copy.deepcopy(schema)
    # Google request schemas arrive with their discovery definitions attached.
    source = copy.deepcopy(result) if "definitions" in result else document
    result.pop("definitions", None)
    result.pop("components", None)

    pending = list(_refs(result))
    seen: set[str] = set()
    definitions: dict[str, Any] = {}
    components: dict[str, Any] = {}
    while pending:
        ref = pending.pop()
        if ref in seen:
            continue
        seen.add(ref)
        target = copy.deepcopy(_lookup(source, ref))
        pending.extend(_refs(target) - seen)
        if ref.startswith("#/definitions/"):
            definitions[ref.rsplit("/", 1)[-1]] = target
        elif ref.startswith("#/components/schemas/"):
            components[ref.rsplit("/", 1)[-1]] = target
        else:
            raise ValueError(f"unsupported local request-schema reference: {ref}")
    if definitions:
        result["definitions"] = dict(sorted(definitions.items()))
    if components:
        result["components"] = {"schemas": dict(sorted(components.items()))}
    return result


def build() -> dict[str, Any]:
    registry = registry_run.load_json(registry_run.REGISTRY_PATH)
    manifest = registry_run.load_json(registry_run.SPEC_MANIFEST_PATH)
    rows, failures = registry_run.flatten_registry(registry)
    specs, spec_failures = registry_run.source_documents(manifest)
    failures.extend(spec_failures)
    if failures:
        raise ValueError("; ".join(failures))

    schemas: dict[str, Any] = {}
    for name, row in sorted(rows.items()):
        schema, _ = live.request_schema_for(row, registry["products"], specs)
        if schema is None:
            continue
        product = registry["products"][row["product"]]
        document = specs.get(product.get("source"))
        if not isinstance(document, dict):
            continue
        schemas[name] = live.normalize_schema(self_contained(schema, document))
    canonical_schemas = json.dumps(schemas, sort_keys=True, separators=(",", ":")).encode()
    return {
        "schema_version": 1,
        "specs_as_of": manifest.get("as_of"),
        "schema_digest": hashlib.sha256(canonical_schemas).hexdigest(),
        "tools": schemas,
    }


def canonical(value: Any) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def read_generated() -> bytes | None:
    if not OUT.is_file():
        return None
    with gzip.open(OUT, "rb") as handle:
        return handle.read()


def write_generated(payload: bytes) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as handle:
            handle.write(payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    document = build()
    payload = canonical(document)
    if args.write:
        write_generated(payload)
    elif read_generated() != payload:
        raise SystemExit(f"stale {OUT.relative_to(ROOT)}; run with --write")
    print(
        f"{len(document['tools'])} vendor input schemas; "
        f"digest {document['schema_digest'][:16]}"
    )


if __name__ == "__main__":
    main()
