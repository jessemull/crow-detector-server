#!/usr/bin/env bash
# Copy the porch recorder to the Pi. Private keys stay on the device.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${ROOT_DIR}/pi/record-on-motion.py"
HOST="${PI_HOST:-juzo-inui@critter-cam.local}"
KEY="${PI_SSH_KEY:-${HOME}/.ssh/critter-cam}"
DEST="${PI_REMOTE_PATH:-/home/juzo-inui/record-on-motion.py}"

if [[ ! -f "${SOURCE}" ]]; then
  echo "missing recorder at ${SOURCE}" >&2
  exit 1
fi

if [[ ! -f "${KEY}" ]]; then
  echo "missing SSH key at ${KEY}" >&2
  exit 1
fi

scp -i "${KEY}" "${SOURCE}" "${HOST}:${DEST}"
echo "synced ${SOURCE} -> ${HOST}:${DEST}"
