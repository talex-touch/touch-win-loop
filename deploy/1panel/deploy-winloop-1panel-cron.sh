#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${WINLOOP_DEPLOY_SCRIPT:-${SCRIPT_DIR}/deploy-winloop-1panel.sh}"
ENV_FILE="${WINLOOP_DEPLOY_ENV_FILE:-${SCRIPT_DIR}/winloop-deploy.env}"
LOCK_DIR="${WINLOOP_DEPLOY_LOCK_DIR:-/tmp/winloop-1panel-deploy.lock}"

log() {
  printf '[winloop-deploy-cron] %s\n' "$*"
}

release_lock() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

if [[ ! -x "$DEPLOY_SCRIPT" ]]; then
  log "deploy script not found or not executable: $DEPLOY_SCRIPT"
  exit 1
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "another deploy job is running, skip this run"
  exit 0
fi
trap release_lock EXIT INT TERM

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  log "loaded env file: $ENV_FILE"
else
  log "env file not found, running with current environment: $ENV_FILE"
fi

log "starting scheduled deploy"
"$DEPLOY_SCRIPT" "$@"
log "scheduled deploy finished"
