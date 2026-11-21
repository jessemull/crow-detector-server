"""Testable helpers for the porch RTSP recorder (no I/O side effects at import)."""

from __future__ import annotations

import os
from pathlib import Path


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
