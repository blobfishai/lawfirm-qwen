#!/usr/bin/env python3
"""Fetch and verify the public machine-readable vendor contracts used in CI.

The checked-in snapshots make conformance runs offline and reproducible. Refreshing is
an explicit, reviewable operation: a caller supplies the snapshot date, and changed
content produces changed hashes in manifest.json.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]
SPEC_DIR = ROOT / "tools" / "conformance" / "specs"
MANIFEST_PATH = SPEC_DIR / "manifest.json"

SOURCES = {
    "clio-manage-v4": {
        "filename": "clio-manage-v4.openapi.json.gz",
        "kind": "openapi",
        "url": "https://docs.developers.clio.com/openapi.json",
    },
    "google-calendar-v3": {
        "filename": "google-calendar-v3.discovery.json.gz",
        "kind": "google-discovery",
        "url": "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
    },
    "google-drive-v3": {
        "filename": "google-drive-v3.discovery.json.gz",
        "kind": "google-discovery",
        "url": "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
    },
    "google-gmail-v1": {
        "filename": "google-gmail-v1.discovery.json.gz",
        "kind": "google-discovery",
        "url": "https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest",
    },
    "google-sheets-v4": {
        "filename": "google-sheets-v4.discovery.json.gz",
        "kind": "google-discovery",
        "url": "https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest",
    },
    "imanage-work-certified-connector": {
        "filename": "imanage-work-certified-connector.swagger.json.gz",
        "kind": "swagger",
        "url": (
            "https://raw.githubusercontent.com/microsoft/PowerPlatformConnectors/"
            "5b0e9156822fa0186bfa5d2b42c27472b2afe10e/"
            "certified-connectors/iManage%20Work/apiDefinition.swagger.json"
        ),
    },
}


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_source(name: str, source: dict[str, str], document: object) -> dict[str, str]:
    if not isinstance(document, dict):
        raise ValueError(f"{name}: root must be a JSON object")
    kind = source["kind"]
    if kind == "openapi" and not (document.get("openapi") or document.get("swagger")):
        raise ValueError(f"{name}: missing OpenAPI/Swagger version")
    if kind == "swagger" and not document.get("swagger"):
        raise ValueError(f"{name}: missing Swagger version")
    if kind == "google-discovery" and document.get("kind") != "discovery#restDescription":
        raise ValueError(f"{name}: not a Google discovery REST description")

    info = document.get("info") if isinstance(document.get("info"), dict) else {}
    return {
        "title": str(info.get("title") or document.get("title") or document.get("name") or name),
        "version": str(info.get("version") or document.get("version") or document.get("revision") or "unknown"),
    }


def fetch_json(url: str) -> object:
    # curl uses the host trust store consistently on macOS framework Python and in
    # GitHub's Ubuntu runner. Never disable certificate verification here.
    result = subprocess.run(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--proto",
            "=https",
            "--tlsv1.2",
            "--header",
            "Accept: application/json",
            "--user-agent",
            "legal-agent-simulation-conformance/1",
            url,
        ],
        check=False,
        capture_output=True,
    )
    if result.returncode:
        detail = result.stderr.decode(errors="replace").strip()
        raise RuntimeError(f"GET {url} failed via curl ({result.returncode}): {detail}")
    return json.loads(result.stdout)


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def refresh(as_of: str) -> None:
    entries: dict[str, dict[str, str | int]] = {}
    for name, source in SOURCES.items():
        document = fetch_json(source["url"])
        identity = validate_source(name, source, document)
        raw = canonical_json(document)
        compressed = gzip.compress(raw, compresslevel=9, mtime=0)
        path = SPEC_DIR / source["filename"]
        atomic_write(path, compressed)
        entries[name] = {
            "bytes_canonical": len(raw),
            "bytes_gzip": len(compressed),
            "filename": source["filename"],
            "kind": source["kind"],
            "sha256_canonical": sha256(raw),
            "sha256_gzip": sha256(compressed),
            "source_url": source["url"],
            **identity,
        }

    manifest = {
        "schema_version": 1,
        "as_of": as_of,
        "policy": "Offline CI uses these exact bytes; refreshes require a reviewed manifest diff.",
        "sources": entries,
    }
    atomic_write(MANIFEST_PATH, json.dumps(manifest, indent=2, sort_keys=True).encode() + b"\n")
    print(f"refreshed {len(entries)}/{len(SOURCES)} machine-readable specs as of {as_of}")


def check() -> None:
    if not MANIFEST_PATH.is_file():
        raise SystemExit(f"missing {MANIFEST_PATH.relative_to(ROOT)}; run with --refresh")
    manifest = json.loads(MANIFEST_PATH.read_text())
    entries = manifest.get("sources")
    if not isinstance(entries, dict):
        raise SystemExit("manifest sources must be an object")

    expected = set(SOURCES)
    actual = set(entries)
    if actual != expected:
        raise SystemExit(
            f"manifest source set drift: missing={sorted(expected - actual)} unknown={sorted(actual - expected)}"
        )

    failures: list[str] = []
    for name, source in SOURCES.items():
        entry = entries[name]
        if entry.get("source_url") != source["url"] or entry.get("kind") != source["kind"]:
            failures.append(f"{name}: source metadata drift")
            continue
        path = SPEC_DIR / source["filename"]
        if not path.is_file():
            failures.append(f"{name}: missing {path.relative_to(ROOT)}")
            continue
        compressed = path.read_bytes()
        if sha256(compressed) != entry.get("sha256_gzip"):
            failures.append(f"{name}: gzip checksum mismatch")
            continue
        try:
            raw = gzip.decompress(compressed)
            document = json.loads(raw)
            validate_source(name, source, document)
        except Exception as exc:  # report all corrupt snapshots in one run
            failures.append(f"{name}: invalid snapshot: {exc}")
            continue
        if sha256(raw) != entry.get("sha256_canonical"):
            failures.append(f"{name}: canonical checksum mismatch")
        if len(raw) != entry.get("bytes_canonical") or len(compressed) != entry.get("bytes_gzip"):
            failures.append(f"{name}: byte-count mismatch")

    if failures:
        raise SystemExit("spec snapshot check failed:\n- " + "\n- ".join(failures))
    print(f"{len(entries)}/{len(SOURCES)} machine-readable spec snapshots verified")


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--refresh", action="store_true", help="download and replace all snapshots")
    mode.add_argument("--check", action="store_true", help="verify committed snapshots (default)")
    parser.add_argument("--as-of", help="ISO date recorded for a refresh")
    args = parser.parse_args()

    if args.refresh:
        if not args.as_of:
            parser.error("--refresh requires --as-of YYYY-MM-DD")
        refresh(args.as_of)
    else:
        check()


if __name__ == "__main__":
    main()
