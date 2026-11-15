#!/usr/bin/env bash
# Stop the porch motion recorder on the Pi if it is running.
set -euo pipefail

HOST="${PI_HOST:-juzo-inui@critter-cam.local}"
KEY="${PI_SSH_KEY:-${HOME}/.ssh/critter-cam}"
DEST="${PI_REMOTE_PATH:-/home/juzo-inui/record-on-motion.py}"

if [[ ! -f "${KEY}" ]]; then
  echo "missing SSH key at ${KEY}" >&2
  exit 1
fi

ssh -i "${KEY}" "${HOST}" "bash -s" <<REMOTE
set -euo pipefail
REC='${DEST}'
PID_FILE="\${HOME}/clips/recorder.pid"
stopped=0

if [[ -f "\${PID_FILE}" ]]; then
  old="\$(cat "\${PID_FILE}" 2>/dev/null || true)"
  if [[ -n "\${old}" ]] && kill -0 "\${old}" 2>/dev/null; then
    kill "\${old}" || true
    sleep 1
    if kill -0 "\${old}" 2>/dev/null; then
      kill -9 "\${old}" || true
      sleep 1
    fi
    stopped=1
  fi
  rm -f "\${PID_FILE}"
fi

if pkill -f "\${REC}" 2>/dev/null; then
  stopped=1
  sleep 1
fi

if [[ "\${stopped}" -eq 1 ]]; then
  echo "recorder stopped"
else
  echo "recorder was not running"
fi
REMOTE
