from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from world.manifest.compile_assertions import compile_manifest, emit_vcode, evaluate
from world.manifest.normalization import equivalent, fact_variants, text_contains_fact
from world.manifest.render import render_manifest
from world.manifest.roundtrip import check_roundtrip


def sample_manifest(index: int = 1, extension: str = "txt") -> dict:
    return {
        "schema_version": 1,
        "manifest_id": f"golden-{index}",
        "seed": index,
        "task": {
            "instruction": "Read both source records, identify the planted conflict, and file the determination.",
            "deliverables": [f"memo-{index}.docx"],
            "workflow": ["documents_download", "documents_create"],
        },
        "facts": [
            {"id": "amount_email", "kind": "money", "value": 54_000_000,
             "variants": ["$54 million"], "required_in_output": True,
             "placements": [{"document": "email", "min_count": 1, "max_count": 1}]},
            {"id": "amount_schedule", "kind": "money", "value": 55_000_000,
             "required_in_output": True,
             "placements": [{"document": "schedule", "min_count": 1, "max_count": 1}]},
            {"id": "deadline", "kind": "date", "value": "2026-04-15",
             "required_in_output": True,
             "placements": [{"document": "email", "min_count": 1}]},
            {"id": "section", "kind": "section", "value": "7.2(b)",
             "required_in_output": True,
             "placements": [{"document": "schedule", "min_count": 1}]},
        ],
        "documents": [
            {"id": "email", "filename": f"email-{index}.{extension}", "title": "Instruction email",
             "sections": [{"heading": "Terms", "paragraphs": [
                 "The approved amount is {{fact:amount_email}} and the deadline is {{fact:deadline}}.",
                 "Ignore the superseded estimate of {{distractor:old_amount}}.",
             ]}]},
            {"id": "schedule", "filename": f"schedule-{index}.{'docx' if extension == 'docx' else extension}",
             "title": "Execution schedule", "sections": [{"heading": "Operative entry", "paragraphs": [
                 "Section {{fact:section}} records a conflicting amount of {{fact:amount_schedule}}.",
             ]}]},
        ],
        "planted_inconsistencies": [
            {"id": "amount_conflict", "left_fact": "amount_email", "right_fact": "amount_schedule"}
        ],
        "distractors": [
            {"id": "old_amount", "kind": "money", "value": 49_000_000, "documents": ["email"]}
        ],
        "determinations": [
            {"id": "report_conflict", "type": "grounded_values",
             "fact_ids": ["amount_email", "amount_schedule", "deadline", "section"], "veto": True}
        ],
        "absences": [
            {"id": "missing_approval", "label": "No board approval appears",
             "forbidden_values": ["BOARD-APPROVED-2026"]}
        ],
    }


class NormalizationTests(unittest.TestCase):
    def test_more_than_fifty_equivalences(self):
        groups = [
            ("money", 54_000_000, ["$54,000,000", "$54M", "54 million", "fifty-four million"]),
            ("money", 12_350_000_000, ["$12.35B", "12.35 billion", "$12,350,000,000"]),
            ("money", 125_000, ["$125K", "125 thousand", "$125,000"]),
            ("number", 1848, ["1,848", "one thousand eight hundred forty-eight"]),
            ("number", 3989, ["3,989", "three thousand nine hundred eighty-nine"]),
            ("number", 360, ["360", "three hundred sixty"]),
            ("percentage", 61, ["61%", "61", "sixty-one percent"]),
            ("percentage", 34.7, ["34.7%", "34.7"]),
            ("date", "2026-04-15", ["April 15, 2026", "Apr 15 2026", "4/15/2026", "2026/04/15"]),
            ("date", "2025-12-31", ["December 31, 2025", "Dec 31 2025", "12/31/2025"]),
            ("section", "7.2(b)", ["Section 7.2(b)", "§ 7.2(b)", "7.2(b)"]),
            ("section", "10.4", ["Section 10.4", "§10.4", "10.4"]),
            ("string", "Praxion Holdings", ["praxion holdings", "  Praxion   Holdings "]),
        ]
        cases = 0
        for kind, expected, variants in groups:
            for variant in variants:
                with self.subTest(kind=kind, expected=expected, variant=variant):
                    self.assertTrue(equivalent(expected, variant, kind))
                cases += 1
        # Symmetry doubles the mechanically exercised equivalence cases.
        for kind, expected, variants in groups:
            for variant in variants:
                self.assertTrue(equivalent(variant, expected, kind))
                cases += 1
        self.assertGreaterEqual(cases, 60)

    def test_numeric_boundaries_do_not_match_longer_distractor(self):
        fact = {"kind": "number", "value": 15}
        self.assertTrue(text_contains_fact("The deadline is 15 days.", fact))
        self.assertFalse(text_contains_fact("The deadline is 150 days.", fact))

    def test_variants_are_build_time_enumerated(self):
        variants = fact_variants({"kind": "money", "value": 54_000_000})
        self.assertIn("$54M", variants)
        self.assertIn("fifty-four million", variants)


class ManifestCompilerTests(unittest.TestCase):
    def test_three_golden_manifests_render_byte_identically(self):
        for index, extension in ((1, "txt"), (2, "md"), (3, "docx")):
            manifest = sample_manifest(index, extension)
            with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
                one = render_manifest(manifest, Path(first))
                two = render_manifest(manifest, Path(second))
                self.assertTrue(one["roundtrip"]["passed"])
                self.assertEqual(one["files"], two["files"])

    def test_corrupting_a_rendered_fact_fails_roundtrip(self):
        manifest = sample_manifest()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            render_manifest(manifest, root)
            path = root / "email-1.txt"
            path.write_text(path.read_text("utf-8").replace("54000000", "53000000"), "utf-8")
            report = check_roundtrip(manifest, root)
            self.assertFalse(report["passed"])
            self.assertIn("fact_roundtrip_failed", {failure["code"] for failure in report["failures"]})

    def test_distractor_answer_collision_is_rejected(self):
        manifest = sample_manifest()
        manifest["distractors"][0]["value"] = "$54M"
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            # Render first with a noncolliding manifest, then inspect against mutation.
            clean = sample_manifest()
            render_manifest(clean, root)
            report = check_roundtrip(manifest, root)
            self.assertIn("distractor_answer_collision", {failure["code"] for failure in report["failures"]})

    def test_non_distinct_planted_inconsistency_is_rejected(self):
        manifest = sample_manifest()
        manifest["facts"][1]["value"] = manifest["facts"][0]["value"]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            render_manifest(sample_manifest(), root)
            report = check_roundtrip(manifest, root)
            self.assertIn("planted_inconsistency_failed", {failure["code"] for failure in report["failures"]})

    def test_compiled_assertions_veto_corrupted_output(self):
        compiled = compile_manifest(sample_manifest())
        correct = "Conflict: $54M versus $55M. Deadline April 15, 2026 under Section 7.2(b)."
        wrong = "Conflict: $53M versus $55M. Deadline April 15, 2026 under Section 7.2(b)."
        self.assertTrue(evaluate(compiled, correct)["passed"])
        verdict = evaluate(compiled, wrong)
        self.assertFalse(verdict["passed"])
        self.assertEqual(verdict["reward"], 0.0)
        self.assertTrue(verdict["veto_failed"])

    def test_emitted_vcode_matches_native_evaluator(self):
        compiled = compile_manifest(sample_manifest())
        namespace: dict = {}
        exec(emit_vcode(compiled), namespace)
        results = namespace["verify_manifest_output"](
            "Conflict: $54M versus $55M. Deadline April 15, 2026 under Section 7.2(b).")
        self.assertTrue(results)
        self.assertTrue(all(result["passed"] for result in results))


if __name__ == "__main__":
    unittest.main()
