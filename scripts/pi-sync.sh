#!/usr/bin/env bash
# Copy the porch recorder and public API base URL to the Pi, then restart it.
# Private keys stay on the device. Use npm run pi:start to restart without copying.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${ROOT_DIR}/pi/record-on-motion.py"
HOST="${PI_HOST:-juzo-inui@critter-cam.local}"
KEY="${PI_SSH_KEY:-${HOME}/.ssh/critter-cam}"
DEST="${PI_REMOTE_PATH:-/home/juzo-inui/record-on-motion.py}"
REMOTE_ENV="${PI_REMOTE_ENV_PATH:-/home/juzo-inui/porch.env}"
# Public API host for uploads. Override with PORCH_API_BASE_URL when syncing.
API_BASE="${PORCH_API_BASE_URL:-https://api-dev.crittercanteen.com}"

if [[ ! -f "${SOURCE}" ]]; then
  echo "missing recorder at ${SOURCE}" >&2
  exit 1
fi

if [[ ! -f "${KEY}" ]]; then
  echo "missing SSH key at ${KEY}" >&2
  exit 1
fi

ENV_TMP="$(mktemp)"
trap 'rm -f "${ENV_TMP}"' EXIT
printf 'PORCH_API_BASE_URL=%s\n' "${API_BASE}" > "${ENV_TMP}"

scp -i "${KEY}" "${SOURCE}" "${HOST}:${DEST}"
scp -i "${KEY}" "${ENV_TMP}" "${HOST}:${REMOTE_ENV}"
ssh -i "${KEY}" "${HOST}" "chmod 600 '${REMOTE_ENV}'"

echo "synced ${SOURCE} -> ${HOST}:${DEST}"
echo "wrote ${REMOTE_ENV} with PORCH_API_BASE_URL=${API_BASE}"

bash "${ROOT_DIR}/scripts/pi-start.sh"
