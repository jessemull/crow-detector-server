import tempfile
import time
import unittest
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


if __name__ == "__main__":
    unittest.main()
