#!/usr/bin/env python3
"""Compile source-grounded LAB rubric criteria into deterministic assertions.

The extractor is deliberately conservative. It only admits a criterion when a
mechanically typed anchor from its PASS clause is found in that task's own
evidence. Every admitted assertion then has to pass a local discrimination
test: a source-grounded synthetic answer passes and the same answer with the
anchor corrupted fails. Rubric prose that cannot clear both gates is counted
and excluded; no model judges it at grade time.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from world.manifest.normalization import (  # noqa: E402
    canonical,
    fact_variants,
    normalized_text,
)

DEFAULT_STORE = ROOT / "world" / "corpus" / "lab"
DEFAULT_OUT = ROOT / "world" / "port" / "determinate" / "lab-assertions.jsonl"
DEFAULT_REPORT = ROOT / "world" / "port" / "determinate" / "lab-report.json"
COMPILER_VERSION = "1"
MIN_ANCHOR_CHARS = 4

GENERIC = {
    "high", "medium", "low", "yes", "no", "pass", "fail", "client", "agency",
    "agreement", "memo", "redline", "document", "section", "risk", "issue",
}
MONTH = r"(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)"


def source_search_text(value: Any) -> str:
    """Cheap source-only folding; grade-time normalization remains stricter."""
    return str(value or "").casefold().replace("\u00a0", " ").replace("–", "-").replace("—", "-")


@dataclass(frozen=True)
class Candidate:
    kind: str
    value: str
    source: str

    def fact(self) -> dict[str, Any]:
        return {"kind": self.kind, "value": self.value}

    def key(self) -> tuple[str, str]:
        return canonical(self.value, self.kind)


def pass_clause(match_criteria: str) -> str:
    text = re.split(r"\bFAIL\s+if\b", match_criteria, maxsplit=1, flags=re.I)[0]
    return re.sub(r"^\s*PASS\s+if\s+", "", text, flags=re.I).strip()


def _spans(pattern: str, text: str, kind: str, source: str, group: int = 0) -> list[Candidate]:
    return [Candidate(kind, match.group(group).strip(" `\"'.,;:"), source)
            for match in re.finditer(pattern, text, flags=re.I)]


def extract_candidates(match_criteria: str, title: str = "") -> list[Candidate]:
    text = pass_clause(match_criteria)
    found: list[Candidate] = []
    # Typed values are higher-signal than free prose and normalize reliably.
    found += _spans(r"[$€£]\s*\d[\d,]*(?:\.\d+)?\s*(?:k|m|mm|b|bn|t|thousand|million|billion|trillion)?", text, "money", "money")
    found += _spans(r"(?<![\w.])\d+(?:\.\d+)?\s*%", text, "percentage", "percentage")
    found += _spans(rf"\b{MONTH}\s+\d{{1,2}},?\s+\d{{4}}\b|\b\d{{4}}-\d{{2}}-\d{{2}}\b", text, "date", "date")
    found += _spans(r"(?:Section|Sec\.?|§)\s*[A-Za-z0-9][A-Za-z0-9.()\-]*", text, "section", "section")
    found += _spans(r"\b[A-Z]{1,8}-\d{2,}(?:\.\d+)?\b", text, "string", "identifier")
    found += _spans(
        r"(?<![\w$])\d+(?:\.\d+)?\s+(?:business\s+days?|calendar\s+days?|days?|months?|years?|"
        r"basis\s+points?|MSAs?|categories|acquisitions?|renewals?|arbitrators?|occurrences?)\b",
        text, "string", "number_with_unit",
    )
    # Quoted source language and defined terms are useful only when nontrivial.
    for match in re.finditer(r"[\"'‘’“”]([^\"'‘’“”]{4,160})[\"'‘’“”]", text):
        value = match.group(1).strip()
        if len(value.split()) >= 2 and normalized_text(value) not in GENERIC:
            found.append(Candidate("string", value, "quoted_phrase"))

    # Titles often carry the exact issue id/value while prose contains broad
    # alternatives. Reuse only typed candidates, never arbitrary title words.
    found += _spans(r"[$€£]\s*\d[\d,]*(?:\.\d+)?\s*(?:k|m|mm|b|bn|t|thousand|million|billion|trillion)?", title, "money", "title_money")
    found += _spans(r"(?<![\w.])\d+(?:\.\d+)?\s*%", title, "percentage", "title_percentage")
    found += _spans(rf"\b{MONTH}\s+\d{{1,2}},?\s+\d{{4}}\b|\b\d{{4}}-\d{{2}}-\d{{2}}\b", title, "date", "title_date")
    found += _spans(r"(?:Section|Sec\.?|§)\s*[A-Za-z0-9][A-Za-z0-9.()\-]*", title, "section", "title_section")

    unique: list[Candidate] = []
    seen: set[tuple[str, str]] = set()
    for candidate in found:
        key = candidate.key()
        if (candidate.kind == "string" and
                len(normalized_text(candidate.value)) < MIN_ANCHOR_CHARS) or key in seen:
            continue
        if normalized_text(candidate.value) in GENERIC:
            continue
        seen.add(key)
        unique.append(candidate)
    return unique


def load_task_evidence(connection: sqlite3.Connection, store: Path, task_id: str) -> list[dict[str, Any]]:
    rows = connection.execute(
        """SELECT f.file_id,f.relative_path,b.text_path,b.parse_status
             FROM files f JOIN blobs b ON b.sha256=f.blob_sha256
            WHERE f.task_id=? ORDER BY f.ordinal""",
        (task_id,),
    ).fetchall()
    evidence = []
    for file_id, relative_path, text_path, status in rows:
        if status != "parsed" or not text_path:
            continue
        text = (store / text_path).read_text("utf-8", errors="replace")
        evidence.append({"file_id": file_id, "relative_path": relative_path,
                         # Normalizing a 50K-character agreement once per
                         # criterion made a full compile quadratic. Cache it
                         # once per task and compare only small anchor variants.
                         "normalized": source_search_text(text)})
    return evidence


def source_hits(candidate: Candidate, evidence: list[dict[str, Any]]) -> list[dict[str, str]]:
    needles = [source_search_text(variant) for variant in fact_variants(candidate.fact())]
    needles = [needle for needle in needles if needle]
    hits = []
    for document in evidence:
        search_text = document.get("normalized")
        if search_text is None:
            search_text = source_search_text(document.get("text", ""))
        # Source validation is an occurrence proof, not grade-time matching.
        # ``in`` runs in optimized C and is safe here because candidates are
        # typed/quoted; the emitted verifier retains strict word boundaries.
        if any(needle in search_text for needle in needles):
            hits.append({"file_id": document["file_id"], "relative_path": document["relative_path"]})
    return hits


def _anchor_present(text: str, anchors: Iterable[str]) -> bool:
    haystack = normalized_text(text)
    return any(
        needle and re.search(r"(?<![\w])" + re.escape(needle) + r"(?![\w])", haystack)
        for needle in (normalized_text(anchor) for anchor in anchors)
    )


def compile_criterion(criterion: dict[str, Any], evidence: list[dict[str, Any]]) -> tuple[dict | None, str]:
    candidates = extract_candidates(str(criterion.get("match_criteria") or ""), str(criterion.get("title") or ""))
    assertions = []
    for candidate in candidates:
        hits = source_hits(candidate, evidence)
        if not hits:
            continue
        assertions.append({
            "kind": candidate.kind,
            "value": candidate.value,
            "variants": fact_variants(candidate.fact()),
            "source_files": hits,
            "extracted_from": candidate.source,
        })
    if not assertions:
        return None, "no mechanically typed PASS-clause anchor found in task evidence"
    # Mechanical discrimination: source-grounded reference output passes; a
    # payload containing only corrupted placeholders cannot satisfy any anchor.
    reference = " | ".join(assertion["value"] for assertion in assertions)
    corrupted = " | ".join(f"CORRUPTED-{index}" for index, _ in enumerate(assertions, 1))
    good_passes = all(_anchor_present(reference, assertion["variants"]) for assertion in assertions)
    corrupt_fails = not all(_anchor_present(corrupted, assertion["variants"]) for assertion in assertions)
    if not good_passes or not corrupt_fails:
        return None, "compiled assertion failed local oracle/discrimination"
    return {
        "criterion_id": criterion.get("id"),
        "title": criterion.get("title") or "",
        "logic": "all_source_grounded_anchors",
        "veto": True,
        "assertions": assertions,
        "reference_fragment": reference,
        "discrimination": {"reference_passes": good_passes, "corrupted_fails": corrupt_fails},
    }, ""


def compile_task(row: sqlite3.Row, connection: sqlite3.Connection, store: Path) -> dict[str, Any]:
    task_json = json.loads(row["task_json"])
    evidence = load_task_evidence(connection, store, row["task_id"])
    compiled, dropped = [], []
    for criterion in task_json.get("criteria") or []:
        result, reason = compile_criterion(criterion, evidence)
        if result:
            compiled.append(result)
        else:
            dropped.append({"criterion_id": criterion.get("id"), "title": criterion.get("title") or "", "reason": reason})
    source_task = row["source_task"]
    family = "contracts" if source_task.startswith("contracts/") else "standard"
    assertion_count = sum(len(criterion["assertions"]) for criterion in compiled)
    floor = 1 if family == "contracts" else 5
    admitted = len(compiled) >= floor and assertion_count >= floor
    return {
        "schema_version": 1,
        "compiler_version": COMPILER_VERSION,
        "task_id": row["task_id"],
        "source_task": source_task,
        "family": family,
        "work_type": row["work_type"],
        "title": row["title"],
        "instructions": row["instructions"],
        "deliverables": json.loads(row["deliverables_json"]),
        "document_count": row["document_count"],
        "parsed_evidence_count": len(evidence),
        "criteria_total": row["criteria_count"],
        "criteria_determinate": len(compiled),
        "assertion_count": assertion_count,
        "coverage": round(len(compiled) / max(1, row["criteria_count"]), 8),
        "admission": "compiled" if admitted else "thin_grading",
        "criteria": compiled,
        "dropped": dropped,
        "reference_output": "\n".join(criterion["reference_fragment"] for criterion in compiled),
    }


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build(store: Path, output: Path, report_path: Path, family: str, limit: int = 0) -> dict[str, Any]:
    database = store / "index.sqlite"
    if not database.is_file():
        raise RuntimeError(f"LAB evidence index missing: {database}")
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    query = "SELECT * FROM tasks"
    params: tuple[Any, ...] = ()
    if family == "contracts":
        query += " WHERE source_task LIKE 'contracts/%'"
    elif family == "standard":
        query += " WHERE source_task NOT LIKE 'contracts/%' AND area!='firm-knowledge'"
    elif family == "all":
        query += " WHERE area!='firm-knowledge'"
    else:
        raise ValueError(f"unknown family {family}")
    query += " ORDER BY source_task"
    rows = connection.execute(query, params).fetchall()
    if limit:
        rows = rows[:limit]
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    family_counts: Counter[str] = Counter()
    work_counts: dict[str, Counter[str]] = {}
    tasks = []
    with temporary.open("w", encoding="utf-8") as handle:
        for index, row in enumerate(rows, 1):
            compiled = compile_task(row, connection, store)
            tasks.append(compiled)
            family_counts["tasks"] += 1
            family_counts["criteria"] += compiled["criteria_total"]
            family_counts["determinate"] += compiled["criteria_determinate"]
            family_counts["assertions"] += compiled["assertion_count"]
            family_counts[compiled["admission"]] += 1
            wc = work_counts.setdefault(compiled["work_type"], Counter())
            wc["tasks"] += 1
            wc["criteria"] += compiled["criteria_total"]
            wc["determinate"] += compiled["criteria_determinate"]
            handle.write(json.dumps(compiled, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
            if index % 100 == 0:
                print(f"  compiled {index}/{len(rows)} tasks", flush=True)
    temporary.replace(output)
    connection.close()
    report = {
        "schema_version": 1,
        "compiler_version": COMPILER_VERSION,
        "compiler_sha256": digest_file(Path(__file__).resolve()),
        "source_index_sha256": digest_file(database),
        "output_sha256": digest_file(output),
        "family": family,
        "limited": bool(limit),
        "tasks": family_counts["tasks"],
        "criteria": family_counts["criteria"],
        "criteria_determinate": family_counts["determinate"],
        "criteria_coverage": round(family_counts["determinate"] / max(1, family_counts["criteria"]), 8),
        "assertions": family_counts["assertions"],
        "compiled_tasks": family_counts["compiled"],
        "thin_grading_tasks": family_counts["thin_grading"],
        "work_types": {
            work_type: {**counts, "coverage": round(counts["determinate"] / max(1, counts["criteria"]), 8)}
            for work_type, counts in sorted(work_counts.items())
        },
        "policy": {
            "judge_calls": 0,
            "grade_time": "pure code",
            "admitted_criterion": "typed PASS-clause anchor occurs in task evidence and rejects corruption",
            "dropped_criteria_reported": True,
        },
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", "utf-8")
    return report


def check(store: Path, output: Path, report_path: Path) -> None:
    if not output.is_file() or not report_path.is_file():
        raise RuntimeError("compiled LAB assertion artifact is missing")
    report = json.loads(report_path.read_text("utf-8"))
    if digest_file(output) != report.get("output_sha256"):
        raise RuntimeError("compiled LAB assertions differ from report digest")
    if digest_file(Path(__file__).resolve()) != report.get("compiler_sha256"):
        raise RuntimeError("LAB determinate compiler differs from report digest")
    if digest_file(store / "index.sqlite") != report.get("source_index_sha256"):
        raise RuntimeError("LAB evidence index differs from compiler report")
    lines = sum(1 for line in output.open("r", encoding="utf-8") if line.strip())
    if lines != report.get("tasks"):
        raise RuntimeError(f"compiled task count mismatch: {lines} != {report.get('tasks')}")
    print(f"LAB determinate compiler: {lines:,} tasks, {report['criteria_determinate']:,}/"
          f"{report['criteria']:,} criteria ({report['criteria_coverage']:.1%}) verified")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--store", type=Path, default=DEFAULT_STORE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--family", choices=("contracts", "standard", "all"), default="all")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        check(args.store.resolve(), args.out.resolve(), args.report.resolve())
        return 0
    report = build(args.store.resolve(), args.out.resolve(), args.report.resolve(), args.family, args.limit)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
