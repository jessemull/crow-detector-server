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


class FailureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.originals = {
            "record_clip": feeder.record_clip,
            "extract_jpeg": feeder.extract_jpeg,
            "upload_mp4": feeder.upload_mp4,
            "api_json": feeder.api_json,
            "staging": feeder.STAGING_DIR,
        }

    def tearDown(self) -> None:
        feeder.record_clip = self.originals["record_clip"]
        feeder.extract_jpeg = self.originals["extract_jpeg"]
        feeder.upload_mp4 = self.originals["upload_mp4"]
        feeder.api_json = self.originals["api_json"]
        feeder.STAGING_DIR = self.originals["staging"]

    def test_visit_failure_does_not_print_the_camera_url(self) -> None:
        feeder.RTSP_URL = "rtsp://user:s3cret@10.0.0.5/stream1"

        def boom(destination: Path, seconds: int) -> None:
            raise subprocess.CalledProcessError(1, ["ffmpeg", feeder.RTSP_URL])

        feeder.record_clip = boom
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

        def write_clip(destination: Path, seconds: int) -> None:
            destination.write_bytes(b"mp4")

        def write_jpeg(video: Path, jpeg: Path) -> None:
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

        feeder.record_clip = write_clip
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


if __name__ == "__main__":
    unittest.main()
