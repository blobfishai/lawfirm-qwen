#!/usr/bin/env python3
"""Mechanically prove rendered evidence agrees with its source manifest."""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from world.manifest.normalization import canonical, fact_variants, normalized_text
else:
    from .normalization import canonical, fact_variants, normalized_text

WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class ManifestError(ValueError):
    """A build-time task contract is inconsistent or incomplete."""


def validate_manifest(manifest: dict[str, Any]) -> None:
    required = ("schema_version", "manifest_id", "task", "facts", "documents", "determinations")
    missing = [key for key in required if key not in manifest]
    if missing:
        raise ManifestError(f"missing required manifest keys: {missing}")
    if manifest["schema_version"] != 1:
        raise ManifestError(f"unsupported schema_version={manifest['schema_version']!r}")

    def indexed(items: list[dict[str, Any]], label: str) -> dict[str, dict[str, Any]]:
        ids = [str(item.get("id", "")) for item in items]
        if any(not item_id for item_id in ids):
            raise ManifestError(f"{label} contains an empty id")
        duplicates = sorted({item_id for item_id in ids if ids.count(item_id) > 1})
        if duplicates:
            raise ManifestError(f"duplicate {label} ids: {duplicates}")
        return dict(zip(ids, items))

    facts = indexed(manifest["facts"], "fact")
    documents = indexed(manifest["documents"], "document")
    indexed(manifest.get("distractors", []), "distractor")
    indexed(manifest.get("determinations", []), "determination")
    indexed(manifest.get("absences", []), "absence")
    indexed(manifest.get("planted_inconsistencies", []), "inconsistency")

    filenames = [doc.get("filename") for doc in documents.values()]
    if len(set(filenames)) != len(filenames):
        raise ManifestError("document filenames must be unique")
    for fact_id, fact in facts.items():
        if not fact.get("placements"):
            raise ManifestError(f"fact {fact_id} has no placements")
        for placement in fact["placements"]:
            if placement.get("document") not in documents:
                raise ManifestError(f"fact {fact_id} references unknown document {placement.get('document')}")
            if int(placement.get("min_count", 1)) < 1:
                raise ManifestError(f"fact {fact_id} placement min_count must be positive")
    for issue in manifest.get("planted_inconsistencies", []):
        for key in ("left_fact", "right_fact"):
            if issue.get(key) not in facts:
                raise ManifestError(f"inconsistency {issue['id']} references unknown {key}={issue.get(key)}")
    for determination in manifest["determinations"]:
        for fact_id in determination.get("fact_ids", []):
            if fact_id not in facts:
                raise ManifestError(f"determination {determination['id']} references unknown fact {fact_id}")


def extract_text(path: Path) -> str:
    suffix = path.suffix.casefold()
    if suffix in {".txt", ".md"}:
        return path.read_text("utf-8")
    if suffix != ".docx":
        raise ManifestError(f"unsupported rendered format: {path.name}")
    try:
        with zipfile.ZipFile(path) as archive:
            root = ET.fromstring(archive.read("word/document.xml"))
    except (KeyError, zipfile.BadZipFile, ET.ParseError) as exc:
        raise ManifestError(f"invalid DOCX {path.name}: {exc}") from exc
    paragraphs: list[str] = []
    for paragraph in root.iter(WORD_NS + "p"):
        paragraphs.append("".join(node.text or "" for node in paragraph.iter(WORD_NS + "t")))
    return "\n".join(paragraphs)


def _variant_count(text: str, fact: dict[str, Any]) -> int:
    haystack = normalized_text(text)
    counts = []
    for variant in fact_variants(fact):
        needle = normalized_text(variant)
        if needle:
            counts.append(len(re.findall(r"(?<![\w])" + re.escape(needle) + r"(?![\w])", haystack)))
    return max(counts, default=0)


def check_roundtrip(manifest: dict[str, Any], rendered_dir: Path) -> dict[str, Any]:
    validate_manifest(manifest)
    facts = {item["id"]: item for item in manifest["facts"]}
    documents = {item["id"]: item for item in manifest["documents"]}
    texts: dict[str, str] = {}
    failures: list[dict[str, Any]] = []

    for doc_id, document in documents.items():
        path = rendered_dir / document["filename"]
        if not path.is_file():
            failures.append({"code": "document_missing", "document": doc_id, "path": str(path)})
            continue
        try:
            texts[doc_id] = extract_text(path)
        except ManifestError as exc:
            failures.append({"code": "document_unreadable", "document": doc_id, "detail": str(exc)})

    fact_checks = []
    for fact_id, fact in facts.items():
        for placement in fact["placements"]:
            document = placement["document"]
            count = _variant_count(texts.get(document, ""), fact)
            minimum = int(placement.get("min_count", 1))
            maximum = placement.get("max_count")
            passed = count >= minimum and (maximum is None or count <= int(maximum))
            check = {"fact": fact_id, "document": document, "count": count,
                     "minimum": minimum, "maximum": maximum, "passed": passed}
            fact_checks.append(check)
            if not passed:
                failures.append({"code": "fact_roundtrip_failed", **check})

    answers = [(fact_id, fact) for fact_id, fact in facts.items() if fact.get("required_in_output")]
    collisions = []
    for distractor in manifest.get("distractors", []):
        for fact_id, fact in answers:
            if canonical(distractor.get("value"), distractor.get("kind", "string")) == canonical(
                    fact.get("value"), fact.get("kind", "string")):
                collision = {"distractor": distractor["id"], "fact": fact_id}
                collisions.append(collision)
                failures.append({"code": "distractor_answer_collision", **collision})

    inconsistency_checks = []
    for issue in manifest.get("planted_inconsistencies", []):
        left, right = facts[issue["left_fact"]], facts[issue["right_fact"]]
        distinct = canonical(left["value"], left["kind"]) != canonical(right["value"], right["kind"])
        placed = all(any(c["fact"] == fact_id and c["passed"] for c in fact_checks)
                     for fact_id in (issue["left_fact"], issue["right_fact"]))
        passed = distinct and placed
        row = {"id": issue["id"], "distinct": distinct, "both_present": placed, "passed": passed}
        inconsistency_checks.append(row)
        if not passed:
            failures.append({"code": "planted_inconsistency_failed", **row})

    evidence = normalized_text("\n".join(texts.values()))
    absence_checks = []
    for absence in manifest.get("absences", []):
        present = [str(value) for value in absence.get("forbidden_values", [])
                   if normalized_text(value) and normalized_text(value) in evidence]
        row = {"id": absence["id"], "unexpected_values": present, "passed": not present}
        absence_checks.append(row)
        if present:
            failures.append({"code": "declared_absence_present", **row})

    return {
        "manifest_id": manifest["manifest_id"],
        "passed": not failures,
        "documents": len(documents),
        "facts": len(facts),
        "fact_checks": fact_checks,
        "distractor_collisions": collisions,
        "inconsistencies": inconsistency_checks,
        "absences": absence_checks,
        "failures": failures,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("rendered_dir", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text("utf-8"))
    report = check_roundtrip(manifest, args.rendered_dir)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", "utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
