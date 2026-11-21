"""Unit tests for porch recorder helpers (no live camera)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from record_on_motion_lib import (
    load_env_file,
    mean_abs_diff_ratio,
    motion_detected,
    parse_env_line,
)


class ParseEnvLineTests(unittest.TestCase):
    def test_parses_key_value(self) -> None:
        self.assertEqual(parse_env_line("FOO=bar"), ("FOO", "bar"))

    def test_strips_quotes(self) -> None:
        self.assertEqual(parse_env_line("FOO='bar'"), ("FOO", "bar"))
        self.assertEqual(parse_env_line('FOO="bar"'), ("FOO", "bar"))

    def test_ignores_comments_and_blank(self) -> None:
        self.assertIsNone(parse_env_line("# comment"))
        self.assertIsNone(parse_env_line("  "))
        self.assertIsNone(parse_env_line("nope"))


class LoadEnvFileTests(unittest.TestCase):
    def test_loads_missing_keys_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "porch.env"
            path.write_text(
                "PORCH_API_BASE_URL=https://api-dev.example\n"
                "PORCH_RTSP_URL=rtsp://u:p@host/stream1\n"
                "# ignored\n",
                encoding="utf-8",
            )
            environ = {"PORCH_API_BASE_URL": "https://already.set"}
            written = load_env_file(path, environ)
            self.assertEqual(environ["PORCH_API_BASE_URL"], "https://already.set")
            self.assertEqual(
                environ["PORCH_RTSP_URL"], "rtsp://u:p@host/stream1"
            )
            self.assertEqual(
                written, {"PORCH_RTSP_URL": "rtsp://u:p@host/stream1"}
            )

    def test_missing_file_is_noop(self) -> None:
        environ: dict[str, str] = {}
        written = load_env_file(Path("/nonexistent/porch.env"), environ)
        self.assertEqual(written, {})
        self.assertEqual(environ, {})


class MotionScoreTests(unittest.TestCase):
    def test_identical_frames_are_zero(self) -> None:
        frame = bytes([10, 20, 30, 40])
        self.assertEqual(mean_abs_diff_ratio(frame, frame), 0.0)

    def test_max_diff_is_one(self) -> None:
        left = bytes([0, 0])
        right = bytes([255, 255])
        self.assertAlmostEqual(mean_abs_diff_ratio(left, right), 1.0)

    def test_mismatched_lengths_are_zero(self) -> None:
        self.assertEqual(mean_abs_diff_ratio(b"abc", b"ab"), 0.0)

    def test_motion_threshold(self) -> None:
        self.assertTrue(motion_detected(0.05, 0.035))
        self.assertFalse(motion_detected(0.01, 0.035))


if __name__ == "__main__":
    unittest.main()
