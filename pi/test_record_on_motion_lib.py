"""Unit tests for porch recorder helpers (no live camera)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from record_on_motion_lib import (
    ContinuousRetainPipeline,
    activity_still_present,
    env_float,
    load_env_file,
    mean_abs_diff_ratio,
    motion_detected,
    parse_env_line,
    prune_segments_older_than,
    rtsp_substream_url,
    select_segments_overlapping_window,
    wait_for_motion,
    write_concat_list,
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
                "PORCH_RTSP_URL=rtsp://u:p@host/stream1\n",
                encoding="utf-8",
            )
            environ = {"PORCH_API_BASE_URL": "https://already.set"}
            written = load_env_file(path, environ)
            self.assertEqual(environ["PORCH_API_BASE_URL"], "https://already.set")
            self.assertEqual(environ["PORCH_RTSP_URL"], "rtsp://u:p@host/stream1")
            self.assertEqual(written, {"PORCH_RTSP_URL": "rtsp://u:p@host/stream1"})

    def test_missing_file_is_noop(self) -> None:
        environ: dict[str, str] = {}
        self.assertEqual(load_env_file(Path("/nonexistent/porch.env"), environ), {})


class MotionScoreTests(unittest.TestCase):
    def test_identical_frames_are_zero(self) -> None:
        frame = bytes([10, 20, 30, 40])
        self.assertEqual(mean_abs_diff_ratio(frame, frame), 0.0)

    def test_max_diff_is_one(self) -> None:
        self.assertAlmostEqual(mean_abs_diff_ratio(bytes([0, 0]), bytes([255, 255])), 1.0)

    def test_mismatched_lengths_are_zero(self) -> None:
        self.assertEqual(mean_abs_diff_ratio(b"abc", b"ab"), 0.0)

    def test_motion_threshold(self) -> None:
        self.assertTrue(motion_detected(0.05, 0.035))
        self.assertFalse(motion_detected(0.01, 0.035))


class EnvFloatTests(unittest.TestCase):
    def test_default_when_unset(self) -> None:
        self.assertEqual(env_float("MISSING", 0.035, {}), 0.035)

    def test_parses_number(self) -> None:
        self.assertEqual(env_float("X", 0.0, {"X": "0.04"}), 0.04)

    def test_invalid_exits(self) -> None:
        with self.assertRaises(SystemExit):
            env_float("X", 0.035, {"X": "nope"})


class SubstreamUrlTests(unittest.TestCase):
    def test_stream1_to_stream2(self) -> None:
        self.assertEqual(
            rtsp_substream_url("rtsp://u:p@host:554/stream1"),
            "rtsp://u:p@host:554/stream2",
        )


class RetainWindowTests(unittest.TestCase):
    def test_overlap_selection(self) -> None:
        paths = [
            (Path("a.mp4"), 100.0),
            (Path("b.mp4"), 102.0),
            (Path("c.mp4"), 104.0),
            (Path("d.mp4"), 110.0),
        ]
        # Motion at 103, pre 2 → window [101, 108]
        chosen = select_segments_overlapping_window(
            paths, window_start=101.0, window_end=108.0
        )
        self.assertEqual([p.name for p in chosen], ["a.mp4", "b.mp4", "c.mp4"])

    def test_prune_older(self) -> None:
        paths = [
            (Path("old.mp4"), 10.0),
            (Path("new.mp4"), 50.0),
        ]
        self.assertEqual(
            prune_segments_older_than(paths, keep_after_epoch=40.0),
            [Path("old.mp4")],
        )


class ConcatListTests(unittest.TestCase):
    def test_writes_ffconcat(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = root / "a.mp4"
            b = root / "b.mp4"
            a.write_bytes(b"a")
            b.write_bytes(b"b")
            list_path = root / "list.txt"
            write_concat_list([a, b], list_path)
            text = list_path.read_text(encoding="utf-8")
            self.assertIn("ffconcat version 1.0", text)


class _FakeStdout:
    def __init__(self, payloads: list[bytes]) -> None:
        self._payloads = list(payloads)

    def read(self, size: int = -1) -> bytes:
        if not self._payloads:
            return b""
        data = self._payloads.pop(0)
        if size < 0 or size >= len(data):
            return data
        self._payloads.insert(0, data[size:])
        return data[:size]

    def close(self) -> None:
        return None


class _FakeProc:
    def __init__(self, payloads: list[bytes]) -> None:
        self.stdout = _FakeStdout(payloads)
        self.stderr = _FakeStdout([])

    def terminate(self) -> None:
        return None

    def kill(self) -> None:
        return None

    def wait(self, timeout: float | None = None) -> int:
        return 0


class PipelineTests(unittest.TestCase):
    def test_command_is_copy_segments_plus_gray_pipe(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:

            def fake_popen(*_a: object, **_k: object) -> _FakeProc:
                return _FakeProc([bytes([1, 2, 3, 4])])

            pipeline = ContinuousRetainPipeline(
                "rtsp://u:p@host/stream2",
                segment_dir=Path(tmp),
                width=2,
                height=2,
                ffmpeg_bin="/usr/bin/ffmpeg",
                popen=fake_popen,
            )
            with pipeline:
                joined = " ".join(pipeline.command)
                self.assertIn("-c copy", joined)
                self.assertIn("segment", joined)
                self.assertIn("pipe:1", joined)
                self.assertIn("stream2", joined)
                self.assertEqual(pipeline.read_frame(), bytes([1, 2, 3, 4]))


class MotionLoopTests(unittest.TestCase):
    def test_wait_for_motion(self) -> None:
        class Stub:
            def __init__(self) -> None:
                self.frames = [bytes([0, 0]), bytes([255, 255])]

            def read_frame(self) -> bytes:
                return self.frames.pop(0)

        scores: list[float] = []
        wait_for_motion(Stub(), threshold=0.5, on_motion=scores.append)  # type: ignore[arg-type]
        self.assertEqual(len(scores), 1)

    def test_activity(self) -> None:
        class Moving:
            def __init__(self) -> None:
                self.frames = [bytes([0, 0]), bytes([255, 255])]

            def read_frame(self) -> bytes:
                return self.frames.pop(0)

        self.assertTrue(
            activity_still_present(Moving(), threshold=0.5, window_seconds=1.0)  # type: ignore[arg-type]
        )


if __name__ == "__main__":
    unittest.main()
