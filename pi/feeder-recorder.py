#!/usr/bin/env python3
"""Feeder host recorder.

The default loop only claims dispense proofs. Animal visits are a separate
run: ``python3 pi/feeder-recorder.py --visit-once``.

Reads ~/feeder.env. Does not use the porch camera URL or porch systemd unit.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

_PI_DIR = Path(__file__).resolve().parent
if str(_PI_DIR) not in sys.path:
    sys.path.insert(0, str(_PI_DIR))

from record_on_motion_lib import load_env_file  # noqa: E402

STAGING_DIR = Path.home() / "feeder-staging"
ENV_PATH = Path.home() / "feeder.env"
DEVICE_ID = "pi-feeder"
PROOF_SECONDS = 12
STAGING_TTL_SECONDS = 45 * 60


def load_feeder_env(path: Path = ENV_PATH) -> None:
    load_env_file(path)


load_feeder_env()

API_BASE_URL = os.environ.get("FEEDER_API_BASE_URL", "").rstrip("/")
RTSP_URL = os.environ.get("FEEDER_RTSP_URL", "").strip()
PRIVATE_KEY_PATH = Path(
    os.environ.get(
        "PI_FEEDER_PRIVATE_KEY_PATH",
        str(Path.home() / "keys" / "pi-feeder-private.pem"),
    )
)


def canonical_json(body: dict) -> str:
    """Match JSON.stringify: keep non-ASCII characters and escape line separators."""
    encoded = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    return encoded.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def sign_request(method: str, path: str, canonical_body: str, timestamp: str) -> str:
    payload = f"{method}{path}{canonical_body}{timestamp}"
    result = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", str(PRIVATE_KEY_PATH)],
        input=payload.encode("utf-8"),
        capture_output=True,
        check=True,
    )
    return base64.b64encode(result.stdout).decode("ascii")


def api_json(method: str, path: str, body: dict | None = None) -> dict:
    payload = body if body is not None else {}
    raw_text = canonical_json(payload)
    raw = raw_text.encode("utf-8")
    timestamp = str(int(time.time() * 1000))
    signature = sign_request(method, path, raw_text, timestamp)
    request = urllib.request.Request(
        f"{API_BASE_URL}{path}",
        data=raw if method != "GET" else None,
        method=method,
        headers={
            "Content-Type": "application/json",
            "x-device-id": DEVICE_ID,
            "x-signature": signature,
            "x-timestamp": timestamp,
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def sweep_staging(now: float | None = None, ttl_seconds: int = STAGING_TTL_SECONDS) -> list[Path]:
    """Delete staging files older than the TTL. Safe to run if a delete failed earlier."""
    moment = time.time() if now is None else now
    removed: list[Path] = []
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    for path in STAGING_DIR.iterdir():
        if not path.is_file():
            continue
        if moment - path.stat().st_mtime > ttl_seconds:
            path.unlink(missing_ok=True)
            removed.append(path)
    return removed


def record_clip(destination: Path, seconds: int) -> None:
    if not RTSP_URL:
        raise RuntimeError("FEEDER_RTSP_URL is not set")
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-rtsp_transport",
            "tcp",
            "-i",
            RTSP_URL,
            "-t",
            str(seconds),
            "-c",
            "copy",
            "-an",
            str(destination),
        ],
        check=True,
        capture_output=True,
    )


def extract_jpeg(video: Path, jpeg: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            "1",
            "-i",
            str(video),
            "-frames:v",
            "1",
            str(jpeg),
        ],
        check=True,
        capture_output=True,
    )


def upload_mp4(path: Path) -> str:
    size = path.stat().st_size
    upload = api_json(
        "POST",
        "/urls/feeder",
        {
            "fileName": path.stem,
            "contentType": "video/mp4",
            "contentLength": size,
        },
    )
    with path.open("rb") as handle:
        put = urllib.request.Request(
            upload["signedUrl"],
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
    return upload["key"]


def handle_dispense(request_id: str) -> None:
    clip = STAGING_DIR / f"proof-{request_id}.mp4"
    finished = False
    try:
        record_clip(clip, PROOF_SECONDS)
        key = upload_mp4(clip)
        api_json(
            "PATCH",
            f"/feeder/dispense/{request_id}",
            {"status": "ready", "proofKey": key},
        )
        finished = True
    except Exception as error:
        # Exception text can include the ffmpeg argv, which holds the RTSP URL.
        print(f"proof failed for {request_id}: {type(error).__name__}")
        try:
            api_json(
                "PATCH",
                f"/feeder/dispense/{request_id}",
                {"status": "failed"},
            )
            finished = True
        except Exception:
            print(f"could not mark {request_id} failed")
    finally:
        if finished:
            clip.unlink(missing_ok=True)


def handle_visit_once(dispense_request_id: str | None = None) -> None:
    """Record a separate visit file, classify one frame, upload only if an animal is present."""
    stamp = int(time.time())
    clip = STAGING_DIR / f"visit-{stamp}.mp4"
    jpeg = STAGING_DIR / f"visit-{stamp}.jpg"
    finished = False
    try:
        record_clip(clip, PROOF_SECONDS)
        extract_jpeg(clip, jpeg)
        encoded = base64.b64encode(jpeg.read_bytes()).decode("ascii")
        analysis = api_json(
            "POST",
            "/feeder/classify",
            {"imageBase64": encoded, "mediaType": "image/jpeg"},
        )
        if not analysis.get("hasAnimals"):
            print("visit dropped: no animal")
            finished = True
            return
        key = upload_mp4(clip)
        body: dict = {
            "videoKey": key,
            "animalCount": int(analysis.get("animalCount") or 1),
            "crowCount": int(analysis.get("crowCount") or 0),
            "detectedAnimals": analysis.get("detectedAnimals") or [],
        }
        if dispense_request_id:
            body["dispenseRequestId"] = dispense_request_id
        api_json("POST", "/feeder/visits", body)
        print(f"visit published {key}")
        finished = True
    except Exception as error:
        print(f"visit failed: {type(error).__name__}")
    finally:
        if finished:
            clip.unlink(missing_ok=True)
            jpeg.unlink(missing_ok=True)


def poll_once() -> bool:
    sweep_staging()
    claimed = api_json("GET", "/feeder/dispense/pending")
    request = claimed.get("request")
    if not request:
        return False
    handle_dispense(request["id"])
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Feeder dispense and visit recorder")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Claim at most one dispense request, then exit",
    )
    parser.add_argument(
        "--visit-once",
        action="store_true",
        help="Record one visit clip, classify, upload only if an animal is present",
    )
    parser.add_argument(
        "--dispense-id",
        default="",
        help="Dispense request id to store on a --visit-once upload",
    )
    args = parser.parse_args()
    if not API_BASE_URL:
        raise SystemExit("Set FEEDER_API_BASE_URL")
    if not PRIVATE_KEY_PATH.is_file():
        raise SystemExit(f"Feeder private key missing at {PRIVATE_KEY_PATH}")
    sweep_staging()
    if args.visit_once:
        handle_visit_once(args.dispense_id or None)
        return
    if args.once:
        poll_once()
        return
    # Proofs only. Visits stay on --visit-once so a button press cannot publish a gallery clip.
    while True:
        try:
            worked = poll_once()
        except (OSError, urllib.error.URLError, subprocess.CalledProcessError) as error:
            print(f"feeder loop error: {type(error).__name__}")
            worked = False
        time.sleep(2 if not worked else 0.2)


if __name__ == "__main__":
    main()
