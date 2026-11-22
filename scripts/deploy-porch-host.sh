#!/usr/bin/env bash
# Deploy porch recorder changes to the LAN host: SSH, git pull, restart systemd.
#
# Set DEPLOY_HOST (e.g. juzu-inui — see ~/.ssh/config Host for key + user).
# Optional:
#   PORCH_REPO_DIR  remote path to the crow-detector-server clone
#                   (default: ~/Development/crow-detector-server)
#                   Quote the value so ~ expands on the remote, not locally:
#                   PORCH_REPO_DIR='~/Development/crow-detector-server'
#   PORCH_SERVICE   systemd unit name (default: porch-recorder)
#   PORCH_GIT_REF   branch to fast-forward on the host
#                   (default: the current local branch)
#
# Usage:
#   DEPLOY_HOST=juzu-inui PORCH_GIT_REF=main ./scripts/deploy-porch-host.sh
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-}"
if [[ -z "${DEPLOY_HOST}" ]]; then
  echo "Error: DEPLOY_HOST not set. Example: DEPLOY_HOST=juzu-inui ./scripts/deploy-porch-host.sh" >&2
  exit 1
fi

# Leading ~ is expanded by the remote shell (keep it unexpanded on the Mac).
PORCH_REPO_DIR="${PORCH_REPO_DIR:-~/Development/crow-detector-server}"
PORCH_SERVICE="${PORCH_SERVICE:-porch-recorder}"
PORCH_GIT_REF="${PORCH_GIT_REF:-$(git rev-parse --abbrev-ref HEAD)}"
if [[ "${PORCH_GIT_REF}" == "HEAD" ]]; then
  echo "Error: detached HEAD; set PORCH_GIT_REF to the branch to deploy" >&2
  exit 1
fi
if [[ ! "${PORCH_GIT_REF}" =~ ^[A-Za-z0-9._/][A-Za-z0-9._/-]*$ ]]; then
  echo "Error: unsafe PORCH_GIT_REF" >&2
  exit 1
fi
if [[ ! "${PORCH_REPO_DIR}" =~ ^(~/|/)[A-Za-z0-9._/-]+$ ]] || [[ "${PORCH_REPO_DIR}" == *..* ]]; then
  echo "Error: unsafe PORCH_REPO_DIR" >&2
  exit 1
fi
if [[ ! "${PORCH_SERVICE}" =~ ^[A-Za-z][A-Za-z0-9:_.@-]*$ ]]; then
  echo "Error: unsafe PORCH_SERVICE" >&2
  exit 1
fi

ssh "${DEPLOY_HOST}" "set -euo pipefail
  cd ${PORCH_REPO_DIR}
  git fetch origin
  git checkout \"${PORCH_GIT_REF}\" || git checkout -b \"${PORCH_GIT_REF}\" \"origin/${PORCH_GIT_REF}\"
  git pull --ff-only origin \"${PORCH_GIT_REF}\"
  sudo systemctl restart \"${PORCH_SERVICE}\"
  sudo systemctl --no-pager --full status \"${PORCH_SERVICE}\" | head -20
"

echo "Deployed porch recorder on ${DEPLOY_HOST} (${PORCH_SERVICE} restarted)."
