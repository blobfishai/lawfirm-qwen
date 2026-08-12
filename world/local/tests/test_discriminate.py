from __future__ import annotations

import pathlib
import sys
import unittest
import base64


LOCAL = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LOCAL))

import discriminate  # noqa: E402


class WrongValueMutationTests(unittest.TestCase):
    def test_vendor_body_is_corrupted_but_top_level_target_is_preserved(self) -> None:
        args = {
            "id": 5,
            "body": {
                "data": {
                    "activity_description": {"utbms_task_id": "L120"},
                    "matter": {"id": 10},
                }
            },
        }

        changed = discriminate.corrupt(args)

        self.assertEqual(changed["id"], 5)
        self.assertNotEqual(
            changed["body"]["data"]["activity_description"]["utbms_task_id"],
            "L120",
        )
        self.assertNotEqual(changed["body"]["data"]["matter"]["id"], 10)

    def test_camel_case_top_level_selector_is_preserved(self) -> None:
        args = {"documentId": "LEGAL!5.1", "file": "correct body"}

        changed = discriminate.corrupt(args)

        self.assertEqual(changed["documentId"], "LEGAL!5.1")
        self.assertNotEqual(changed["file"], "correct body")

    def test_gmail_raw_remains_decodable_and_changes_subject(self) -> None:
        message = "From: a@example.test\r\nTo: b@example.test\r\nSubject: Correct\r\n\r\nBody"
        raw = base64.urlsafe_b64encode(message.encode()).decode().rstrip("=")

        changed = discriminate.corrupt({"body": {"raw": raw}})
        encoded = changed["body"]["raw"]
        decoded = base64.urlsafe_b64decode(
            (encoded + "=" * (-len(encoded) % 4)).encode()
        ).decode()

        self.assertIn("Subject: Correct XX-WRONG", decoded)

    def test_numeric_mutation_preserves_wire_type(self) -> None:
        changed = discriminate.corrupt({"alert_type": 1, "quantity": 1.5})

        self.assertIsInstance(changed["alert_type"], int)
        self.assertIsInstance(changed["quantity"], float)


if __name__ == "__main__":
    unittest.main()
