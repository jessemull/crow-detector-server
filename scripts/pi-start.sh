#!/usr/bin/env bash
# Restart the porch motion recorder on the Pi in the background.
# Does not copy files — run npm run pi:sync (or scp) first when the script changed.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${PI_HOST:-juzo-inui@critter-cam.local}"
KEY="${PI_SSH_KEY:-${HOME}/.ssh/critter-cam}"
DEST="${PI_REMOTE_PATH:-/home/juzo-inui/record-on-motion.py}"

if [[ ! -f "${KEY}" ]]; then
  echo "missing SSH key at ${KEY}" >&2
  exit 1
fi

bash "${ROOT_DIR}/scripts/pi-stop.sh"

# Start under nohup with a pid file. Survives SSH disconnect; does not survive
# reboot (re-run pi:start or pi:sync after boot).
ssh -i "${KEY}" "${HOST}" "bash -s" <<REMOTE
set -euo pipefail
REC='${DEST}'
LOG="\${HOME}/clips/recorder.log"
PID_FILE="\${HOME}/clips/recorder.pid"

if [[ ! -f "\${REC}" ]]; then
  echo "missing recorder at \${REC} — run npm run pi:sync first" >&2
  exit 1
fi

mkdir -p "\${HOME}/clips"

nohup python3 "\${REC}" >> "\${LOG}" 2>&1 &
echo \$! > "\${PID_FILE}"
sleep 1

if kill -0 "\$(cat "\${PID_FILE}")" 2>/dev/null; then
  echo "recorder started pid=\$(cat "\${PID_FILE}") log=\${LOG}"
else
  echo "recorder failed to start; last log lines:" >&2
  tail -n 40 "\${LOG}" >&2 || true
  exit 1
fi
REMOTE
