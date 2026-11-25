"""Unit tests for porch recorder helpers (no live camera)."""

from __future__ import annotations

import tempfile
import threading
import time
import unittest
from pathlib import Path

from record_on_motion_lib import (
    ContinuousRetainPipeline,
    MotionTracker,
    VisitClock,
    classify_sample_offsets,
    drop_incomplete_newest_segment,
    env_float,
    follow_visit,
    load_env_file,
    motion_tracker_from_env,
    parse_env_line,
    prune_segments_older_than,
    rtsp_substream_url,
    select_segments_overlapping_window,
    visit_keep_after_epoch,
    visit_limits_from_env,
    visit_retain_window,
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


def _frame(width: int, height: int, value: int, rect: tuple[int, int, int, int, int] | None = None) -> bytes:
    buf = bytearray([value]) * (width * height)
    if rect is not None:
        x0, y0, x1, y1, paint = rect
        for y in range(y0, y1):
            for x in range(x0, x1):
                buf[y * width + x] = paint
    return bytes(buf)


class MotionScoreTests(unittest.TestCase):
    def tracker(self, **overrides: object) -> MotionTracker:
        values: dict[str, object] = {
            "width": 8,
            "height": 8,
            "pixel_delta": 30,
            "min_changed_ratio": 0.004,
            "max_changed_ratio": 0.45,
            "min_blob_fill": 0.35,
            "consecutive_frames": 3,
            "reference_alpha": 0.02,
        }
        values.update(overrides)
        return MotionTracker(**values)  # type: ignore[arg-type]

    def test_first_frame_seeds_the_reference(self) -> None:
        sample = self.tracker().observe(_frame(8, 8, 0))
        self.assertEqual(sample.kind, "seed")
        self.assertFalse(sample.confirmed)

    def test_full_frame_flash_is_a_light(self) -> None:
        tracker = self.tracker()
        tracker.observe(_frame(8, 8, 0))
        sample = tracker.observe(_frame(8, 8, 255))
        self.assertEqual(sample.kind, "light")
        self.assertFalse(sample.confirmed)

    def test_blast_stays_disarmed_until_the_picture_is_quiet(self) -> None:
        tracker = self.tracker()
        tracker.observe(_frame(8, 8, 0))
        tracker.observe(_frame(8, 8, 255))
        blob = _frame(8, 8, 0, (1, 1, 4, 4, 255))
        leftover = tracker.observe(blob)
        self.assertEqual(leftover.kind, "settle")
        self.assertFalse(leftover.confirmed)
        quiet = tracker.observe(_frame(8, 8, 0))
        self.assertEqual(quiet.kind, "quiet")
        self.assertFalse(tracker.observe(blob).confirmed)
        self.assertFalse(tracker.observe(blob).confirmed)
        self.assertTrue(tracker.observe(blob).confirmed)

    def test_smaller_light_does_not_disarm(self) -> None:
        tracker = self.tracker()
        tracker.observe(_frame(8, 8, 0))
        half = _frame(8, 8, 0, (0, 0, 8, 4, 255))
        sample = tracker.observe(half)
        self.assertEqual(sample.kind, "light")
        blob = _frame(8, 8, 0, (1, 1, 4, 4, 255))
        self.assertFalse(tracker.observe(blob).confirmed)
        self.assertFalse(tracker.observe(blob).confirmed)
        self.assertTrue(tracker.observe(blob).confirmed)

    def test_compact_patch_confirms_on_the_third_frame(self) -> None:
        tracker = self.tracker()
        tracker.observe(_frame(8, 8, 0))
        blob = _frame(8, 8, 0, (1, 1, 4, 4, 255))
        first = tracker.observe(blob)
        second = tracker.observe(blob)
        third = tracker.observe(blob)
        self.assertEqual(first.kind, "motion")
        self.assertFalse(first.confirmed)
        self.assertFalse(second.confirmed)
        self.assertTrue(third.confirmed)

    def test_speckle_does_not_count(self) -> None:
        tracker = self.tracker()
        base = bytearray(_frame(8, 8, 0))
        tracker.observe(bytes(base))
        noisy = bytearray(base)
        for index in (0, 10, 20, 30, 40, 50, 60):
            noisy[index] = 255
        sample = tracker.observe(bytes(noisy))
        self.assertEqual(sample.kind, "speckle")
        self.assertFalse(sample.confirmed)

    def test_a_quiet_frame_resets_the_streak(self) -> None:
        tracker = self.tracker()
        tracker.observe(_frame(8, 8, 0))
        blob = _frame(8, 8, 0, (1, 1, 4, 4, 255))
        tracker.observe(blob)
        tracker.observe(blob)
        quiet = tracker.observe(_frame(8, 8, 0))
        again = tracker.observe(blob)
        self.assertEqual(quiet.kind, "quiet")
        self.assertFalse(again.confirmed)

    def test_slow_ramp_stays_quiet(self) -> None:
        tracker = self.tracker(reference_alpha=1.0)
        tracker.observe(_frame(8, 8, 0))
        sample = tracker.observe(_frame(8, 8, 10))
        self.assertEqual(sample.kind, "quiet")

    def test_visit_gap_and_cap(self) -> None:
        clock = VisitClock(gap_seconds=120, cap_seconds=600)
        self.assertIsNone(clock.close_reason(50))
        clock.note_motion(0)
        clock.note_motion(100)
        self.assertIsNone(clock.close_reason(219))
        self.assertEqual(clock.close_reason(220), "gap")
        capped = VisitClock(gap_seconds=120, cap_seconds=600)
        capped.note_motion(0)
        self.assertEqual(capped.close_reason(600), "cap")

    def test_visit_window_keeps_the_middle_and_drops_the_trailing_gap(self) -> None:
        start, end = visit_retain_window(
            1_000,
            1_200,
            pre_roll_seconds=4,
            post_roll_seconds=20,
        )
        self.assertEqual((start, end), (996, 1_220))
        self.assertEqual(
            visit_keep_after_epoch(1_000, pre_roll_seconds=4, segment_seconds=2),
            994,
        )

    def test_classify_samples_are_spread_through_the_visit(self) -> None:
        offsets = classify_sample_offsets(80)
        self.assertGreaterEqual(len(offsets), 3)
        self.assertLess(max(offsets), 80)
        self.assertEqual(classify_sample_offsets(0), [0.5])

    def test_env_builds_the_same_detector_for_both_cameras(self) -> None:
        porch = motion_tracker_from_env("PORCH", width=4, height=4, environ={})
        feeder = motion_tracker_from_env(
            "FEEDER",
            width=4,
            height=4,
            environ={"FEEDER_PIXEL_DELTA": "40", "FEEDER_MOTION_FRAMES": "2"},
        )
        self.assertEqual(porch.pixel_delta, 30)
        self.assertEqual(porch.consecutive_frames, 3)
        self.assertEqual(porch.min_blob_fill, 0.25)
        self.assertEqual(feeder.pixel_delta, 40)
        self.assertEqual(feeder.consecutive_frames, 2)
        self.assertEqual(visit_limits_from_env("PORCH", {}), (120.0, 600.0))


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
                    time.sleep(0.01)
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


class _Frames:
    def __init__(self, frames: list[bytes]) -> None:
        self.frames = frames
        self.reconnects = 0

    def read_frame(self) -> bytes:
        return self.frames.pop(0)


class MotionLoopTests(unittest.TestCase):
    def tracker(self) -> MotionTracker:
        return MotionTracker(
            width=8,
            height=8,
            consecutive_frames=3,
            max_changed_ratio=0.45,
            min_blob_fill=0.35,
        )

    def test_wait_for_motion(self) -> None:
        blob = _frame(8, 8, 0, (1, 1, 4, 4, 255))
        pipeline = _Frames([_frame(8, 8, 0), blob, blob, blob])
        seen: list[str] = []
        sample = wait_for_motion(
            pipeline,
            self.tracker(),
            on_motion=lambda item: seen.append(item.kind),
        )
        self.assertTrue(sample.confirmed)
        self.assertEqual(seen, ["motion"])

    def test_wait_for_motion_ticks_while_idle(self) -> None:
        blob = _frame(8, 8, 0, (1, 1, 4, 4, 255))
        pipeline = _Frames([_frame(8, 8, 0), _frame(8, 8, 0), blob, blob, blob])
        ticks: list[int] = []
        wait_for_motion(
            pipeline,
            self.tracker(),
            on_tick=lambda: ticks.append(1),
            tick_seconds=0,
        )
        self.assertGreaterEqual(len(ticks), 1)

    def test_reconnect_does_not_count_as_motion(self) -> None:
        blob = _frame(8, 8, 0, (1, 1, 4, 4, 255))

        class Stub(_Frames):
            def __init__(self) -> None:
                super().__init__(
                    [
                        _frame(8, 8, 0),
                        _frame(8, 8, 0),
                        _frame(8, 8, 0),
                        blob,
                        blob,
                        blob,
                    ]
                )
                self.reads = 0

            def read_frame(self) -> bytes:
                self.reads += 1
                if self.reads == 2:
                    self.reconnects = 1
                return self.frames.pop(0)

        seen: list[str] = []
        sample = wait_for_motion(Stub(), self.tracker(), on_motion=lambda item: seen.append(item.kind))
        self.assertTrue(sample.confirmed)
        self.assertEqual(seen, ["motion"])

    def test_follow_visit_closes_on_the_gap(self) -> None:
        quiet = _frame(8, 8, 0)
        pipeline = _Frames([quiet, quiet, quiet, quiet])
        tracker = self.tracker()
        tracker.observe(quiet)
        clock = {"t": 0.0}

        def monotonic() -> float:
            clock["t"] += 50.0
            return clock["t"]

        start, end, reason = follow_visit(
            pipeline,
            tracker,
            gap_seconds=120,
            cap_seconds=600,
            pre_roll_seconds=4,
            post_roll_seconds=20,
            segment_seconds=2,
            monotonic=monotonic,
            epoch=lambda: 1_000.0,
        )
        self.assertEqual(reason, "gap")
        self.assertEqual(start, 996.0)
        self.assertEqual(end, 1_020.0)

    def test_follow_visit_closes_on_the_cap(self) -> None:
        blob = _frame(8, 8, 0, (1, 1, 4, 4, 255))
        pipeline = _Frames([blob] * 30)
        tracker = self.tracker()
        tracker.observe(_frame(8, 8, 0))
        clock = {"t": 0.0}
        epochs = {"t": 5_000.0}

        def monotonic() -> float:
            clock["t"] += 3.0
            return clock["t"]

        def epoch() -> float:
            epochs["t"] += 3.0
            return epochs["t"]

        _start, end, reason = follow_visit(
            pipeline,
            tracker,
            gap_seconds=120,
            cap_seconds=5,
            pre_roll_seconds=4,
            post_roll_seconds=1,
            segment_seconds=1,
            monotonic=monotonic,
            epoch=epoch,
        )
        self.assertEqual(reason, "cap")
        self.assertGreater(end, 5_000.0)


if __name__ == "__main__":
    unittest.main()
