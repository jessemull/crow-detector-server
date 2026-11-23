# Porch recorder, Python (PY)

**Review kinds:** pr, repo
**Applies when:** any file under `pi/` or a shell or unit file that launches it is in scope. On a repo review, always.
**Policy:** `docs/DEVICES.md`, `docs/ENVIRONMENT.md` (porch recorder). **References:** Python subprocess docs, Bandit `subprocess` rules, systemd.exec hardening.

## How to review

`pi/record-on-motion.py` and `pi/record_on_motion_lib.py` run for days under systemd. They spawn ffmpeg, watch disk, and sign uploads. A stuck pipe, a leaked RTSP password, or a signing string that drifts from the guard breaks the shelter camera quietly.

There is no ruff or mypy config in this repo. Check by hand what those tools would flag.

## Criteria

- **PY-01** (MUST) `subprocess` and ffmpeg are invoked with an argument list, never `shell=True` and never a string built from the RTSP URL. Verify: read every `Popen`, `run`, and `call`.
- **PY-02** (MUST) The RTSP URL, which contains the camera user and password, is not logged, not placed in argv of a command that shows up in `ps` beyond ffmpeg itself, and not written into error messages. Verify: read every log and exception that interpolates the URL.
- **PY-03** (MUST) ffmpeg's stdout and stderr are drained or discarded. `PIPE` without a reader deadlocks. The process is terminated and waited on when the visit ends and on SIGTERM. Verify: read the process lifecycle.
- **PY-04** (SHOULD) Threads and queues shut down on SIGTERM, queues are bounded, and intervals use `time.monotonic`. Verify: read the loop and the signal handler.
- **PY-05** (MUST) HTTP calls set a timeout and retry with backoff, and a failed upload does not delete the only local copy before the retry budget is spent. Verify: read the upload function.
- **PY-06** (MUST) The ECDSA string matches the guard. See [auth.md](auth.md) AUTH-03. Verify: compare the Python builder with `ecdsa-auth.guard.ts`.
- **PY-07** (SHOULD) Segment files are written so a crash cannot upload a partial file, and pruning cannot delete a segment that is still being uploaded. Verify: read the write and the prune.
- **PY-08** (SHOULD) Secrets are read from the environment file, not hardcoded. The unit's `EnvironmentFile` is documented as mode 600. Verify: read `pi/porch.env.example` and `scripts/porch-recorder.service`.
- **PY-09** (SHOULD) Tests do not need the network, ffmpeg, or a real clock, and they cover the signing string, the motion threshold edges, and the failure path. Verify: read `pi/test_record_on_motion_lib.py`.
- **PY-10** (SHOULD) No bare `except:` and no `except Exception` that continues the loop without logging the error. Verify: search `except` in `pi/`.

## Automatic-fail signals

- `shell=True` or a shell string containing the RTSP URL.
- A signed payload that does not match the guard.
- An ffmpeg pipe that is never read.
