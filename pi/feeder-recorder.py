#!/usr/bin/env python3
"""Feeder host recorder.

The default loop only claims dispense proofs. Animal visits use the same
motion detector as the shelter camera:

``python3 pi/feeder-recorder.py --visits`` watches continuously.
``python3 pi/feeder-recorder.py --visit-once`` records the next visit and exits.

Reads ~/feeder.env. Does not use the porch camera URL or porch systemd unit.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

_PI_DIR = Path(__file__).resolve().parent
if str(_PI_DIR) not in sys.path:
    sys.path.insert(0, str(_PI_DIR))

from record_on_motion_lib import (  # noqa: E402
    ContinuousRetainPipeline,
    classify_sample_offsets,
    concat_segments,
    env_float,
    follow_visit,
    load_env_file,
    motion_tracker_from_env,
    rtsp_substream_url,
    segments_covering,
    visit_limits_from_env,
    wait_for_motion,
)

STAGING_DIR = Path.home() / "feeder-staging"
ENV_PATH = Path.home() / "feeder.env"
DEVICE_ID = "pi-feeder"
PROOF_SECONDS = 12
STAGING_TTL_SECONDS = 45 * 60
SAMPLE_WIDTH = 160
SAMPLE_HEIGHT = 90
DETECT_FPS = 5.0


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


def require_animal_for_visit(
    environ: dict[str, str] | None = None,
) -> bool:
    """When true, drop visits Claude does not mark as animal. Default is off."""
    source = os.environ if environ is None else environ
    raw = source.get("FEEDER_REQUIRE_ANIMAL", "false").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def canonical_json(body: dict) -> str:
    """Match JSON.stringify: keep non-ASCII characters and raw line separators."""
    return json.dumps(body, separators=(",", ":"), ensure_ascii=False)


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
    """Record a short proof clip in the same browser-safe form as visit files.

    Visits go through concat + libx264. Proofs used to stream-copy the Tapo
    main feed, which many players and browsers reject. Encode the same way.
    """
    if not RTSP_URL:
        raise RuntimeError("FEEDER_RTSP_URL is not set")
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg not found")
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            ffmpeg_bin,
            "-hide_banner",
            "-loglevel",
            "error",
            "-rtsp_transport",
            "tcp",
            "-i",
            RTSP_URL,
            "-t",
            str(seconds),
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
            str(destination),
        ],
        check=True,
        capture_output=True,
        timeout=90,
    )


def extract_jpeg(video: Path, jpeg: Path, offset_seconds: float = 1.0) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{offset_seconds:.3f}",
            "-i",
            str(video),
            "-frames:v",
            "1",
            str(jpeg),
        ],
        check=True,
        capture_output=True,
        timeout=30,
    )


def record_motion_visit(destination: Path) -> float:
    """Wait for one compact visit on the feeder camera and write that file.

    Returns the visit length in seconds. A light change across the whole
    frame does not open a visit. Motion that returns inside the gap stays
    in this same file.
    """
    if not RTSP_URL:
        raise RuntimeError("FEEDER_RTSP_URL is not set")
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("ffmpeg not found")
    destination.parent.mkdir(parents=True, exist_ok=True)
    tracker = motion_tracker_from_env(
        "FEEDER",
        width=SAMPLE_WIDTH,
        height=SAMPLE_HEIGHT,
    )
    gap, cap = visit_limits_from_env("FEEDER")
    pre_roll = int(env_float("FEEDER_PRE_ROLL_SECONDS", 4))
    post_roll = int(env_float("FEEDER_POST_ROLL_SECONDS", 20))
    segment_time = int(env_float("FEEDER_SEGMENT_TIME_SECONDS", 2))
    with ContinuousRetainPipeline(
        rtsp_substream_url(RTSP_URL),
        segment_dir=STAGING_DIR / "segments",
        width=SAMPLE_WIDTH,
        height=SAMPLE_HEIGHT,
        ffmpeg_bin=ffmpeg_bin,
        fps=DETECT_FPS,
        segment_time=segment_time,
    ) as pipeline:
        pipeline.drain_for(float(segment_time + 1))
        sample = wait_for_motion(pipeline, tracker)
        print(
            "feeder visit started "
            f"changed={sample.changed_ratio:.3f} fill={sample.blob_fill:.2f}"
        )
        window_start, window_end, reason = follow_visit(
            pipeline,
            tracker,
            gap_seconds=gap,
            cap_seconds=cap,
            pre_roll_seconds=float(pre_roll),
            post_roll_seconds=float(post_roll),
            segment_seconds=float(segment_time),
        )
        print(f"feeder visit ended ({reason})")
        retained = segments_covering(
            pipeline,
            window_start,
            window_end,
            float(segment_time),
        )
        concat_segments(retained, destination, ffmpeg_bin)
    return max(0.0, window_end - window_start)


def classify_clip(clip: Path, duration: float) -> dict | None:
    """Strongest animal sample, or None when samples agree the frame is empty.

    A sample that errors does not count as "no animal". If any sample errors
    and none finds an animal, raise so the clip is kept and not published.
    """
    best: dict | None = None
    errors = 0
    for offset in classify_sample_offsets(duration):
        jpeg = clip.with_name(f"{clip.stem}-{int(offset * 10)}.jpg")
        try:
            extract_jpeg(clip, jpeg, offset)
            encoded = base64.b64encode(jpeg.read_bytes()).decode("ascii")
            analysis = api_json(
                "POST",
                "/feeder/classify",
                {"imageBase64": encoded, "mediaType": "image/jpeg"},
            )
        except Exception as error:
            errors += 1
            print(f"classify sample failed: {type(error).__name__}")
            continue
        finally:
            jpeg.unlink(missing_ok=True)
        if not isinstance(analysis, dict) or not analysis.get("hasAnimals"):
            continue
        count = int(analysis.get("animalCount") or 0)
        best_count = int(best.get("animalCount") or 0) if best else -1
        if best is None or count >= best_count:
            best = analysis
    if best is not None:
        return best
    if errors:
        raise RuntimeError("classify failed")
    return None


def upload_mp4(path: Path) -> str:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            return upload_mp4_once(path)
        except (OSError, urllib.error.URLError, subprocess.CalledProcessError) as error:
            last_error = error
            print(f"upload failed: {type(error).__name__}")
            if attempt < 2:
                time.sleep(1)
    assert last_error is not None
    raise last_error


def upload_mp4_once(path: Path) -> str:
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
    """Record one motion visit, classify several frames, upload only if an animal is present."""
    stamp = int(time.time())
    clip = STAGING_DIR / f"visit-{stamp}.mp4"
    finished = False
    try:
        duration = record_motion_visit(clip)
        if require_animal_for_visit():
            analysis = classify_clip(clip, duration)
            if not analysis:
                print("visit dropped: no animal")
                finished = True
                return
        else:
            print("visit classify skipped (FEEDER_REQUIRE_ANIMAL off)")
            analysis = {
                "animalCount": 1,
                "crowCount": 0,
                "detectedAnimals": [
                    {"name": "unclassified", "confidence": 0, "count": 1},
                ],
            }
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
        help=(
            "Record the next motion visit and upload it. "
            "With FEEDER_REQUIRE_ANIMAL=true, classify and drop empty frames"
        ),
    )
    parser.add_argument(
        "--visits",
        action="store_true",
        help=(
            "Watch the feeder camera and publish each motion visit. "
            "With FEEDER_REQUIRE_ANIMAL=true, require Claude animal classify"
        ),
    )
    parser.add_argument(
        "--dispense-id",
        default="",
        help="Dispense request id to store on a --visit-once upload",
    )
    args = parser.parse_args()

    def stop_for_sigterm(_signum: int, _frame: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop_for_sigterm)
    if not API_BASE_URL:
        raise SystemExit("Set FEEDER_API_BASE_URL")
    if not PRIVATE_KEY_PATH.is_file():
        raise SystemExit(f"Feeder private key missing at {PRIVATE_KEY_PATH}")
    sweep_staging()
    if args.visit_once:
        handle_visit_once(args.dispense_id or None)
        return
    if args.visits:
        # Proofs stay on the default loop so a button press cannot publish a gallery clip.
        while True:
            handle_visit_once()
            time.sleep(2)
    if args.once:
        poll_once()
        return
    while True:
        try:
            worked = poll_once()
        except (OSError, urllib.error.URLError, subprocess.CalledProcessError) as error:
            print(f"feeder loop error: {type(error).__name__}")
            worked = False
        time.sleep(2 if not worked else 0.2)


if __name__ == "__main__":
    main()
