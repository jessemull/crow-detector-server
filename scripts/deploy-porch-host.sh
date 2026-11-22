#!/usr/bin/env bash
# Deploy porch recorder changes to the LAN host: SSH, git pull, restart systemd.
#
# Set DEPLOY_HOST (e.g. porch@lan-laptop.local).
# Optional:
#   PORCH_REPO_DIR  remote path to the crow-detector-server clone
#                   (default: ~/crow-detector-server)
#   PORCH_SERVICE   systemd unit name (default: porch-recorder)
#   PORCH_GIT_REF   branch to fast-forward on the host
#                   (default: the current local branch)
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
PORCH_GIT_REF="${PORCH_GIT_REF:-$(git rev-parse --abbrev-ref HEAD)}"
if [[ "${PORCH_GIT_REF}" == "HEAD" ]]; then
  echo "Error: detached HEAD; set PORCH_GIT_REF to the branch to deploy" >&2
  exit 1
fi
if [[ ! "${PORCH_GIT_REF}" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "Error: unsafe PORCH_GIT_REF" >&2
  exit 1
fi

ssh "${DEPLOY_HOST}" "set -euo pipefail
  cd \"${PORCH_REPO_DIR}\"
  git fetch origin
  git checkout \"${PORCH_GIT_REF}\" || git checkout -b \"${PORCH_GIT_REF}\" \"origin/${PORCH_GIT_REF}\"
  git pull --ff-only origin \"${PORCH_GIT_REF}\"
  sudo systemctl restart \"${PORCH_SERVICE}\"
  sudo systemctl --no-pager --full status \"${PORCH_SERVICE}\" | head -20
"

echo "Deployed porch recorder on ${DEPLOY_HOST} (${PORCH_SERVICE} restarted)."
