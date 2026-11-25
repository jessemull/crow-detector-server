#!/usr/bin/env bash
# Copy the porch recorder and public API base URL to the Pi, then restart it.
# Private keys and other porch.env entries stay on the device.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${ROOT_DIR}/pi/record-on-motion.py"
LIB="${ROOT_DIR}/pi/record_on_motion_lib.py"
HOST="${PI_HOST:-juzo-inui@critter-cam.local}"
KEY="${PI_SSH_KEY:-${HOME}/.ssh/critter-cam}"
DEST="${PI_REMOTE_PATH:-/home/juzo-inui/record-on-motion.py}"
REMOTE_ENV="${PI_REMOTE_ENV_PATH:-/home/juzo-inui/porch.env}"
API_BASE="${PORCH_API_BASE_URL:-https://api-dev.crittercanteen.com}"
DEST_DIR="$(dirname "${DEST}")"
LIB_DEST="${DEST_DIR}/record_on_motion_lib.py"

if [[ ! -f "${SOURCE}" || ! -f "${LIB}" ]]; then
  echo "missing recorder or helper under ${ROOT_DIR}/pi" >&2
  exit 1
fi

if [[ ! -f "${KEY}" ]]; then
  echo "missing SSH key at ${KEY}" >&2
  exit 1
fi

scp -i "${KEY}" "${SOURCE}" "${HOST}:${DEST}"
scp -i "${KEY}" "${LIB}" "${HOST}:${LIB_DEST}"

ssh -i "${KEY}" "${HOST}" bash -s -- "${REMOTE_ENV}" "${API_BASE}" << 'REMOTE'
set -euo pipefail
remote_env="$1"
api_base="$2"
tmp="$(mktemp)"
if [[ -f "${remote_env}" ]]; then
  grep -v '^PORCH_API_BASE_URL=' "${remote_env}" > "${tmp}" || true
fi
printf 'PORCH_API_BASE_URL=%s\n' "${api_base}" >> "${tmp}"
install -m 600 "${tmp}" "${remote_env}"
rm -f "${tmp}"
REMOTE

echo "synced ${SOURCE} -> ${HOST}:${DEST}"
echo "synced ${LIB} -> ${HOST}:${LIB_DEST}"
echo "updated PORCH_API_BASE_URL in ${REMOTE_ENV}"

bash "${ROOT_DIR}/scripts/pi-start.sh"
