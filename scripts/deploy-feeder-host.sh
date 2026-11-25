#!/usr/bin/env bash
# Deploy feeder recorder changes to the LAN host: SSH, git pull, restart systemd.
#
# Set DEPLOY_HOST (e.g. juzu-inui — see ~/.ssh/config Host for key + user).
# Optional:
#   FEEDER_REPO_DIR  remote path to the crow-detector-server clone
#                    (default: ~/Development/crow-detector-server)
#                    Quote the value so ~ expands on the remote, not locally:
#                    FEEDER_REPO_DIR='~/Development/crow-detector-server'
#   FEEDER_SERVICE   systemd unit name (default: feeder-recorder)
#   FEEDER_GIT_REF   branch to fast-forward on the host
#                    (default: the current local branch)
#
# Usage:
#   DEPLOY_HOST=juzu-inui FEEDER_GIT_REF=feat/feeder-video ./scripts/deploy-feeder-host.sh
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-}"
if [[ -z "${DEPLOY_HOST}" ]]; then
  echo "Error: DEPLOY_HOST not set. Example: DEPLOY_HOST=juzu-inui ./scripts/deploy-feeder-host.sh" >&2
  exit 1
fi

# Leading ~ is expanded by the remote shell (keep it unexpanded on the Mac).
FEEDER_REPO_DIR="${FEEDER_REPO_DIR:-~/Development/crow-detector-server}"
FEEDER_SERVICE="${FEEDER_SERVICE:-feeder-recorder}"
FEEDER_GIT_REF="${FEEDER_GIT_REF:-$(git rev-parse --abbrev-ref HEAD)}"
if [[ "${FEEDER_GIT_REF}" == "HEAD" ]]; then
  echo "Error: detached HEAD; set FEEDER_GIT_REF to the branch to deploy" >&2
  exit 1
fi
if [[ ! "${FEEDER_GIT_REF}" =~ ^[A-Za-z0-9._/][A-Za-z0-9._/-]*$ ]]; then
  echo "Error: unsafe FEEDER_GIT_REF" >&2
  exit 1
fi
if [[ ! "${FEEDER_REPO_DIR}" =~ ^(~/|/)[A-Za-z0-9._/-]+$ ]] || [[ "${FEEDER_REPO_DIR}" == *..* ]]; then
  echo "Error: unsafe FEEDER_REPO_DIR" >&2
  exit 1
fi
if [[ ! "${FEEDER_SERVICE}" =~ ^[A-Za-z][A-Za-z0-9:_.@-]*$ ]]; then
  echo "Error: unsafe FEEDER_SERVICE" >&2
  exit 1
fi

ssh "${DEPLOY_HOST}" "set -euo pipefail
  cd ${FEEDER_REPO_DIR}
  git fetch origin
  git checkout \"${FEEDER_GIT_REF}\" || git checkout -b \"${FEEDER_GIT_REF}\" \"origin/${FEEDER_GIT_REF}\"
  git pull --ff-only origin \"${FEEDER_GIT_REF}\"
  sudo systemctl restart \"${FEEDER_SERVICE}\"
  sudo systemctl --no-pager --full status \"${FEEDER_SERVICE}\" | head -20
"

echo "Deployed feeder recorder on ${DEPLOY_HOST} (${FEEDER_SERVICE} restarted)."
