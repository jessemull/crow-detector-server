from __future__ import annotations

import contextlib
import io
import subprocess
import tempfile
import time
import unittest
import urllib.error
from pathlib import Path
import importlib.util

SPEC = importlib.util.spec_from_file_location(
    "feeder_recorder",
    Path(__file__).with_name("feeder-recorder.py"),
)
feeder = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(feeder)


class SweepTests(unittest.TestCase):
    def test_sweep_removes_only_expired_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "old.mp4"
            fresh = root / "fresh.mp4"
            old.write_bytes(b"old")
            fresh.write_bytes(b"new")
            old_time = time.time() - 3600
            os_utime = __import__("os").utime
            os_utime(old, (old_time, old_time))
            feeder.STAGING_DIR = root
            removed = feeder.sweep_staging(now=time.time(), ttl_seconds=600)
            self.assertEqual(removed, [old])
            self.assertFalse(old.exists())
            self.assertTrue(fresh.exists())


class SignerTests(unittest.TestCase):
    def test_canonical_json_keeps_non_ascii_characters(self) -> None:
        self.assertEqual(
            feeder.canonical_json({"detectedAnimals": [{"name": "café"}]}),
            '{"detectedAnimals":[{"name":"café"}]}',
        )

    def test_canonical_json_keeps_line_separators(self) -> None:
        encoded = feeder.canonical_json({"note": "\u2028"})
        self.assertIn("\u2028", encoded)
        self.assertNotIn("\\u2028", encoded)


class FailureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.originals = {
            "record_clip": feeder.record_clip,
            "record_motion_visit": feeder.record_motion_visit,
            "extract_jpeg": feeder.extract_jpeg,
            "upload_mp4": feeder.upload_mp4,
            "upload_mp4_once": feeder.upload_mp4_once,
            "api_json": feeder.api_json,
            "staging": feeder.STAGING_DIR,
            "sleep": feeder.time.sleep,
        }

    def tearDown(self) -> None:
        feeder.record_clip = self.originals["record_clip"]
        feeder.record_motion_visit = self.originals["record_motion_visit"]
        feeder.extract_jpeg = self.originals["extract_jpeg"]
        feeder.upload_mp4 = self.originals["upload_mp4"]
        feeder.upload_mp4_once = self.originals["upload_mp4_once"]
        feeder.api_json = self.originals["api_json"]
        feeder.STAGING_DIR = self.originals["staging"]
        feeder.time.sleep = self.originals["sleep"]

    def test_visit_failure_does_not_print_the_camera_url(self) -> None:
        feeder.RTSP_URL = "rtsp://user:s3cret@10.0.0.5/stream1"

        def boom(destination: Path) -> float:
            raise subprocess.CalledProcessError(1, ["ffmpeg", feeder.RTSP_URL])

        feeder.record_motion_visit = boom
        buffer = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp:
            feeder.STAGING_DIR = Path(tmp)
            with contextlib.redirect_stdout(buffer):
                feeder.handle_visit_once()
        self.assertNotIn("s3cret", buffer.getvalue())
        self.assertIn("CalledProcessError", buffer.getvalue())

    def test_proof_keeps_the_file_when_the_row_is_not_saved(self) -> None:
        def write_clip(destination: Path, seconds: int) -> None:
            destination.write_bytes(b"mp4")

        def fail_api(method: str, path: str, body: dict | None = None) -> dict:
            raise urllib.error.URLError("down")

        feeder.record_clip = write_clip
        feeder.upload_mp4 = lambda path: "feeder/proof.mp4"
        feeder.api_json = fail_api
        buffer = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            feeder.STAGING_DIR = root
            with contextlib.redirect_stdout(buffer):
                feeder.handle_dispense("req-1")
            self.assertTrue((root / "proof-req-1.mp4").exists())
        self.assertNotIn("s3cret", buffer.getvalue())

    def test_visit_sends_the_dispense_id_when_one_is_given(self) -> None:
        bodies: list[tuple[str, dict | None]] = []

        def write_clip(destination: Path) -> float:
            destination.write_bytes(b"mp4")
            return 30.0

        def write_jpeg(video: Path, jpeg: Path, offset_seconds: float = 1.0) -> None:
            jpeg.write_bytes(b"jpg")

        def api(method: str, path: str, body: dict | None = None) -> dict:
            bodies.append((path, body))
            if path == "/feeder/classify":
                return {
                    "hasAnimals": True,
                    "animalCount": 1,
                    "crowCount": 1,
                    "detectedAnimals": [{"name": "crow", "confidence": 1, "count": 1}],
                }
            return {"id": "visit-1"}

        feeder.record_motion_visit = write_clip
        feeder.extract_jpeg = write_jpeg
        feeder.upload_mp4 = lambda path: "feeder/visit.mp4"
        feeder.api_json = api
        dispense_id = "11111111-1111-4111-8111-111111111111"
        with tempfile.TemporaryDirectory() as tmp:
            feeder.STAGING_DIR = Path(tmp)
            with contextlib.redirect_stdout(io.StringIO()):
                feeder.handle_visit_once(dispense_id)
        visit = bodies[-1][1]
        assert visit is not None
        self.assertEqual(visit["dispenseRequestId"], dispense_id)

    def test_visit_keeps_the_file_when_a_sample_errors(self) -> None:
        calls = {"n": 0}

        def write_clip(destination: Path) -> float:
            destination.write_bytes(b"mp4")
            return 30.0

        def write_jpeg(video: Path, jpeg: Path, offset_seconds: float = 1.0) -> None:
            jpeg.write_bytes(b"jpg")

        def api(method: str, path: str, body: dict | None = None) -> dict:
            calls["n"] += 1
            if calls["n"] == 1:
                raise urllib.error.URLError("down")
            return {"hasAnimals": False, "animalCount": 0}

        feeder.record_motion_visit = write_clip
        feeder.extract_jpeg = write_jpeg
        feeder.api_json = api
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            feeder.STAGING_DIR = root
            with contextlib.redirect_stdout(io.StringIO()):
                feeder.handle_visit_once()
            clips = list(root.glob("visit-*.mp4"))
            self.assertEqual(len(clips), 1)
            self.assertTrue(clips[0].exists())

    def test_proof_retries_upload_and_removes_the_file_after_ready(self) -> None:
        attempts = {"n": 0}
        ready_while_file_existed = {"value": False}

        def write_clip(destination: Path, seconds: int) -> None:
            destination.write_bytes(b"mp4")

        def upload_once(path: Path) -> str:
            attempts["n"] += 1
            if attempts["n"] < 3:
                raise urllib.error.URLError("down")
            return "feeder/proof.mp4"

        def api(method: str, path: str, body: dict | None = None) -> dict:
            if method == "PATCH":
                ready_while_file_existed["value"] = (
                    feeder.STAGING_DIR / "proof-req-1.mp4"
                ).exists()
                assert body is not None
                self.assertEqual(body["status"], "ready")
            return {}

        feeder.record_clip = write_clip
        feeder.upload_mp4_once = upload_once
        feeder.api_json = api
        feeder.time.sleep = lambda _seconds: None
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            feeder.STAGING_DIR = root
            with contextlib.redirect_stdout(io.StringIO()):
                feeder.handle_dispense("req-1")
            self.assertFalse((root / "proof-req-1.mp4").exists())
        self.assertEqual(attempts["n"], 3)
        self.assertTrue(ready_while_file_existed["value"])


if __name__ == "__main__":
    unittest.main()
