#!/usr/bin/env bash
# Deploy porch recorder changes to the LAN host: SSH, git pull, restart systemd.
#
# Set DEPLOY_HOST (e.g. porch@lan-laptop.local).
# Optional:
#   PORCH_REPO_DIR  remote path to the crow-detector-server clone
#                   (default: ~/crow-detector-server)
#   PORCH_SERVICE   systemd unit name (default: porch-recorder)
#
# Usage: ./scripts/deploy-porch-host.sh
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-}"
if [[ -z "${DEPLOY_HOST}" ]]; then
  echo "Error: DEPLOY_HOST not set. Example: DEPLOY_HOST=porch@lan-laptop ./scripts/deploy-porch-host.sh" >&2
  exit 1
fi

PORCH_REPO_DIR="${PORCH_REPO_DIR:-~/crow-detector-server}"
PORCH_SERVICE="${PORCH_SERVICE:-porch-recorder}"

ssh "${DEPLOY_HOST}" "set -euo pipefail
  cd ${PORCH_REPO_DIR}
  git pull
  sudo systemctl restart ${PORCH_SERVICE}
  sudo systemctl --no-pager --full status ${PORCH_SERVICE} | head -20
"

echo "Deployed porch recorder on ${DEPLOY_HOST} (${PORCH_SERVICE} restarted)."
