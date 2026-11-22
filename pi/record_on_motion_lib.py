"""Testable helpers for the porch RTSP recorder (no I/O side effects at import)."""

from __future__ import annotations

import os
import queue
import select
import subprocess
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import IO, Any


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


def mean_abs_diff_ratio(previous: bytes, current: bytes) -> float:
    """
    Mean absolute difference of two equal-length byte buffers, scaled 0..1.

    Used as a cheap motion score between grayscale frames.
    """
    if not previous or not current or len(previous) != len(current):
        return 0.0
    total = 0
    length = len(previous)
    for left, right in zip(previous, current, strict=True):
        total += abs(left - right)
    return total / (255.0 * length)


def motion_detected(score: float, threshold: float) -> bool:
    """True when the frame-diff score clears the configured threshold."""
    return score >= threshold


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
    except Exception:
        pass
    try:
        proc.kill()
        proc.wait(timeout=0.5)
    except Exception:
        pass


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


def wait_for_motion(
    pipeline: ContinuousRetainPipeline,
    *,
    threshold: float,
    on_motion: Callable[[float], None] | None = None,
    on_tick: Callable[[], None] | None = None,
    tick_seconds: float = 30.0,
    monotonic: Callable[[], float] = time.monotonic,
) -> None:
    """Block until motion. on_tick runs about every tick_seconds while idle."""
    previous = pipeline.read_frame()
    generation = _stream_generation(pipeline)
    next_tick = monotonic() + max(0.0, tick_seconds)
    while True:
        current = pipeline.read_frame()
        now = monotonic()
        if on_tick is not None and now >= next_tick:
            on_tick()
            next_tick = now + max(0.0, tick_seconds)
        current_generation = _stream_generation(pipeline)
        if current_generation != generation:
            previous = current
            generation = current_generation
            continue
        score = mean_abs_diff_ratio(previous, current)
        previous = current
        if motion_detected(score, threshold):
            if on_motion is not None:
                on_motion(score)
            return


def activity_still_present(
    pipeline: ContinuousRetainPipeline,
    *,
    threshold: float,
    window_seconds: float,
    monotonic: Callable[[], float] = time.monotonic,
) -> bool:
    previous = pipeline.read_frame()
    generation = _stream_generation(pipeline)
    deadline = monotonic() + window_seconds
    while monotonic() < deadline:
        current = pipeline.read_frame()
        current_generation = _stream_generation(pipeline)
        if current_generation != generation:
            previous = current
            generation = current_generation
            continue
        score = mean_abs_diff_ratio(previous, current)
        previous = current
        if motion_detected(score, threshold):
            return True
    return False


def write_concat_list(segment_paths: list[Path], list_path: Path) -> None:
    lines = ["ffconcat version 1.0"]
    for path in segment_paths:
        escaped = str(path.resolve()).replace("'", r"'\''")
        lines.append(f"file '{escaped}'")
    list_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
