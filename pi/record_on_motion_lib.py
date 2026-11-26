"""Testable helpers for the porch RTSP recorder (no I/O side effects at import)."""

from __future__ import annotations

import json
import os
import queue
import select
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any


def signed_payload(method: str, path: str, body: dict, timestamp: str) -> str:
    """Bytes the API guard verifies: method + path + compact JSON + timestamp."""
    # Match JSON.stringify / feeder canonical_json: keep non-ASCII as-is.
    return (
        f"{method}{path}"
        f"{json.dumps(body, separators=(',', ':'), ensure_ascii=False)}"
        f"{timestamp}"
    )


def parse_env_line(line: str) -> tuple[str, str] | None:
    """Parse one KEY=VALUE line from porch.env; ignore comments/blank."""
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, value = stripped.split("=", 1)
    key = key.strip()
    value = value.strip().strip('"').strip("'")
    if not key:
        return None
    return key, value


def load_env_file(path: Path, environ: dict[str, str] | None = None) -> dict[str, str]:
    """
    Load KEY=VALUE pairs from a file into environ (default os.environ).

    Existing keys are left unchanged. Returns the mapping that was written.
    """
    target = environ if environ is not None else os.environ
    written: dict[str, str] = {}
    if not path.is_file():
        return written
    for line in path.read_text(encoding="utf-8").splitlines():
        parsed = parse_env_line(line)
        if parsed is None:
            continue
        key, value = parsed
        if key not in target:
            target[key] = value
            written[key] = value
    return written


def env_float(
    name: str,
    default: float,
    environ: dict[str, str] | None = None,
) -> float:
    """
    Parse a float env var, or return default when unset/blank.

    Raises SystemExit with a clear message when the value is present but invalid.
    """
    source = environ if environ is not None else os.environ
    raw = source.get(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return float(str(raw).strip())
    except ValueError as error:
        raise SystemExit(
            f"Invalid {name}={raw!r}; expected a number (e.g. {default})"
        ) from error


@dataclass(frozen=True)
class MotionSample:
    """One gray frame scored against the slow background reference."""

    changed_ratio: float
    blob_fill: float
    confirmed: bool
    kind: str


class MotionTracker:
    """
    Accept a compact patch of changed pixels that repeats for a few frames.

    A change that covers too much of the picture is a light, not an animal.
    That frame still updates the reference, so a sunrise or an IR switch is
    absorbed instead of staying in the foreground forever. A blast that covers
    most of the frame also disarms detection until the picture is quiet again,
    so the shrinking leftover of that blast cannot open a visit.
    """

    def __init__(
        self,
        *,
        width: int,
        height: int,
        pixel_delta: int = 30,
        min_changed_ratio: float = 0.004,
        max_changed_ratio: float = 0.45,
        light_disarm_ratio: float = 0.80,
        min_blob_fill: float = 0.25,
        consecutive_frames: int = 3,
        reference_alpha: float = 0.02,
    ) -> None:
        if width <= 0 or height <= 0:
            raise ValueError("width and height must be positive")
        if not 1 <= pixel_delta <= 255:
            raise ValueError("pixel_delta must be from 1 to 255")
        if not 0 < min_changed_ratio < max_changed_ratio < light_disarm_ratio <= 1:
            raise ValueError(
                "changed-pixel ratios must be 0 < min < max < light disarm <= 1"
            )
        if not 0 < min_blob_fill <= 1:
            raise ValueError("min_blob_fill must be in (0, 1]")
        if consecutive_frames < 1:
            raise ValueError("consecutive_frames must be at least 1")
        if not 0 < reference_alpha <= 1:
            raise ValueError("reference_alpha must be in (0, 1]")
        self.width = width
        self.height = height
        self.frame_size = width * height
        self.pixel_delta = pixel_delta
        self.min_changed_ratio = min_changed_ratio
        self.max_changed_ratio = max_changed_ratio
        self.light_disarm_ratio = light_disarm_ratio
        self.min_blob_fill = min_blob_fill
        self._disarmed = False
        self.consecutive_frames = consecutive_frames
        self.reference_alpha = reference_alpha
        self.generation = 0
        self.streak = 0
        self._reference: list[float] | None = None

    def reset(self, generation: int) -> None:
        """Drop the reference after the gray stream reconnects."""
        self.generation = generation
        self.streak = 0
        self._disarmed = False
        self._reference = None

    def observe(self, frame: bytes) -> MotionSample:
        if len(frame) != self.frame_size:
            self.streak = 0
            self._disarmed = False
            self._reference = None
            return MotionSample(0.0, 0.0, False, "seed")
        if self._reference is None:
            self._reference = [float(pixel) for pixel in frame]
            self.streak = 0
            self._disarmed = False
            return MotionSample(0.0, 0.0, False, "seed")
        changed, min_x, min_y, max_x, max_y = self._measure(frame)
        self._blend(frame)
        ratio = changed / self.frame_size
        if changed == 0 or ratio < self.min_changed_ratio:
            self.streak = 0
            self._disarmed = False
            return MotionSample(ratio, 0.0, False, "quiet")
        if ratio >= self.light_disarm_ratio:
            self._disarmed = True
            self.streak = 0
            return MotionSample(ratio, 0.0, False, "light")
        if self._disarmed:
            self.streak = 0
            return MotionSample(ratio, 0.0, False, "settle")
        if ratio > self.max_changed_ratio:
            self.streak = 0
            return MotionSample(ratio, 0.0, False, "light")
        bbox = (max_x - min_x + 1) * (max_y - min_y + 1)
        fill = changed / bbox
        if fill < self.min_blob_fill:
            self.streak = 0
            return MotionSample(ratio, fill, False, "speckle")
        self.streak += 1
        confirmed = self.streak >= self.consecutive_frames
        return MotionSample(ratio, fill, confirmed, "motion")

    def _measure(self, frame: bytes) -> tuple[int, int, int, int, int]:
        reference = self._reference
        assert reference is not None
        delta = self.pixel_delta
        width = self.width
        changed = 0
        min_x = width
        min_y = self.height
        max_x = -1
        max_y = -1
        for index, pixel in enumerate(frame):
            if abs(pixel - reference[index]) < delta:
                continue
            changed += 1
            x = index % width
            y = index // width
            if x < min_x:
                min_x = x
            if y < min_y:
                min_y = y
            if x > max_x:
                max_x = x
            if y > max_y:
                max_y = y
        return changed, min_x, min_y, max_x, max_y

    def _blend(self, frame: bytes) -> None:
        reference = self._reference
        assert reference is not None
        alpha = self.reference_alpha
        keep = 1.0 - alpha
        for index, pixel in enumerate(frame):
            reference[index] = keep * reference[index] + alpha * pixel


@dataclass
class VisitClock:
    """Close one visit after a quiet gap, or at the hard cap."""

    gap_seconds: float
    cap_seconds: float
    started_at: float | None = None
    last_motion_at: float | None = None

    def __post_init__(self) -> None:
        if self.gap_seconds <= 0:
            raise ValueError("gap_seconds must be positive")
        if self.cap_seconds <= 0:
            raise ValueError("cap_seconds must be positive")

    def note_motion(self, now: float) -> None:
        if self.started_at is None:
            self.started_at = now
        self.last_motion_at = now

    def close_reason(self, now: float) -> str | None:
        if self.started_at is None or self.last_motion_at is None:
            return None
        if now - self.started_at >= self.cap_seconds:
            return "cap"
        if now - self.last_motion_at >= self.gap_seconds:
            return "gap"
        return None


def visit_retain_window(
    start_epoch: float,
    last_motion_epoch: float,
    *,
    pre_roll_seconds: float,
    post_roll_seconds: float,
) -> tuple[float, float]:
    """
    Span of segments to keep for one visit.

    The quiet stretch between two bursts that arrived inside the gap is
    inside this span. The trailing wait that closed the visit is not.
    """
    return (
        start_epoch - pre_roll_seconds,
        last_motion_epoch + post_roll_seconds,
    )


def visit_keep_after_epoch(
    start_epoch: float,
    *,
    pre_roll_seconds: float,
    segment_seconds: float,
) -> float:
    """Oldest segment start the open visit still needs on disk."""
    return start_epoch - pre_roll_seconds - segment_seconds


def rtsp_substream_url(rtsp_url: str) -> str:
    """Prefer Tapo/ONVIF substream (stream2) when given a main stream URL."""
    if "stream2" in rtsp_url:
        return rtsp_url
    if "stream1" in rtsp_url:
        return rtsp_url.replace("stream1", "stream2", 1)
    return rtsp_url


def select_segments_overlapping_window(
    segments: list[tuple[Path, float]],
    *,
    window_start: float,
    window_end: float,
    segment_seconds: float,
) -> list[Path]:
    """
    Retain segments whose recording interval overlaps [window_start, window_end].

    Each item is (path, start_epoch). A segment ends at the next start, and
    never longer than segment_seconds, so a gap or a stale newest file cannot
    stretch across a later window.
    """
    if segment_seconds <= 0:
        raise ValueError("segment_seconds must be positive")
    if not segments:
        return []
    ordered = sorted(segments, key=lambda item: item[1])
    chosen: list[Path] = []
    for index, (path, start) in enumerate(ordered):
        if index + 1 < len(ordered):
            end = ordered[index + 1][1]
        else:
            end = start + segment_seconds
        end = min(end, start + segment_seconds)
        if end >= window_start and start <= window_end:
            chosen.append(path)
    return chosen


def prune_segments_older_than(
    segments: list[tuple[Path, float]],
    *,
    keep_after_epoch: float,
) -> list[Path]:
    """Return paths that should be deleted (start_epoch < keep_after_epoch)."""
    return [path for path, start in segments if start < keep_after_epoch]


def drop_incomplete_newest_segment(
    segments: list[tuple[Path, float]],
) -> list[tuple[Path, float]]:
    """
    Drop the newest segment from an ordered index.

    The muxer is usually still writing that file; joining it yields flaky clips.
    If only one segment exists, keep it (best effort) rather than retain nothing.
    """
    if len(segments) <= 1:
        return list(segments)
    return list(segments[:-1])


PopenFactory = Callable[..., Any]


def _stdout_fd(stdout: IO[bytes]) -> int | None:
    fileno = getattr(stdout, "fileno", None)
    if not callable(fileno):
        return None
    try:
        return int(fileno())
    except (OSError, ValueError, AttributeError):
        return None


def _read_exact(
    stdout: IO[bytes],
    size: int,
    stop: threading.Event | None = None,
) -> bytes:
    """
    Read exactly size bytes.

    When the stream has a fileno and stop is set, poll instead of blocking in
    read() so close() can join the drain thread.
    """
    chunks: list[bytes] = []
    remaining = size
    fd = _stdout_fd(stdout) if stop is not None else None
    while remaining > 0:
        if stop is not None and stop.is_set():
            break
        if fd is not None:
            try:
                readable, _, _ = select.select([fd], [], [], 0.2)
            except (OSError, ValueError):
                break
            if not readable:
                continue
        try:
            chunk = stdout.read(remaining)
        except OSError:
            break
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def _enqueue_frame(frames: queue.Queue[bytes], frame: bytes) -> None:
    """Drop the oldest frame when the consumer is busy so stdout cannot fill."""
    try:
        frames.put_nowait(frame)
        return
    except queue.Full:
        pass
    try:
        frames.get_nowait()
    except queue.Empty:
        return
    try:
        frames.put_nowait(frame)
    except queue.Full:
        pass


def _kill_process(proc: Any) -> None:
    """Terminate quickly; escalate to kill."""
    try:
        proc.terminate()
        proc.wait(timeout=0.5)
        return
    except Exception as error:
        print(
            f"ffmpeg terminate failed: {type(error).__name__}",
            file=sys.stderr,
        )
    try:
        proc.kill()
        proc.wait(timeout=0.5)
    except Exception as error:
        print(f"ffmpeg kill failed: {type(error).__name__}", file=sys.stderr)


class ContinuousRetainPipeline:
    """
    Approach A (Frigate-like):

    One long-lived ffmpeg on a substream that:
      1) continuously writes short `-c copy` segments to disk
      2) emits low-res grayscale frames for motion detection

    On motion we do not open a new RTSP session. We wait out the post-roll,
    then retain/concat segments that overlap the event window and upload that
    clip. Older segments are pruned locally.
    """

    def __init__(
        self,
        rtsp_url: str,
        *,
        segment_dir: Path,
        width: int,
        height: int,
        ffmpeg_bin: str,
        fps: float = 5.0,
        segment_time: int = 2,
        frame_timeout: float = 5.0,
        popen: PopenFactory = subprocess.Popen,
    ) -> None:
        if width <= 0 or height <= 0:
            raise ValueError("width and height must be positive")
        if fps <= 0:
            raise ValueError("fps must be positive")
        if segment_time <= 0:
            raise ValueError("segment_time must be positive")
        if frame_timeout <= 0:
            raise ValueError("frame_timeout must be positive")
        self.rtsp_url = rtsp_url
        self.segment_dir = segment_dir
        self.width = width
        self.height = height
        self.frame_size = width * height
        self.ffmpeg_bin = ffmpeg_bin
        self.fps = fps
        self.segment_time = segment_time
        self.frame_timeout = frame_timeout
        self._popen = popen
        self._proc: Any | None = None
        self._reader: threading.Thread | None = None
        self._stop = threading.Event()
        self._stdout_eof = threading.Event()
        self._stdout_eof.set()
        self._frames: queue.Queue[bytes] = queue.Queue()
        self._index_lock = threading.Lock()
        # Bumps when read_frame replaces ffmpeg. Motion scoring must not
        # compare a frame from the old stream with one from the new stream.
        self.reconnects = 0
        # path -> epoch when this process first saw the file (not mtime)
        self._segment_starts: dict[Path, float] = {}

    def __enter__(self) -> ContinuousRetainPipeline:
        self.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    @property
    def segment_pattern(self) -> Path:
        # strftime wall-clock names; %%03d is the segment sequence for ffmpeg.
        return self.segment_dir / "seg_%Y%m%d_%H%M%S_%%03d.mp4"

    @property
    def command(self) -> list[str]:
        # Note: ffmpeg requires the RTSP URL (with userinfo) as -i argv. There is
        # no portable credentials-file input for RTSP, so the Camera Account
        # secret is visible in `ps` on the LAN host — keep that host locked down.
        return [
            self.ffmpeg_bin,
            "-hide_banner",
            "-loglevel",
            "error",
            "-rtsp_transport",
            "tcp",
            "-i",
            self.rtsp_url,
            # Continuous retain segments: remux, no re-encode.
            "-an",
            "-map",
            "0:v",
            "-c",
            "copy",
            "-f",
            "segment",
            "-segment_time",
            str(self.segment_time),
            "-segment_atclocktime",
            "1",
            "-strftime",
            "1",
            "-reset_timestamps",
            "1",
            str(self.segment_pattern),
            # Detect path: cheap decoded frames from the same input.
            "-an",
            "-map",
            "0:v",
            "-vf",
            f"fps={self.fps:.4g},scale={self.width}:{self.height},format=gray",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "gray",
            "pipe:1",
        ]

    def start(self, *, clear_segments: bool = True) -> None:
        self.close()
        self.segment_dir.mkdir(parents=True, exist_ok=True)
        if clear_segments:
            for stale in self.segment_dir.glob("seg_*.mp4"):
                stale.unlink(missing_ok=True)
            with self._index_lock:
                self._segment_starts.clear()
        self._stop = threading.Event()
        self._stdout_eof = threading.Event()
        # A few seconds of frames. Older ones are dropped so a blocked
        # consumer (concat/upload) cannot fill the ffmpeg stdout pipe.
        self._frames = queue.Queue(maxsize=max(8, int(self.fps * 4)))
        # DEVNULL: never buffer stderr on a PIPE (hang risk for long-lived ffmpeg).
        self._proc = self._popen(
            self.command,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )
        self._reader = threading.Thread(
            target=self._drain_stdout,
            args=(self._proc, self._frames, self._stop, self._stdout_eof),
            name="porch-frame-drain",
            daemon=True,
        )
        self._reader.start()

    def close(self) -> None:
        self._stop.set()
        proc = self._proc
        self._proc = None
        if proc is not None:
            try:
                if proc.stdout is not None:
                    proc.stdout.close()
            except OSError:
                pass
            _kill_process(proc)
        reader = self._reader
        self._reader = None
        if reader is not None and reader is not threading.current_thread():
            reader.join(timeout=1.0)

    def refresh_segment_index(self, now: float | None = None) -> list[tuple[Path, float]]:
        """Discover new segment files and return the full (path, start) index."""
        epoch = time.time() if now is None else now
        with self._index_lock:
            for path in self.segment_dir.glob("seg_*.mp4"):
                if path not in self._segment_starts and path.is_file():
                    self._segment_starts[path] = epoch
            live = set(self.segment_dir.glob("seg_*.mp4"))
            for path in list(self._segment_starts):
                if path not in live:
                    del self._segment_starts[path]
            return sorted(self._segment_starts.items(), key=lambda item: item[1])

    def read_frame(self) -> bytes:
        frame = self._next_frame()
        if frame is not None:
            return frame
        # Reconnect without wiping retained segments on a transient RTSP blip.
        self.reconnects += 1
        self.start(clear_segments=False)
        frame = self._next_frame()
        if frame is None:
            raise RuntimeError("failed to sample RTSP frame from retain pipeline")
        return frame

    def drain_for(self, seconds: float, sleep: Callable[[float], None] = time.sleep) -> None:
        deadline = time.monotonic() + max(0.0, seconds)
        while time.monotonic() < deadline:
            self.read_frame()
            sleep(0.001)

    def _next_frame(self) -> bytes | None:
        deadline = time.monotonic() + self.frame_timeout
        while True:
            try:
                return self._frames.get_nowait()
            except queue.Empty:
                pass
            if self._stdout_eof.is_set():
                return None
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            try:
                return self._frames.get(timeout=min(0.2, remaining))
            except queue.Empty:
                continue

    def _drain_stdout(
        self,
        proc: Any,
        frames: queue.Queue[bytes],
        stop: threading.Event,
        eof: threading.Event,
    ) -> None:
        stdout = getattr(proc, "stdout", None)
        try:
            if stdout is None:
                return
            while not stop.is_set():
                frame = _read_exact(stdout, self.frame_size, stop)
                if len(frame) != self.frame_size:
                    break
                _enqueue_frame(frames, frame)
                self.refresh_segment_index()
        finally:
            eof.set()


def _stream_generation(pipeline: object) -> int:
    value = getattr(pipeline, "reconnects", 0)
    return value if isinstance(value, int) else 0


def poll_motion(pipeline: object, tracker: MotionTracker) -> MotionSample | None:
    """
    Score one frame.

    A reconnect seeds a new reference and returns None so the jump between
    streams is not motion.
    """
    read_frame = getattr(pipeline, "read_frame")
    frame = read_frame()
    if not isinstance(frame, (bytes, bytearray)):
        raise TypeError("read_frame must return bytes")
    generation = _stream_generation(pipeline)
    if generation != tracker.generation:
        tracker.reset(generation)
        tracker.observe(bytes(frame))
        return None
    return tracker.observe(bytes(frame))


def wait_for_motion(
    pipeline: object,
    tracker: MotionTracker,
    *,
    on_motion: Callable[[MotionSample], None] | None = None,
    on_tick: Callable[[], None] | None = None,
    tick_seconds: float = 30.0,
    monotonic: Callable[[], float] = time.monotonic,
) -> MotionSample:
    """Block until a compact change repeats. on_tick runs while idle."""
    next_tick = monotonic() + max(0.0, tick_seconds)
    while True:
        sample = poll_motion(pipeline, tracker)
        now = monotonic()
        if on_tick is not None and now >= next_tick:
            on_tick()
            next_tick = now + max(0.0, tick_seconds)
        if sample is not None and sample.confirmed:
            if on_motion is not None:
                on_motion(sample)
            return sample


def follow_visit(
    pipeline: object,
    tracker: MotionTracker,
    *,
    gap_seconds: float,
    cap_seconds: float,
    pre_roll_seconds: float,
    post_roll_seconds: float,
    segment_seconds: float,
    on_open: Callable[[float], None] | None = None,
    on_motion: Callable[[MotionSample], None] | None = None,
    on_tick: Callable[[], None] | None = None,
    tick_seconds: float = 30.0,
    monotonic: Callable[[], float] = time.monotonic,
    epoch: Callable[[], float] = time.time,
) -> tuple[float, float, str]:
    """
    Motion is already confirmed. Read until the quiet gap or the cap.

    Returns the segment window and the close reason ("gap" or "cap").
    The trailing gap itself is not part of the window.
    """
    start_mono = monotonic()
    start_epoch = epoch()
    if on_open is not None:
        on_open(start_epoch)
    clock = VisitClock(gap_seconds=gap_seconds, cap_seconds=cap_seconds)
    clock.note_motion(start_mono)
    last_epoch = start_epoch
    next_tick = start_mono + max(0.0, tick_seconds)
    reason: str | None = None
    while reason is None:
        sample = poll_motion(pipeline, tracker)
        now_m = monotonic()
        if on_tick is not None and now_m >= next_tick:
            on_tick()
            next_tick = now_m + max(0.0, tick_seconds)
        if sample is not None and sample.confirmed:
            clock.note_motion(now_m)
            last_epoch = epoch()
            if on_motion is not None:
                on_motion(sample)
        reason = clock.close_reason(now_m)
    if reason == "cap":
        # The cap closed on motion that is still being written. Keep reading
        # so the post-roll segments exist, without extending the visit.
        tail_until = monotonic() + post_roll_seconds + segment_seconds
        while monotonic() < tail_until:
            poll_motion(pipeline, tracker)
        last_epoch = start_epoch + cap_seconds
    window_start, window_end = visit_retain_window(
        start_epoch,
        last_epoch,
        pre_roll_seconds=pre_roll_seconds,
        post_roll_seconds=post_roll_seconds,
    )
    return window_start, window_end, reason


def motion_tracker_from_env(
    prefix: str,
    *,
    width: int,
    height: int,
    environ: dict[str, str] | None = None,
) -> MotionTracker:
    """Build the shared detector. `prefix` is PORCH or FEEDER."""

    def number(suffix: str, default: float) -> float:
        return env_float(f"{prefix}_{suffix}", default, environ)

    return MotionTracker(
        width=width,
        height=height,
        pixel_delta=int(number("PIXEL_DELTA", 30)),
        min_changed_ratio=number("MIN_CHANGED_RATIO", 0.004),
        max_changed_ratio=number("MAX_CHANGED_RATIO", 0.45),
        light_disarm_ratio=number("LIGHT_DISARM_RATIO", 0.80),
        min_blob_fill=number("MIN_BLOB_FILL", 0.25),
        consecutive_frames=int(number("MOTION_FRAMES", 3)),
        reference_alpha=number("REFERENCE_ALPHA", 0.02),
    )


def visit_limits_from_env(
    prefix: str,
    environ: dict[str, str] | None = None,
) -> tuple[float, float]:
    """Quiet gap that joins a visit, then the hard cap, in seconds."""
    return (
        env_float(f"{prefix}_VISIT_GAP_SECONDS", 120.0, environ),
        env_float(f"{prefix}_VISIT_CAP_SECONDS", 600.0, environ),
    )


def classify_sample_offsets(duration_seconds: float) -> list[float]:
    """A few timestamps spread through a visit. One frame at 1s misses a brief animal."""
    if duration_seconds <= 0:
        return [0.5]
    last = max(0.5, duration_seconds - 0.25)
    chosen: list[float] = []
    for value in (
        1.0,
        duration_seconds * 0.25,
        duration_seconds * 0.5,
        duration_seconds * 0.75,
    ):
        offset = min(max(0.5, value), last)
        if all(abs(offset - seen) > 0.4 for seen in chosen):
            chosen.append(offset)
    return chosen or [min(1.0, last)]


def segments_covering(
    pipeline: object,
    window_start: float,
    window_end: float,
    segment_seconds: float,
) -> list[Path]:
    """Complete segments that overlap the visit window."""
    refresh = getattr(pipeline, "refresh_segment_index")
    index = drop_incomplete_newest_segment(refresh())
    retained = select_segments_overlapping_window(
        index,
        window_start=window_start,
        window_end=window_end,
        segment_seconds=segment_seconds,
    )
    if not retained:
        raise RuntimeError("no complete segments overlap the retain window")
    return retained


def concat_segments(
    segment_paths: list[Path],
    output_path: Path,
    ffmpeg_bin: str,
    *,
    timeout: float = 900,
) -> None:
    """Join retained segments. A visit can run to the cap, so the encode may be long."""
    if not segment_paths:
        raise RuntimeError("no retained segments to build a clip")
    list_path = output_path.with_suffix(".concat.txt")
    write_concat_list(segment_paths, list_path)
    try:
        subprocess.run(
            [
                ffmpeg_bin,
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_path),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-an",
                "-movflags",
                "+faststart",
                "-y",
                str(output_path),
            ],
            check=True,
            timeout=timeout,
        )
    finally:
        list_path.unlink(missing_ok=True)


def write_concat_list(segment_paths: list[Path], list_path: Path) -> None:
    lines = ["ffconcat version 1.0"]
    for path in segment_paths:
        escaped = str(path.resolve()).replace("'", r"'\''")
        lines.append(f"file '{escaped}'")
    list_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
