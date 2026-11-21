#!/usr/bin/env python3
"""Record short porch clips from a LAN RTSP camera, upload them, remove local copies."""

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

# Allow `python pi/record-on-motion.py` without installing a package.
_PI_DIR = Path(__file__).resolve().parent
if str(_PI_DIR) not in sys.path:
    sys.path.insert(0, str(_PI_DIR))

from record_on_motion_lib import (  # noqa: E402
    load_env_file,
    mean_abs_diff_ratio,
    motion_detected,
)

CLIP_SECONDS = 25
VISIT_CAP_SECONDS = 120
OUTPUT_DIR = Path.home() / "clips"
DEVICE_ID = "pi-porch"
PORCH_ENV_PATH = Path.home() / "porch.env"
# Low-res grayscale samples for motion; full clip uses the RTSP encode path.
SAMPLE_WIDTH = 160
SAMPLE_HEIGHT = 90
DEFAULT_MOTION_THRESHOLD = 0.035
DEFAULT_POLL_SECONDS = 0.5
DEFAULT_IDLE_SECONDS = 3.0
DEFAULT_VISIT_COOLDOWN_SECONDS = 30.0


def load_porch_env(path: Path = PORCH_ENV_PATH) -> None:
    """Load host settings from ~/porch.env when the shell did not export them."""
    load_env_file(path)


load_porch_env()

API_BASE_URL = os.environ.get("PORCH_API_BASE_URL", "").rstrip("/")
RTSP_URL = os.environ.get("PORCH_RTSP_URL", "").strip()
PRIVATE_KEY_PATH = Path(
    os.environ.get(
        "PI_PORCH_PRIVATE_KEY_PATH",
        str(Path.home() / "keys" / "pi-porch-private.pem"),
    )
)
MOTION_THRESHOLD = float(
    os.environ.get("PORCH_MOTION_THRESHOLD", str(DEFAULT_MOTION_THRESHOLD))
)
POLL_SECONDS = float(os.environ.get("PORCH_MOTION_POLL_SECONDS", str(DEFAULT_POLL_SECONDS)))
IDLE_SECONDS = float(os.environ.get("PORCH_IDLE_SECONDS", str(DEFAULT_IDLE_SECONDS)))
VISIT_COOLDOWN_SECONDS = float(
    os.environ.get(
        "PORCH_VISIT_COOLDOWN_SECONDS", str(DEFAULT_VISIT_COOLDOWN_SECONDS)
    )
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


def grab_gray_frame(rtsp_url: str, ffmpeg_bin: str | None = None) -> bytes:
    """Pull one low-res grayscale frame from RTSP as raw bytes."""
    binary = ffmpeg_bin or require_ffmpeg()
    result = subprocess.run(
        [
            binary,
            "-hide_banner",
            "-loglevel",
            "error",
            "-rtsp_transport",
            "tcp",
            "-i",
            rtsp_url,
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "gray",
            "-s",
            f"{SAMPLE_WIDTH}x{SAMPLE_HEIGHT}",
            "pipe:1",
        ],
        capture_output=True,
        check=False,
        timeout=30,
    )
    expected = SAMPLE_WIDTH * SAMPLE_HEIGHT
    if result.returncode != 0 or len(result.stdout) < expected:
        err = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"failed to sample RTSP frame: {err or result.returncode}")
    return result.stdout[:expected]


def record_clip(
    rtsp_url: str | None = None,
    ffmpeg_bin: str | None = None,
    clip_seconds: int = CLIP_SECONDS,
) -> Path:
    """Record a fixed-length mp4 from RTSP into ~/clips."""
    url = rtsp_url or require_rtsp_url()
    binary = ffmpeg_bin or require_ffmpeg()
    OUTPUT_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = OUTPUT_DIR / f"clip-{stamp}.mp4"
    print(f"recording {path.name} for {clip_seconds}s")
    subprocess.run(
        [
            binary,
            "-hide_banner",
            "-loglevel",
            "error",
            "-rtsp_transport",
            "tcp",
            "-i",
            url,
            "-t",
            str(clip_seconds),
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
            str(path),
        ],
        check=True,
        timeout=clip_seconds + 60,
    )
    print(f"saved {path}")
    return path


def sign_request(method: str, path: str, body: dict, timestamp: str) -> str:
    # Match the Nest ECDSA guard: method + path + JSON.stringify(body) + timestamp.
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
    with path.open("rb") as handle:
        data = handle.read()
    put = urllib.request.Request(
        signed_url,
        data=data,
        method="PUT",
        headers={
            "Content-Type": "video/mp4",
            "x-amz-server-side-encryption": "AES256",
        },
    )
    with urllib.request.urlopen(put, timeout=120) as response:
        response.read()
    print(f"uploaded {path.name}")


def upload_and_remove(path: Path) -> None:
    try:
        upload_clip(path)
        path.unlink(missing_ok=True)
        print(f"removed local {path.name}")
    except (OSError, urllib.error.URLError, urllib.error.HTTPError, KeyError) as error:
        # Keep the file so a later sync or manual upload can retry.
        print(f"upload failed for {path.name}: {error}")


def wait_for_motion(
    rtsp_url: str,
    threshold: float = MOTION_THRESHOLD,
    poll_seconds: float = POLL_SECONDS,
) -> None:
    """Block until consecutive RTSP samples clear the motion threshold."""
    previous = grab_gray_frame(rtsp_url)
    while True:
        time.sleep(poll_seconds)
        current = grab_gray_frame(rtsp_url)
        score = mean_abs_diff_ratio(previous, current)
        previous = current
        if motion_detected(score, threshold):
            print(f"motion score={score:.4f}")
            return


def activity_still_present(
    rtsp_url: str,
    threshold: float = MOTION_THRESHOLD,
    poll_seconds: float = POLL_SECONDS,
    window_seconds: float = IDLE_SECONDS,
) -> bool:
    """True if another motion spike appears within window_seconds."""
    previous = grab_gray_frame(rtsp_url)
    deadline = time.monotonic() + window_seconds
    while time.monotonic() < deadline:
        time.sleep(poll_seconds)
        current = grab_gray_frame(rtsp_url)
        score = mean_abs_diff_ratio(previous, current)
        previous = current
        if motion_detected(score, threshold):
            return True
    return False


def run_once() -> None:
    """Record one clip and upload — laptop bring-up without waiting for motion."""
    if not API_BASE_URL:
        raise SystemExit(
            "Set PORCH_API_BASE_URL to the Critter Canteen API base URL"
        )
    require_ffmpeg()
    rtsp_url = require_rtsp_url()
    clip_path = record_clip(rtsp_url)
    upload_and_remove(clip_path)


def run_loop() -> None:
    if not API_BASE_URL:
        raise SystemExit(
            "Set PORCH_API_BASE_URL to the Critter Canteen API base URL"
        )
    require_ffmpeg()
    rtsp_url = require_rtsp_url()
    print(
        "waiting for RTSP motion "
        f"(threshold={MOTION_THRESHOLD}, poll={POLL_SECONDS}s). Ctrl+C to stop."
    )
    try:
        while True:
            wait_for_motion(rtsp_url)
            visit_started = time.monotonic()
            print("visit started")
            while time.monotonic() - visit_started < VISIT_CAP_SECONDS:
                clip_path = record_clip(rtsp_url)
                upload_and_remove(clip_path)
                if not activity_still_present(rtsp_url):
                    break
            else:
                print("visit cap reached")
            print("visit ended")
            if VISIT_COOLDOWN_SECONDS > 0:
                print(f"cooldown {VISIT_COOLDOWN_SECONDS}s")
                time.sleep(VISIT_COOLDOWN_SECONDS)
    except KeyboardInterrupt:
        print("\nstopped")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Porch RTSP recorder — motion clips to Critter Canteen"
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Record and upload a single clip, then exit",
    )
    args = parser.parse_args()
    if args.once:
        run_once()
    else:
        run_loop()


if __name__ == "__main__":
    main()
