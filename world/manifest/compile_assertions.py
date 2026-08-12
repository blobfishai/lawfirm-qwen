#!/usr/bin/env python3
"""Compile a fact manifest into a pure-code, portable grading contract."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from world.manifest.normalization import VERSION, fact_variants, normalized_text
    from world.manifest.roundtrip import validate_manifest
else:
    from .normalization import VERSION, fact_variants, normalized_text
    from .roundtrip import validate_manifest


def compile_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    validate_manifest(manifest)
    facts = {fact["id"]: fact for fact in manifest["facts"]}
    assertions: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(row: dict[str, Any]) -> None:
        if row["id"] not in seen:
            seen.add(row["id"])
            assertions.append(row)

    for determination in manifest["determinations"]:
        veto = bool(determination.get("veto", True))
        for fact_id in determination.get("fact_ids", []):
            fact = facts[fact_id]
            add({"id": f"{determination['id']}__{fact_id}", "type": "any_anchor",
                 "anchors": fact_variants(fact), "fact_id": fact_id, "veto": veto})
        for index, anchors in enumerate(determination.get("anchor_sets", []), 1):
            add({"id": f"{determination['id']}__anchor_{index}", "type": "any_anchor",
                 "anchors": [str(anchor) for anchor in anchors], "veto": veto})
    for fact in manifest["facts"]:
        if fact.get("required_in_output"):
            add({"id": f"required_fact__{fact['id']}", "type": "any_anchor",
                 "anchors": fact_variants(fact), "fact_id": fact["id"], "veto": True})
    for absence in manifest.get("absences", []):
        values = [str(value) for value in absence.get("forbidden_values", [])]
        if values:
            add({"id": f"absence__{absence['id']}", "type": "no_anchor",
                 "anchors": values, "veto": True})
    canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    return {
        "schema_version": 1,
        "manifest_id": manifest["manifest_id"],
        "manifest_sha256": hashlib.sha256(canonical).hexdigest(),
        "normalization_version": VERSION,
        "assertions": assertions,
        "all_determinate_pass": True,
    }


def evaluate(compiled: dict[str, Any], deliverable_text: str) -> dict[str, Any]:
    haystack = normalized_text(deliverable_text)
    results = []
    for assertion in compiled["assertions"]:
        hits = []
        for anchor in assertion["anchors"]:
            needle = normalized_text(anchor)
            if needle and re.search(r"(?<![\w])" + re.escape(needle) + r"(?![\w])", haystack):
                hits.append(anchor)
        passed = bool(hits) if assertion["type"] == "any_anchor" else not hits
        results.append({"id": assertion["id"], "type": assertion["type"], "passed": passed,
                        "veto": assertion["veto"], "matched": hits})
    veto_failed = any(not result["passed"] and result["veto"] for result in results)
    passed_count = sum(result["passed"] for result in results)
    reward = 0.0 if veto_failed else (passed_count / len(results) if results else 0.0)
    return {"manifest_id": compiled["manifest_id"], "passed": bool(results) and passed_count == len(results),
            "reward": round(reward, 4), "veto_failed": veto_failed, "assertions": results}


def emit_vcode(compiled: dict[str, Any]) -> str:
    """Emit a dependency-free function suitable for embedding in shipped VCode."""
    # ``repr`` is intentional: shipped VCode is Python, so JSON's true/false
    # literals would not compile. Dict insertion order is fixed by the compiler.
    payload = repr(compiled["assertions"])
    return f'''\n_MANIFEST_ASSERTIONS = {payload}\n\ndef verify_manifest_output(deliverable_text):\n    import re as _re\n    import unicodedata as _unicodedata\n    def _norm_anchor(value):\n        value = _unicodedata.normalize("NFKC", str(value or "")).casefold()\n        value = value.replace("\\u00a0", " ").replace("–", "-").replace("—", "-")\n        value = _re.sub(r"[\\u2018\\u2019]", "'", value)\n        value = _re.sub(r"[\\u201c\\u201d]", '"', value)\n        return _re.sub(r"\\s+", " ", value).strip()\n    haystack = _norm_anchor(deliverable_text)\n    results = []\n    for assertion in _MANIFEST_ASSERTIONS:\n        hits = []\n        for anchor in assertion["anchors"]:\n            needle = _norm_anchor(anchor)\n            if needle and _re.search(r"(?<![\\w])" + _re.escape(needle) + r"(?![\\w])", haystack):\n                hits.append(anchor)\n        passed = bool(hits) if assertion["type"] == "any_anchor" else not hits\n        results.append({{"id": assertion["id"], "passed": passed, "veto": assertion["veto"], "matched": hits}})\n    return results\n'''


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--vcode", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text("utf-8"))
    compiled = compile_manifest(manifest)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(compiled, indent=2, sort_keys=True) + "\n", "utf-8")
    if args.vcode:
        args.vcode.parent.mkdir(parents=True, exist_ok=True)
        args.vcode.write_text(emit_vcode(compiled), "utf-8")
    print(f"{compiled['manifest_id']}: {len(compiled['assertions'])} deterministic assertions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
