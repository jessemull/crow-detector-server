"""Testable helpers for the porch RTSP recorder (no I/O side effects at import)."""

from __future__ import annotations

import os
import subprocess
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
) -> list[Path]:
    """
    Retain segments whose recording interval overlaps [window_start, window_end].

    Each item is (path, start_epoch). Segment end is inferred as the next
    segment's start, or window_end for the newest open/finished piece.
    """
    if not segments:
        return []
    ordered = sorted(segments, key=lambda item: item[1])
    chosen: list[Path] = []
    for index, (path, start) in enumerate(ordered):
        if index + 1 < len(ordered):
            end = ordered[index + 1][1]
        else:
            end = max(window_end, start)
        # Overlap test against [window_start, window_end]
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
        popen: PopenFactory = subprocess.Popen,
    ) -> None:
        if width <= 0 or height <= 0:
            raise ValueError("width and height must be positive")
        if fps <= 0:
            raise ValueError("fps must be positive")
        if segment_time <= 0:
            raise ValueError("segment_time must be positive")
        self.rtsp_url = rtsp_url
        self.segment_dir = segment_dir
        self.width = width
        self.height = height
        self.frame_size = width * height
        self.ffmpeg_bin = ffmpeg_bin
        self.fps = fps
        self.segment_time = segment_time
        self._popen = popen
        self._proc: Any | None = None
        # path -> approximate start epoch (when we first observed the file)
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
            self._segment_starts.clear()
        # DEVNULL: never buffer stderr on a PIPE (hang risk for long-lived ffmpeg).
        self._proc = self._popen(
            self.command,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )

    def close(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None:
            return
        try:
            if proc.stdout is not None:
                proc.stdout.close()
        except OSError:
            pass
        _kill_process(proc)

    def refresh_segment_index(self, now: float | None = None) -> list[tuple[Path, float]]:
        """Discover new segment files and return the full (path, start) index."""
        epoch = time.time() if now is None else now
        for path in self.segment_dir.glob("seg_*.mp4"):
            if path not in self._segment_starts and path.is_file():
                # Prefer mtime as approx start; first sighting as fallback.
                try:
                    self._segment_starts[path] = path.stat().st_mtime
                except OSError:
                    self._segment_starts[path] = epoch
        # Drop index entries for deleted files.
        live = set(self.segment_dir.glob("seg_*.mp4"))
        for path in list(self._segment_starts):
            if path not in live:
                del self._segment_starts[path]
        return sorted(self._segment_starts.items(), key=lambda item: item[1])

    def read_frame(self) -> bytes:
        frame = self._read_exact(self.frame_size)
        if len(frame) == self.frame_size:
            self.refresh_segment_index()
            return frame
        # Reconnect without wiping retained segments on a transient RTSP blip.
        self.start(clear_segments=False)
        frame = self._read_exact(self.frame_size)
        if len(frame) != self.frame_size:
            raise RuntimeError("failed to sample RTSP frame from retain pipeline")
        self.refresh_segment_index()
        return frame

    def drain_for(self, seconds: float, sleep: Callable[[float], None] = time.sleep) -> None:
        deadline = time.monotonic() + max(0.0, seconds)
        while time.monotonic() < deadline:
            self.read_frame()
            sleep(0.001)

    def _read_exact(self, size: int) -> bytes:
        if self._proc is None or self._proc.stdout is None:
            self.start(clear_segments=False)
        assert self._proc is not None and self._proc.stdout is not None
        stdout: IO[bytes] = self._proc.stdout
        chunks: list[bytes] = []
        remaining = size
        while remaining > 0:
            chunk = stdout.read(remaining)
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)


def wait_for_motion(
    pipeline: ContinuousRetainPipeline,
    *,
    threshold: float,
    on_motion: Callable[[float], None] | None = None,
) -> None:
    previous = pipeline.read_frame()
    while True:
        current = pipeline.read_frame()
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
    deadline = monotonic() + window_seconds
    while monotonic() < deadline:
        current = pipeline.read_frame()
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
