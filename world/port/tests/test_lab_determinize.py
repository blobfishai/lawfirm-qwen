from __future__ import annotations

import unittest
import sqlite3
from pathlib import Path

from world.port.lab_determinize import (
    Candidate,
    EvidenceList,
    SQLiteEvidence,
    candidate_variants,
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
        self.assertNotIn("FAIL", pass_clause("PASS if 12%. FAIL otherwise."))

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
        self.assertTrue(all(len(row["source_files"]) == 1 for row in compiled["assertions"]))

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
        self.assertIn("range", reason)

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

    def test_money_decimal_tail_is_not_a_second_scaled_number(self):
        candidates = extract_candidates(
            "PASS if the memo states $7.2 million in synergies. FAIL otherwise.")
        self.assertEqual([(row.kind, row.value) for row in candidates], [("money", "$7.2 million")])

    def test_explicit_alternatives_compile_as_one_any_of_group(self):
        criterion = {
            "id": "C-014",
            "title": "Accept either hot-document quotation",
            "match_criteria": (
                "PASS if the memo quotes 'stop the pricing war in Baton Rouge' and/or "
                "'positioned to lead on price'. FAIL otherwise."
            ),
        }
        evidence = [{"file_id": "doc-5", "relative_path": "email.eml",
                     "text": "We should stop the pricing war in Baton Rouge and be positioned to lead on price."}]
        compiled, reason = compile_criterion(criterion, evidence)
        self.assertEqual(reason, "")
        self.assertEqual(len(compiled["assertions"]), 1)
        self.assertEqual(compiled["assertions"][0]["logic"], "any_source_grounded_alternative")
        self.assertEqual(len(compiled["assertions"][0]["alternatives"]), 2)

    def test_conjunction_before_or_keeps_prior_fact_load_bearing(self):
        criterion = {
            "id": "C-015",
            "title": "Dated hot document",
            "match_criteria": (
                "PASS if the memo identifies the email dated April 15, 2026 and references or quotes "
                "'stop the pricing war in Baton Rouge'. FAIL otherwise."
            ),
        }
        compiled, reason = compile_criterion(criterion, self.evidence)
        self.assertEqual(reason, "")
        self.assertEqual(len(compiled["assertions"]), 2)

    def test_source_grounded_proper_names_are_determinate(self):
        criterion = {
            "id": "C-016",
            "title": "Memo header",
            "match_criteria": (
                "PASS if the memo is addressed to Priya Chakravarti and from Samuel Roth, "
                "both at Ashford, Kendrick & Hale LLP. FAIL otherwise."
            ),
        }
        evidence = [{"file_id": "doc-6", "relative_path": "instructions.docx",
                     "text": "To: Priya Chakravarti\nFrom: Samuel Roth\nAshford, Kendrick & Hale LLP"}]
        compiled, reason = compile_criterion(criterion, evidence)
        self.assertEqual(reason, "")
        values = {row["value"] for row in compiled["assertions"]}
        self.assertTrue({"Priya Chakravarti", "Samuel Roth"} <= values)

    def test_fractional_scaled_money_variants_are_committed(self):
        candidate = Candidate("money", "$7.2M", "money", 0, 5)
        self.assertIn("$7.2 million", candidate_variants(candidate))

    def test_inverted_evidence_index_preserves_boundary_matching(self):
        evidence = EvidenceList([
            {"file_id": "doc-a", "relative_path": "a.docx", "normalized": "payment is $54mm"},
            {"file_id": "doc-b", "relative_path": "b.docx", "normalized": "payment is $54m"},
        ])
        criterion = {"id": "C-017", "title": "Payment",
                     "match_criteria": "PASS if payment is $54M. FAIL otherwise."}
        compiled, reason = compile_criterion(criterion, evidence)
        self.assertEqual(reason, "")
        self.assertEqual(compiled["assertions"][0]["source_files"][0]["file_id"], "doc-b")

    def test_decimal_tail_does_not_satisfy_shorter_numeric_anchor(self):
        evidence = [{"file_id": "doc-c", "relative_path": "c.docx",
                     "text": "The only exposure is $7.5M."}]
        criterion = {"id": "C-018", "title": "Headroom",
                     "match_criteria": "PASS if headroom is $5M. FAIL otherwise."}
        compiled, _ = compile_criterion(criterion, evidence)
        self.assertIsNone(compiled)

    def test_shorter_name_is_pruned_when_longer_name_is_grounded(self):
        evidence = [{"file_id": "doc-d", "relative_path": "d.docx",
                     "text": "The Depository Bank's security interest is senior."}]
        criterion = {"id": "C-019", "title": "Priority",
                     "match_criteria": ("PASS if the Depository Bank's security interest ranks ahead of "
                                        "the Depository Bank claim. FAIL otherwise.")}
        compiled, reason = compile_criterion(criterion, evidence)
        self.assertEqual(reason, "")
        self.assertEqual([row["value"] for row in compiled["assertions"]], ["Depository Bank's"])

    def test_percentage_does_not_accept_bare_number_from_money_threshold(self):
        evidence = [{"file_id": "doc-e", "relative_path": "e.docx",
                     "text": "The rebate is 2% above $2 million annual purchases."}]
        criterion = {"id": "C-020", "title": "Rebate",
                     "match_criteria": ("PASS if the rebate is 2% on purchases above $2 million. "
                                        "FAIL otherwise.")}
        compiled, reason = compile_criterion(criterion, evidence)
        self.assertEqual(reason, "")
        percent = next(row for row in compiled["assertions"] if row["kind"] == "percentage")
        self.assertEqual(percent["variants"], ["2%"])
        self.assertTrue(compiled["discrimination"]["corrupted_fails"])

    def test_comma_tail_does_not_satisfy_smaller_money_anchor(self):
        evidence = [{"file_id": "doc-f", "relative_path": "f.docx",
                     "text": "The cap is $7,500,000."}]
        criterion = {"id": "C-021", "title": "Excess",
                     "match_criteria": "PASS if excess is $500,000. FAIL otherwise."}
        compiled, _ = compile_criterion(criterion, evidence)
        self.assertIsNone(compiled)

    def test_sqlite_evidence_lookup_validates_fts_hit_exactly(self):
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        connection.executescript("""
          CREATE TABLE blobs(sha256 TEXT PRIMARY KEY,text_path TEXT,parse_status TEXT);
          CREATE TABLE files(file_id TEXT,task_id TEXT,ordinal INTEGER,relative_path TEXT,blob_sha256 TEXT);
          CREATE VIRTUAL TABLE blobs_fts USING fts5(sha256 UNINDEXED,content,tokenize='unicode61');
        """)
        connection.execute("INSERT INTO blobs VALUES ('a',NULL,'parsed')")
        connection.execute("INSERT INTO files VALUES ('doc-a','task',0,'source.docx','a')")
        connection.execute("INSERT INTO blobs_fts VALUES ('a','The approved threshold is $54M, not $54MM.')")
        evidence = SQLiteEvidence(connection, Path("."), "task", 1)
        criterion = {"id": "C-022", "title": "Threshold",
                     "match_criteria": "PASS if the threshold is $54M. FAIL otherwise."}
        compiled, reason = compile_criterion(criterion, evidence)
        connection.close()
        self.assertEqual(reason, "")
        self.assertEqual(compiled["assertions"][0]["source_files"][0]["file_id"], "doc-a")


if __name__ == "__main__":
    unittest.main()
