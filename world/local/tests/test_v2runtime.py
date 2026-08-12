from __future__ import annotations

import pathlib
import sys
import unittest


LOCAL = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LOCAL))

from v2runtime import _wire_type_error  # noqa: E402


class WireTypeValidationTests(unittest.TestCase):
    def test_invalid_integer_is_rejected_before_dispatch(self) -> None:
        tool = {"params": {"alert_type": "integer"}}

        self.assertIsNone(_wire_type_error(tool, {"alert_type": 1}))
        self.assertIn("expected integer", _wire_type_error(tool, {"alert_type": "entry"}))
        self.assertIn("expected integer", _wire_type_error(tool, {"alert_type": True}))

    def test_enum_is_fail_closed(self) -> None:
        tool = {"params": {"state": {"type": "string", "enum": ["draft", "sent"]}}}

        self.assertIsNone(_wire_type_error(tool, {"state": "sent"}))
        self.assertIn("unsupported value", _wire_type_error(tool, {"state": "unknown"}))


if __name__ == "__main__":
    unittest.main()
