from __future__ import annotations

import unittest
from datetime import datetime, timezone

from api.core import (
    RAW_CHAT_LIMIT,
    content_hash,
    fallback_title,
    parse_cleanup_output,
    require_client_id,
    truncate_raw_chat,
    validate_raw_chat,
)


class CoreTests(unittest.TestCase):
    def test_missing_client_id_rejected(self) -> None:
        with self.assertRaises(ValueError):
            require_client_id("")

    def test_empty_raw_chat_rejected(self) -> None:
        with self.assertRaises(ValueError):
            validate_raw_chat("  ")

    def test_parse_title_line(self) -> None:
        title, content = parse_cleanup_output(
            "Title: Landing Page Positioning\n\nProject goal:\nShip page"
        )
        self.assertEqual(title, "Landing Page Positioning")
        self.assertEqual(content, "Project goal:\nShip page")

    def test_parse_fallback_title(self) -> None:
        title, content = parse_cleanup_output("Project goal:\nShip page")
        self.assertTrue(title.startswith("Context - "))
        self.assertEqual(content, "Project goal:\nShip page")

    def test_fallback_title_date(self) -> None:
        now = datetime(2026, 5, 19, tzinfo=timezone.utc)
        self.assertEqual(fallback_title(now), "Context - May 19")

    def test_truncate_raw_chat_head_tail(self) -> None:
        raw = "A" * (RAW_CHAT_LIMIT + 100)
        retained, truncated = truncate_raw_chat(raw)
        self.assertTrue(truncated)
        self.assertIn("middle of this chat was omitted", retained)
        self.assertTrue(retained.startswith("A" * 100))
        self.assertTrue(retained.endswith("A" * 100))

    def test_hash_stable(self) -> None:
        self.assertEqual(content_hash("x"), content_hash("x"))
        self.assertNotEqual(content_hash("x"), content_hash("y"))


if __name__ == "__main__":
    unittest.main()
