from __future__ import annotations

import unittest

from world.port.lab_determinize import compile_criterion, extract_candidates, pass_clause


class LabDeterminateExtractorTests(unittest.TestCase):
    def setUp(self):
        self.evidence = [{
            "file_id": "doc-1",
            "relative_path": "playbook.docx",
            "text": (
                "The draft commission is 12% on gross spend. The approved ceiling is 7.5% on net spend. "
                "Annual exposure is $4.78M. Section 7.2(b) controls. The deadline is April 15, 2026. "
                "The email says stop the pricing war in Baton Rouge."
            ),
        }]

    def test_only_pass_clause_is_considered(self):
        source = "PASS if the memo states 12% and $4.78M. FAIL if it states $99M."
        values = {candidate.value for candidate in extract_candidates(source)}
        self.assertIn("12%", values)
        self.assertIn("$4.78M", values)
        self.assertNotIn("$99M", values)
        self.assertNotIn("FAIL", pass_clause(source))

    def test_source_grounded_values_compile(self):
        criterion = {
            "id": "C-004",
            "title": "Annual exposure delta of ~$4.78M/year",
            "match_criteria": "PASS if the memo states 12%, 7.5%, and $4.78M. FAIL if absent.",
        }
        compiled, reason = compile_criterion(criterion, self.evidence)
        self.assertEqual(reason, "")
        self.assertIsNotNone(compiled)
        self.assertEqual({row["value"] for row in compiled["assertions"]}, {"12%", "7.5%", "$4.78M"})
        self.assertTrue(compiled["discrimination"]["reference_passes"])
        self.assertTrue(compiled["discrimination"]["corrupted_fails"])

    def test_unsupported_value_is_dropped_not_hallucinated(self):
        criterion = {
            "id": "C-999",
            "title": "Unsupported amount",
            "match_criteria": "PASS if the memo states $99M. FAIL otherwise.",
        }
        compiled, reason = compile_criterion(criterion, self.evidence)
        self.assertIsNone(compiled)
        self.assertIn("task evidence", reason)

    def test_quoted_source_language_compiles(self):
        criterion = {
            "id": "C-003",
            "title": "Hot document",
            "match_criteria": "PASS if the memo flags the phrase 'stop the pricing war in Baton Rouge'. FAIL if omitted.",
        }
        compiled, _ = compile_criterion(criterion, self.evidence)
        self.assertEqual(compiled["assertions"][0]["value"], "stop the pricing war in Baton Rouge")


if __name__ == "__main__":
    unittest.main()
