#!/usr/bin/env python3
"""Record short porch clips on motion, upload them, then remove the local copy."""

from __future__ import annotations

import base64
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from gpiozero import MotionSensor

CLIP_SECONDS = 25
VISIT_CAP_SECONDS = 120
OUTPUT_DIR = Path.home() / "clips"
SENSOR_PIN = 17
WIDTH = 1280
HEIGHT = 720
# About 1.75 Mbps — clear enough for a porch visit without huge files.
BITRATE = 1_750_000
DEVICE_ID = "pi-porch"
API_BASE_URL = os.environ.get(
    "PORCH_API_BASE_URL", "https://api-dev.crittercanteen.com"
).rstrip("/")
PRIVATE_KEY_PATH = Path(
    os.environ.get(
        "PI_PORCH_PRIVATE_KEY_PATH",
        str(Path.home() / "keys" / "pi-porch-private.pem"),
    )
)


def record_clip() -> Path:
    OUTPUT_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = OUTPUT_DIR / f"clip-{stamp}.mp4"
    print(f"recording {path.name} for {CLIP_SECONDS}s")
    subprocess.run(
        [
            "rpicam-vid",
            "--nopreview",
            "--codec",
            "libav",
            "-t",
            str(CLIP_SECONDS * 1000),
            "--width",
            str(WIDTH),
            "--height",
            str(HEIGHT),
            "--bitrate",
            str(BITRATE),
            "-o",
            str(path),
        ],
        check=True,
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


def main() -> None:
    pir = MotionSensor(SENSOR_PIN)
    print("waiting for motion. Ctrl+C to stop.")
    try:
        while True:
            pir.wait_for_motion()
            visit_started = time.monotonic()
            print("visit started")
            while pir.motion_detected:
                if time.monotonic() - visit_started >= VISIT_CAP_SECONDS:
                    print("visit cap reached")
                    break
                clip_path = record_clip()
                upload_and_remove(clip_path)
            pir.wait_for_no_motion()
            print("visit ended")
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
