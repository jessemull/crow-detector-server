"""Unit tests for porch recorder helpers (no live camera)."""

from __future__ import annotations

import http.client
import importlib.util
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from record_on_motion_lib import (
    ContinuousRetainPipeline,
    activity_still_present,
    drop_incomplete_newest_segment,
    env_float,
    load_env_file,
    mean_abs_diff_ratio,
    motion_detected,
    parse_env_line,
    prune_segments_older_than,
    rtsp_substream_url,
    select_segments_overlapping_window,
    signed_payload,
    wait_for_motion,
    write_concat_list,
)


class SignedPayloadTests(unittest.TestCase):
    def test_porch_upload_matches_api_guard(self) -> None:
        body = {"fileName": "clip-1", "contentLength": 1200}
        payload = signed_payload("POST", "/urls/porch", body, "1700000000000")
        self.assertEqual(
            payload,
            'POST/urls/porch{"fileName":"clip-1","contentLength":1200}1700000000000',
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
        self.assertTrue(motion_detected(0.035, 0.035))
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

    def test_stream1_in_the_password_stays(self) -> None:
        self.assertEqual(
            rtsp_substream_url("rtsp://user:stream1pass@host:554/stream1"),
            "rtsp://user:stream1pass@host:554/stream2",
        )

    def test_stream2_path_is_unchanged_when_the_password_contains_stream1(self) -> None:
        self.assertEqual(
            rtsp_substream_url("rtsp://user:stream1@host:554/stream2"),
            "rtsp://user:stream1@host:554/stream2",
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
            paths,
            window_start=101.0,
            window_end=108.0,
            segment_seconds=2.0,
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

    def test_empty_overlap_returns_empty(self) -> None:
        paths = [
            (Path("a.mp4"), 100.0),
            (Path("b.mp4"), 102.0),
        ]
        # Window entirely before any segment start → no overlap.
        chosen = select_segments_overlapping_window(
            paths,
            window_start=50.0,
            window_end=60.0,
            segment_seconds=2.0,
        )
        self.assertEqual(chosen, [])

    def test_stale_newest_does_not_cover_later_window(self) -> None:
        chosen = select_segments_overlapping_window(
            [(Path("old.mp4"), 100.0)],
            window_start=200.0,
            window_end=220.0,
            segment_seconds=2.0,
        )
        self.assertEqual(chosen, [])

    def test_gap_does_not_stretch_earlier_segment(self) -> None:
        paths = [
            (Path("a.mp4"), 100.0),
            (Path("b.mp4"), 200.0),
        ]
        chosen = select_segments_overlapping_window(
            paths,
            window_start=150.0,
            window_end=160.0,
            segment_seconds=2.0,
        )
        self.assertEqual(chosen, [])

    def test_drop_incomplete_newest(self) -> None:
        paths = [
            (Path("a.mp4"), 100.0),
            (Path("b.mp4"), 102.0),
            (Path("c.mp4"), 104.0),
        ]
        dropped = drop_incomplete_newest_segment(paths)
        self.assertEqual([p.name for p, _ in dropped], ["a.mp4", "b.mp4"])
        self.assertEqual(drop_incomplete_newest_segment([]), [])
        only = [(Path("solo.mp4"), 1.0)]
        self.assertEqual(drop_incomplete_newest_segment(only), only)


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
            popen_kwargs: list[dict[str, object]] = []

            def fake_popen(*_a: object, **kwargs: object) -> _FakeProc:
                popen_kwargs.append(kwargs)
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
            self.assertTrue(popen_kwargs)
            self.assertIs(popen_kwargs[0].get("stderr"), __import__("subprocess").DEVNULL)

    def test_reconnect_preserves_segments(self) -> None:
        import subprocess

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            kept = root / "seg_keep.mp4"
            kept.write_bytes(b"keep")
            launches = {"n": 0}

            def fake_popen(*_a: object, **kwargs: object) -> _FakeProc:
                self.assertIs(kwargs.get("stderr"), subprocess.DEVNULL)
                launches["n"] += 1
                if launches["n"] == 1:
                    return _FakeProc([])  # EOF → reconnect
                return _FakeProc([bytes([5, 6, 7, 8])])

            pipeline = ContinuousRetainPipeline(
                "rtsp://u:p@host/stream2",
                segment_dir=root,
                width=2,
                height=2,
                ffmpeg_bin="/usr/bin/ffmpeg",
                frame_timeout=1.0,
                popen=fake_popen,
            )
            # First launch EOF → clear_segments=False reconnect → frame OK
            pipeline.start(clear_segments=False)
            self.assertEqual(pipeline.read_frame(), bytes([5, 6, 7, 8]))
            self.assertEqual(launches["n"], 2)
            self.assertTrue(kept.exists())
            pipeline.close()

    def test_drain_reads_stdout_when_consumer_is_idle(self) -> None:
        frame = bytes([1, 2, 3, 4])
        total = 30

        class CountingStdout:
            def __init__(self) -> None:
                self.reads = 0
                self._lock = threading.Lock()

            def read(self, size: int = -1) -> bytes:
                with self._lock:
                    if self.reads >= total:
                        return b""
                    self.reads += 1
                    return frame if size < 0 or size >= len(frame) else frame[:size]

            def close(self) -> None:
                return None

        stdout = CountingStdout()

        def fake_popen(*_a: object, **_k: object) -> _FakeProc:
            proc = _FakeProc([])
            proc.stdout = stdout  # type: ignore[assignment]
            return proc

        with tempfile.TemporaryDirectory() as tmp:
            pipeline = ContinuousRetainPipeline(
                "rtsp://u:p@host/stream2",
                segment_dir=Path(tmp),
                width=2,
                height=2,
                ffmpeg_bin="/usr/bin/ffmpeg",
                fps=5.0,
                frame_timeout=1.0,
                popen=fake_popen,
            )
            pipeline.start()
            try:
                deadline = time.monotonic() + 2.0
                while stdout.reads < total and time.monotonic() < deadline:
                    time.sleep(0)
                self.assertEqual(stdout.reads, total)
            finally:
                pipeline.close()

    def test_stalled_stdout_reconnects(self) -> None:
        launches = {"n": 0}

        class BlockingStdout:
            def __init__(self) -> None:
                self._closed = threading.Event()

            def read(self, size: int = -1) -> bytes:
                self._closed.wait()
                return b""

            def close(self) -> None:
                self._closed.set()

        def fake_popen(*_a: object, **_k: object) -> _FakeProc:
            launches["n"] += 1
            proc = _FakeProc([bytes([9, 9, 9, 9])] if launches["n"] > 1 else [])
            if launches["n"] == 1:
                proc.stdout = BlockingStdout()  # type: ignore[assignment]
            return proc

        with tempfile.TemporaryDirectory() as tmp:
            pipeline = ContinuousRetainPipeline(
                "rtsp://u:p@host/stream2",
                segment_dir=Path(tmp),
                width=2,
                height=2,
                ffmpeg_bin="/usr/bin/ffmpeg",
                frame_timeout=0.3,
                popen=fake_popen,
            )
            pipeline.start()
            try:
                self.assertEqual(pipeline.read_frame(), bytes([9, 9, 9, 9]))
                self.assertEqual(launches["n"], 2)
            finally:
                pipeline.close()

    def test_close_returns_while_stdout_is_idle(self) -> None:
        import os

        read_fd, write_fd = os.pipe()
        try:

            class PipeStdout:
                def fileno(self) -> int:
                    return read_fd

                def read(self, size: int = -1) -> bytes:
                    count = size if size and size > 0 else 4096
                    return os.read(read_fd, count)

                def close(self) -> None:
                    os.close(read_fd)

            def fake_popen(*_a: object, **_k: object) -> _FakeProc:
                proc = _FakeProc([])
                proc.stdout = PipeStdout()  # type: ignore[assignment]
                return proc

            with tempfile.TemporaryDirectory() as tmp:
                pipeline = ContinuousRetainPipeline(
                    "rtsp://u:p@host/stream2",
                    segment_dir=Path(tmp),
                    width=2,
                    height=2,
                    ffmpeg_bin="/usr/bin/ffmpeg",
                    popen=fake_popen,
                )
                pipeline.start()
                time.sleep(0.05)
                started = time.monotonic()
                pipeline.close()
                self.assertLess(time.monotonic() - started, 1.0)
        finally:
            os.close(write_fd)


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

    def test_wait_for_motion_ticks_while_idle(self) -> None:
        class Stub:
            def __init__(self) -> None:
                self.frames = [bytes([0, 0]), bytes([0, 0]), bytes([255, 255])]

            def read_frame(self) -> bytes:
                return self.frames.pop(0)

        ticks: list[int] = []
        wait_for_motion(  # type: ignore[arg-type]
            Stub(),
            threshold=0.5,
            on_tick=lambda: ticks.append(1),
            tick_seconds=0,
        )
        self.assertGreaterEqual(len(ticks), 1)

    def test_reconnect_does_not_count_as_motion(self) -> None:
        class Stub:
            def __init__(self) -> None:
                self.frames = [
                    bytes([0, 0]),
                    bytes([255, 255]),
                    bytes([255, 255]),
                    bytes([0, 0]),
                ]
                self.reconnects = 0
                self.reads = 0

            def read_frame(self) -> bytes:
                self.reads += 1
                if self.reads == 2:
                    self.reconnects += 1
                return self.frames.pop(0)

        scores: list[float] = []
        wait_for_motion(Stub(), threshold=0.5, on_motion=scores.append)  # type: ignore[arg-type]
        self.assertEqual(len(scores), 1)

    def test_reconnect_does_not_extend_activity(self) -> None:
        class Stub:
            def __init__(self) -> None:
                self.frames = [
                    bytes([0, 0]),
                    bytes([255, 255]),
                    bytes([255, 255]),
                ]
                self.reconnects = 0
                self.reads = 0

            def read_frame(self) -> bytes:
                self.reads += 1
                if self.reads == 2:
                    self.reconnects += 1
                return self.frames.pop(0)

        times = iter([0.0, 0.0, 0.5, 1.0])

        def monotonic() -> float:
            return next(times)

        self.assertFalse(
            activity_still_present(  # type: ignore[arg-type]
                Stub(),
                threshold=0.5,
                window_seconds=1.0,
                monotonic=monotonic,
            )
        )

    def test_activity(self) -> None:
        class Moving:
            def __init__(self) -> None:
                self.frames = [bytes([0, 0]), bytes([255, 255])]

            def read_frame(self) -> bytes:
                return self.frames.pop(0)

        self.assertTrue(
            activity_still_present(Moving(), threshold=0.5, window_seconds=1.0)  # type: ignore[arg-type]
        )


class UploadRetryTests(unittest.TestCase):
    def test_retries_incomplete_read_and_bad_json(self) -> None:
        spec = importlib.util.spec_from_file_location(
            "record_on_motion",
            Path(__file__).with_name("record-on-motion.py"),
        )
        assert spec is not None and spec.loader is not None
        recorder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(recorder)

        path = Path("clip.mp4")
        with (
            mock.patch.object(
                recorder,
                "upload_clip",
                side_effect=[
                    http.client.IncompleteRead(partial=b""),
                    json.JSONDecodeError("bad", "doc", 0),
                    None,
                ],
            ) as upload,
            mock.patch.object(recorder.time, "sleep"),
            mock.patch.object(Path, "unlink"),
        ):
            recorder.upload_and_remove(path, attempts=3)
        self.assertEqual(upload.call_count, 3)


if __name__ == "__main__":
    unittest.main()
