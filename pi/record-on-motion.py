#!/usr/bin/env python3
"""
Porch recorder — approach A (continuous segments + retain on motion).

Always remux short RTSP segments to disk. Decode a cheap gray view of the
same stream for motion. On motion, retain overlapping segments, join, upload.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

_PI_DIR = Path(__file__).resolve().parent
if str(_PI_DIR) not in sys.path:
    sys.path.insert(0, str(_PI_DIR))

from record_on_motion_lib import (  # noqa: E402
    ContinuousRetainPipeline,
    activity_still_present,
    drop_incomplete_newest_segment,
    env_float,
    load_env_file,
    prune_segments_older_than,
    rtsp_substream_url,
    select_segments_overlapping_window,
    wait_for_motion,
    write_concat_list,
)

# Event window retained around motion (seconds).
PRE_ROLL_SECONDS = 4
POST_ROLL_SECONDS = 20
SEGMENT_TIME_SECONDS = 2
# Keep a little more than one visit on disk for overlap/debug.
LOCAL_RETENTION_SECONDS = 180
VISIT_CAP_SECONDS = 120
OUTPUT_DIR = Path.home() / "clips"
SEGMENT_DIR = OUTPUT_DIR / "segments"
DEVICE_ID = "pi-porch"
PORCH_ENV_PATH = Path.home() / "porch.env"
SAMPLE_WIDTH = 160
SAMPLE_HEIGHT = 90
DETECT_FPS = 5.0
DEFAULT_MOTION_THRESHOLD = 0.035
DEFAULT_IDLE_SECONDS = 3.0
DEFAULT_VISIT_COOLDOWN_SECONDS = 30.0


def load_porch_env(path: Path = PORCH_ENV_PATH) -> None:
    load_env_file(path)


load_porch_env()

API_BASE_URL = os.environ.get("PORCH_API_BASE_URL", "").rstrip("/")
RTSP_URL = os.environ.get("PORCH_RTSP_URL", "").strip()
RTSP_SAMPLE_URL = os.environ.get("PORCH_RTSP_SAMPLE_URL", "").strip()
PRIVATE_KEY_PATH = Path(
    os.environ.get(
        "PI_PORCH_PRIVATE_KEY_PATH",
        str(Path.home() / "keys" / "pi-porch-private.pem"),
    )
)
MOTION_THRESHOLD = env_float("PORCH_MOTION_THRESHOLD", DEFAULT_MOTION_THRESHOLD)
IDLE_SECONDS = env_float("PORCH_IDLE_SECONDS", DEFAULT_IDLE_SECONDS)
VISIT_COOLDOWN_SECONDS = env_float(
    "PORCH_VISIT_COOLDOWN_SECONDS", DEFAULT_VISIT_COOLDOWN_SECONDS
)
PRE_ROLL = int(env_float("PORCH_PRE_ROLL_SECONDS", float(PRE_ROLL_SECONDS)))
POST_ROLL = int(env_float("PORCH_POST_ROLL_SECONDS", float(POST_ROLL_SECONDS)))
SEGMENT_TIME = int(
    env_float("PORCH_SEGMENT_TIME_SECONDS", float(SEGMENT_TIME_SECONDS))
)
LOCAL_RETENTION = int(
    env_float("PORCH_LOCAL_RETENTION_SECONDS", float(LOCAL_RETENTION_SECONDS))
)


def require_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise SystemExit("ffmpeg not found on PATH — install ffmpeg on the LAN host")
    return path


def require_rtsp_url() -> str:
    if not RTSP_URL:
        raise SystemExit(
            "Set PORCH_RTSP_URL to the camera RTSP URL "
            "(rtsp://user:pass@host:554/stream1)"
        )
    return RTSP_URL


def pipeline_rtsp_url() -> str:
    if RTSP_SAMPLE_URL:
        return RTSP_SAMPLE_URL
    return rtsp_substream_url(require_rtsp_url())


def redacted_rtsp_host(url: str) -> str:
    return url.rsplit("@", 1)[-1] if "@" in url else "(rtsp)"


def concat_segments(
    segment_paths: list[Path],
    output_path: Path,
    ffmpeg_bin: str,
) -> None:
    if not segment_paths:
        raise RuntimeError("no retained segments to build a clip")
    list_path = output_path.with_suffix(".concat.txt")
    write_concat_list(segment_paths, list_path)
    try:
        # Re-encode: copy-concat across reset segment timestamps is unreliable.
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
            timeout=180,
        )
    finally:
        list_path.unlink(missing_ok=True)


def prune_old_clips(keep_after_epoch: float, directory: Path = OUTPUT_DIR) -> None:
    """Delete uploaded-or-abandoned clips older than the local retention window."""
    for path in directory.glob("clip-*.mp4"):
        try:
            if path.stat().st_mtime < keep_after_epoch:
                path.unlink(missing_ok=True)
        except OSError as error:
            print(f"failed to prune {path.name}: {type(error).__name__}")


def prune_local_segments(
    pipeline: ContinuousRetainPipeline,
    *,
    keep_after_epoch: float,
) -> None:
    index = pipeline.refresh_segment_index()
    for path in prune_segments_older_than(index, keep_after_epoch=keep_after_epoch):
        path.unlink(missing_ok=True)
    pipeline.refresh_segment_index()
    prune_old_clips(keep_after_epoch)


def retain_event_clip(
    pipeline: ContinuousRetainPipeline,
    *,
    ffmpeg_bin: str,
    motion_epoch: float,
    pre_roll_seconds: int,
    post_roll_seconds: int,
) -> Path:
    """
    Wait out post-roll while segments keep writing, then join overlapping
    segments for [motion - pre, motion + post].
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = OUTPUT_DIR / f"clip-{stamp}.mp4"
    window_start = motion_epoch - float(pre_roll_seconds)
    window_end = motion_epoch + float(post_roll_seconds)
    print(
        f"retaining {path.name} "
        f"(pre={pre_roll_seconds}s post={post_roll_seconds}s)"
    )
    pipeline.drain_for(float(post_roll_seconds) + float(SEGMENT_TIME))
    # Newest file is usually still open for writing — drop it before select.
    index = drop_incomplete_newest_segment(pipeline.refresh_segment_index())
    retained = select_segments_overlapping_window(
        index,
        window_start=window_start,
        window_end=window_end,
        segment_seconds=float(SEGMENT_TIME),
    )
    if not retained:
        raise RuntimeError("no complete segments overlap the retain window")
    print(f"retained {len(retained)} segments")
    concat_segments(retained, path, ffmpeg_bin)
    print(f"saved {path}")
    prune_local_segments(
        pipeline,
        keep_after_epoch=time.time() - float(LOCAL_RETENTION),
    )
    return path


def sign_request(method: str, path: str, body: dict, timestamp: str) -> str:
    payload = f"{method}{path}{json.dumps(body, separators=(',', ':'))}{timestamp}"
    result = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", str(PRIVATE_KEY_PATH)],
        input=payload.encode("utf-8"),
        capture_output=True,
        check=True,
    )
    return base64.b64encode(result.stdout).decode("ascii")


def request_upload_url(file_name: str) -> dict:
    path = "/urls/porch"
    body = {"fileName": file_name, "contentType": "video/mp4"}
    body_bytes = json.dumps(body, separators=(",", ":")).encode("utf-8")
    timestamp = str(int(time.time() * 1000))
    signature = sign_request("POST", path, body, timestamp)
    request = urllib.request.Request(
        f"{API_BASE_URL}{path}",
        data=body_bytes,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-device-id": DEVICE_ID,
            "x-signature": signature,
            "x-timestamp": timestamp,
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def upload_clip(path: Path) -> None:
    if not PRIVATE_KEY_PATH.is_file():
        raise FileNotFoundError(
            f"Porch private key missing at {PRIVATE_KEY_PATH}"
        )
    upload = request_upload_url(path.stem)
    signed_url = upload["signedUrl"]
    size = path.stat().st_size
    with path.open("rb") as handle:
        put = urllib.request.Request(
            signed_url,
            data=handle,
            method="PUT",
            headers={
                "Content-Type": "video/mp4",
                "Content-Length": str(size),
                "x-amz-server-side-encryption": "AES256",
            },
        )
        with urllib.request.urlopen(put, timeout=120) as response:
            response.read()
    print(f"uploaded {path.name}")


def _upload_failure_detail(error: BaseException) -> str:
    detail = type(error).__name__
    code = getattr(error, "code", None)
    if isinstance(code, int):
        return f"{detail} {code}"
    return detail


def upload_and_remove(path: Path, *, attempts: int = 3) -> None:
    last_error: BaseException | None = None
    for attempt in range(1, max(1, attempts) + 1):
        try:
            upload_clip(path)
        except (
            OSError,
            urllib.error.URLError,
            KeyError,
            subprocess.SubprocessError,
        ) as error:
            last_error = error
            if attempt < attempts:
                time.sleep(1.0)
            continue
        try:
            path.unlink(missing_ok=True)
        except OSError as error:
            print(f"uploaded but failed to remove {path.name}: {type(error).__name__}")
        else:
            print(f"removed local {path.name}")
        return
    detail = _upload_failure_detail(last_error) if last_error else "error"
    print(f"upload failed for {path.name}: {detail}")
    prune_old_clips(time.time() - float(LOCAL_RETENTION))


def run_once() -> None:
    """Warm continuous segments briefly, retain a window, upload."""
    if not API_BASE_URL:
        raise SystemExit(
            "Set PORCH_API_BASE_URL to the Critter Canteen API base URL"
        )
    ffmpeg_bin = require_ffmpeg()
    url = pipeline_rtsp_url()
    with ContinuousRetainPipeline(
        url,
        segment_dir=SEGMENT_DIR,
        width=SAMPLE_WIDTH,
        height=SAMPLE_HEIGHT,
        ffmpeg_bin=ffmpeg_bin,
        fps=DETECT_FPS,
        segment_time=SEGMENT_TIME,
    ) as pipeline:
        print(f"warming continuous segments on {redacted_rtsp_host(url)}")
        pipeline.drain_for(float(PRE_ROLL + SEGMENT_TIME + 1))
        motion_epoch = time.time()
        clip_path = retain_event_clip(
            pipeline,
            ffmpeg_bin=ffmpeg_bin,
            motion_epoch=motion_epoch,
            pre_roll_seconds=PRE_ROLL,
            post_roll_seconds=POST_ROLL,
        )
        upload_and_remove(clip_path)


def run_loop() -> None:
    if not API_BASE_URL:
        raise SystemExit(
            "Set PORCH_API_BASE_URL to the Critter Canteen API base URL"
        )
    ffmpeg_bin = require_ffmpeg()
    url = pipeline_rtsp_url()
    print(
        "approach A: continuous segments + retain on motion "
        f"(stream={redacted_rtsp_host(url)}, segment={SEGMENT_TIME}s, "
        f"pre={PRE_ROLL}s, post={POST_ROLL}s, threshold={MOTION_THRESHOLD})"
    )
    try:
        with ContinuousRetainPipeline(
            url,
            segment_dir=SEGMENT_DIR,
            width=SAMPLE_WIDTH,
            height=SAMPLE_HEIGHT,
            ffmpeg_bin=ffmpeg_bin,
            fps=DETECT_FPS,
            segment_time=SEGMENT_TIME,
        ) as pipeline:
            pipeline.drain_for(float(SEGMENT_TIME + 1))
            while True:
                try:
                    wait_for_motion(
                        pipeline,
                        threshold=MOTION_THRESHOLD,
                        on_motion=lambda score: print(
                            f"motion score={score:.4f}"
                        ),
                        on_tick=lambda: prune_local_segments(
                            pipeline,
                            keep_after_epoch=time.time()
                            - float(LOCAL_RETENTION),
                        ),
                    )
                    visit_started = time.monotonic()
                    motion_epoch = time.time()
                    print("visit started")
                    while time.monotonic() - visit_started < VISIT_CAP_SECONDS:
                        clip_path = retain_event_clip(
                            pipeline,
                            ffmpeg_bin=ffmpeg_bin,
                            motion_epoch=motion_epoch,
                            pre_roll_seconds=PRE_ROLL,
                            post_roll_seconds=POST_ROLL,
                        )
                        upload_and_remove(clip_path)
                        if not activity_still_present(
                            pipeline,
                            threshold=MOTION_THRESHOLD,
                            window_seconds=IDLE_SECONDS,
                        ):
                            break
                        motion_epoch = time.time()
                    else:
                        print("visit cap reached")
                    print("visit ended")
                    if VISIT_COOLDOWN_SECONDS > 0:
                        print(f"cooldown {VISIT_COOLDOWN_SECONDS}s")
                        pipeline.drain_for(VISIT_COOLDOWN_SECONDS)
                        prune_local_segments(
                            pipeline,
                            keep_after_epoch=time.time()
                            - float(LOCAL_RETENTION),
                        )
                except (RuntimeError, OSError, subprocess.SubprocessError) as error:
                    # Empty/failed harvest or transient ffmpeg — stay alive.
                    print(f"retain/upload error (continuing): {error}")
                    time.sleep(2.0)
    except KeyboardInterrupt:
        print("\nstopped")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Porch RTSP recorder — continuous retain-on-motion (approach A)"
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Warm segments, retain one window, upload, exit",
    )
    args = parser.parse_args()
    if args.once:
        run_once()
    else:
        run_loop()


if __name__ == "__main__":
    main()
