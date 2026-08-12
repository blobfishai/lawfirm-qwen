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
COMPILER_VERSION = "3"
MIN_ANCHOR_CHARS = 4

GENERIC = {
    "high", "medium", "low", "yes", "no", "pass", "fail", "client", "agency",
    "agreement", "agreements", "memo", "memos", "redline", "redlines",
    "document", "documents", "section", "sections", "risk", "risks", "issue", "issues",
}
MONTH = r"(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)"
UNSUPPORTED_LOGIC = re.compile(
    r"\band/or\b|\beither\b|\bor\b|\bwithin\b|\bbetween\b|\bapprox(?:imately)?\b|"
    r"\bat\s+least\b|\bat\s+most\b|\bno\s+(?:more|less)\s+than\b|[<>]=?",
    flags=re.I,
)


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


def mechanically_required_text(match_criteria: str) -> str:
    """Return only mechanically conjunctive PASS text.

    Whitespace-prefixed parentheticals are explanatory in LAB criteria far
    more often than operative (for example, a fee followed by the transaction
    tier that explains it).  Attached legal locators such as ``7.2(b)`` stay.
    Alternative/range logic is rejected instead of being mistranslated into a
    stricter all-anchor requirement.
    """
    text = pass_clause(match_criteria)
    output: list[str] = []
    index = 0
    while index < len(text):
        if text[index] == "(" and index > 0 and text[index - 1].isspace():
            depth = 1
            index += 1
            while index < len(text) and depth:
                depth += text[index] == "("
                depth -= text[index] == ")"
                index += 1
            output.append(" ")
            continue
        output.append(text[index])
        index += 1
    return re.sub(r"\s+", " ", "".join(output)).strip()


def _spans(pattern: str, text: str, kind: str, source: str, group: int = 0) -> list[Candidate]:
    return [Candidate(kind, match.group(group).strip(" `\"'.,;:"), source)
            for match in re.finditer(pattern, text, flags=re.I)]


def extract_candidates(match_criteria: str, title: str = "") -> list[Candidate]:
    text = mechanically_required_text(match_criteria)
    found: list[Candidate] = []
    # Typed values are higher-signal than free prose and normalize reliably.
    found += _spans(
        r"[$€£]\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:trillion|billion|million|thousand|mm|bn|[kmbt]))?(?!\w)",
        text, "money", "money",
    )
    found += _spans(r"(?<![\w.])\d+(?:\.\d+)?\s*%", text, "percentage", "percentage")
    found += _spans(rf"\b{MONTH}\s+\d{{1,2}},?\s+\d{{4}}\b|\b\d{{4}}-\d{{2}}-\d{{2}}\b", text, "date", "date")
    # A section citation must contain a locator digit.  Without this guard the
    # regex can read the ordinary plural word "sections" as "Section s" and
    # manufacture a meaningless anchor that occurs throughout the evidence.
    found += _spans(
        r"(?:(?:Section|Sec\.?)\s+|§\s*)(?=[A-Za-z0-9.()\-]*\d)[A-Za-z0-9][A-Za-z0-9.()\-]*",
        text, "section", "section",
    )
    found += _spans(r"\b[A-Z]{1,8}-\d{2,}(?:\.\d+)?\b", text, "string", "identifier")
    found += _spans(r"\b[A-Z]{1,12}_\d{2,}(?:\.\d+)?\b", text, "string", "identifier")
    found += _spans(
        r"(?<![\w$€£,])\d{1,3}(?:,\d{3})+(?:\.\d+)?"
        r"(?!\s+(?:business\s+days?|calendar\s+days?|days?|months?|years?|basis\s+points?|"
        r"MSAs?|categories|acquisitions?|renewals?|arbitrators?|occurrences?|countries|states|"
        r"matters|documents|employees|markets|customers|parties|topics|changes|prongs|tiers)\b)(?!\w)",
        text, "number", "comma_number",
    )
    found += _spans(
        r"(?<![\w$€£])\d+(?:\.\d+)?\s*(?:trillion|billion|million|thousand)(?!\w)",
        text, "number", "scaled_number",
    )
    found += _spans(
        r"(?<![\w$€£,])\d[\d,]*(?:\.\d+)?\s+(?:business\s+days?|calendar\s+days?|days?|months?|years?|"
        r"basis\s+points?|MSAs?|categories|acquisitions?|renewals?|arbitrators?|occurrences?|"
        r"countries|states|matters|documents|employees|markets|customers|parties|topics|changes|prongs|tiers)\b",
        text, "string", "number_with_unit",
    )
    if not re.search(rf"\b{MONTH}\s+\d{{1,2}},?\s+\d{{4}}\b|\b\d{{4}}-\d{{2}}-\d{{2}}\b", text, flags=re.I):
        found += _spans(r"\b(?:19|20)\d{2}\b", text, "string", "year")
    # Quoted source language and defined terms are useful only when nontrivial.
    for match in re.finditer(r"[\"'‘’“”]([^\"'‘’“”]{4,160})[\"'‘’“”]", text):
        value = match.group(1).strip(" \t\r\n`\"'.,;:")
        if len(value.split()) >= 2 and normalized_text(value) not in GENERIC:
            found.append(Candidate("string", value, "quoted_phrase"))

    # Do not pull values from the title.  A qualitative PASS clause paired
    # with a numeric title is not itself a mechanically checkable criterion;
    # treating it as one silently changes the rubric's meaning.

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
                         # Cache grade-equivalent normalization once per file;
                         # doing it once per criterion makes the compile
                         # quadratic on long agreements.
                         "normalized": normalized_text(text)})
    return evidence


def source_hits(candidate: Candidate, evidence: list[dict[str, Any]]) -> list[dict[str, str]]:
    variants = fact_variants(candidate.fact())
    hits = []
    for document in evidence:
        search_text = document.get("normalized")
        if search_text is None:
            search_text = normalized_text(document.get("text", ""))
        # Source validation uses the same token boundaries as grade time.  A
        # value such as "$54M" must not be validated merely because "$54MM"
        # appears in a source.
        if _anchor_present_normalized(search_text, variants):
            hits.append({"file_id": document["file_id"], "relative_path": document["relative_path"]})
    return hits


def _anchor_present(text: str, anchors: Iterable[str]) -> bool:
    return _anchor_present_normalized(normalized_text(text), anchors)


def _anchor_present_normalized(haystack: str, anchors: Iterable[str]) -> bool:
    return any(
        needle and re.search(r"(?<![\w])" + re.escape(needle) + r"(?![\w])", haystack)
        for needle in (normalized_text(anchor) for anchor in anchors)
    )


def compile_criterion(criterion: dict[str, Any], evidence: list[dict[str, Any]]) -> tuple[dict | None, str]:
    required_text = mechanically_required_text(str(criterion.get("match_criteria") or ""))
    if UNSUPPORTED_LOGIC.search(required_text):
        return None, "unsupported alternative, approximation, or range logic"
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
    # Mechanical discrimination: source-grounded reference output passes and,
    # for every individual assertion, replacing just that assertion with a
    # type-compatible wrong value makes that assertion fail while the others
    # remain present.  This catches weak/sub-string anchors instead of merely
    # proving that an unrelated placeholder fails.
    reference = " | ".join(assertion["value"] for assertion in assertions)
    good_passes = all(_anchor_present(reference, assertion["variants"]) for assertion in assertions)
    corruption_checks = []
    for index, assertion in enumerate(assertions):
        corrupted_values = [row["value"] for row in assertions]
        corrupted_values[index] = {
            "money": "$987654321.09",
            "percentage": "98.765%",
            "date": "January 1, 1900",
            "section": "Section 9999.999(z)",
        }.get(assertion["kind"], f"CORRUPTED-ANCHOR-{index + 1}")
        corrupted = " | ".join(corrupted_values)
        target_failed = not _anchor_present(corrupted, assertion["variants"])
        other_survive = all(
            _anchor_present(corrupted, other["variants"])
            for other_index, other in enumerate(assertions) if other_index != index
        )
        corruption_checks.append(target_failed and other_survive)
    corrupt_fails = bool(corruption_checks) and all(corruption_checks)
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
            "admitted_criterion": (
                "conjunctive typed PASS-clause anchors occur in task evidence and each rejects isolated corruption"
            ),
            "unsupported_logic": "alternative, approximation, and range criteria are dropped, never over-constrained",
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
