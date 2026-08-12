from __future__ import annotations

import unittest

from world.port.lab_determinize import (
    compile_criterion,
    extract_candidates,
    mechanically_required_text,
    pass_clause,
)


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

    def test_generic_sections_word_is_not_a_section_citation(self):
        criterion = {
            "id": "C-002",
            "title": "Memo structure",
            "match_criteria": "PASS if the memo has sections covering all requested topics. FAIL if disorganized.",
        }
        compiled, reason = compile_criterion(criterion, self.evidence)
        self.assertIsNone(compiled)
        self.assertIn("no mechanically typed", reason)

    def test_title_only_value_is_not_silently_promoted(self):
        criterion = {
            "id": "C-010",
            "title": "Annual exposure delta of $4.78M",
            "match_criteria": "PASS if the analysis explains the exposure clearly. FAIL if omitted.",
        }
        compiled, _ = compile_criterion(criterion, self.evidence)
        self.assertIsNone(compiled)

    def test_section_requires_numeric_locator(self):
        values = {candidate.value for candidate in extract_candidates(
            "PASS if it cites sections and Section 7.2(b). FAIL if absent.")}
        self.assertEqual(values, {"Section 7.2(b)"})

    def test_source_substring_collision_does_not_ground_anchor(self):
        evidence = [{"file_id": "doc-2", "relative_path": "terms.docx",
                     "text": "The payment is $54MM, not the requested shorthand."}]
        criterion = {"id": "C-011", "title": "Payment",
                     "match_criteria": "PASS if the memo states $54M. FAIL otherwise."}
        compiled, _ = compile_criterion(criterion, evidence)
        self.assertIsNone(compiled)

    def test_alternative_or_range_logic_is_dropped_instead_of_overconstrained(self):
        criterion = {"id": "C-012", "title": "HHI",
                     "match_criteria": "PASS if HHI is 3,989 or within 3,900–4,100. FAIL otherwise."}
        evidence = [{"file_id": "doc-3", "relative_path": "hhi.docx",
                     "text": "HHI figures: 3,989, 3,900, and 4,100."}]
        compiled, reason = compile_criterion(criterion, evidence)
        self.assertIsNone(compiled)
        self.assertIn("alternative", reason)

    def test_explanatory_parenthetical_does_not_add_false_requirements(self):
        criterion = {"id": "C-013", "title": "Fee",
                     "match_criteria": "PASS if the fee is $160,000 (based on a $425M value between $161.5M and $500M). FAIL otherwise."}
        evidence = [{"file_id": "doc-4", "relative_path": "fee.docx",
                     "text": "The applicable filing fee is $160,000."}]
        compiled, reason = compile_criterion(criterion, evidence)
        self.assertEqual(reason, "")
        self.assertEqual([row["value"] for row in compiled["assertions"]], ["$160,000"])
        self.assertNotIn("$425M", mechanically_required_text(criterion["match_criteria"]))

    def test_comma_and_scaled_numbers_are_typed(self):
        values = {candidate.value for candidate in extract_candidates(
            "PASS if the memo states 14,200 employees and 3.2 million documents. FAIL otherwise.")}
        self.assertEqual(values, {"3.2 million", "14,200 employees"})


if __name__ == "__main__":
    unittest.main()
