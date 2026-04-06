#!/usr/bin/env bash

set -euo pipefail

log() {
  printf '[winloop-jenkins-deploy] %s\n' "$*"
}

error() {
  printf '[winloop-jenkins-deploy][error] %s\n' "$*" >&2
}

usage() {
  cat <<'USAGE'
Usage:
  deploy-winloop.sh --env <staging|production> --image-ref <ghcr image ref> --build-version <value> --build-commit-sha <sha>

Options:
  --env <name>                  Deploy environment, only staging or production
  --image-ref <value>           Immutable image reference, for example ghcr.io/acme/touch-win-loop@sha256:...
  --build-version <value>       Build version label
  --build-commit-sha <sha>      Build commit sha
  -h, --help                    Show this help

Environment:
  WINLOOP_DEPLOY_BASE_DIR       Base directory for all environments (default: /opt/deploy/touch-win-loop)
  WINLOOP_DEPLOY_REPORT_FILE    Output report path (default: ./deployment.json)
  WINLOOP_DEPLOY_TEMPLATE_FILE  Compose template path (default: deploy/jenkins/compose.yaml)
  WINLOOP_DEPLOY_LOCK_ROOT      Lock directory root (default: /tmp/winloop-deploy-locks)
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Missing required command: $1"
    exit 1
  fi
}

is_positive_integer() {
  [[ "${1:-}" =~ ^[1-9][0-9]*$ ]]
}

to_bool() {
  local raw
  raw="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    1|true|yes|y|on) printf 'true' ;;
    0|false|no|n|off) printf 'false' ;;
    *)
      error "Invalid boolean value: $1"
      exit 1
      ;;
  esac
}

resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return
  fi
  error "docker compose / docker-compose is not available on the target host"
  exit 1
}

resolve_path() {
  local raw_path="$1"
  local base_dir="$2"
  if [[ "$raw_path" == /* ]]; then
    printf '%s' "$raw_path"
    return 0
  fi
  printf '%s/%s' "$base_dir" "$raw_path"
}

load_env_file() {
  local env_file="$1"
  if [[ ! -f "$env_file" ]]; then
    error "Env file not found: $env_file"
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

check_health() {
  local attempt
  for ((attempt = 1; attempt <= HEALTHCHECK_ATTEMPTS; attempt++)); do
    if curl --fail --silent --show-error --max-time 10 "$HEALTHCHECK_URL" >/dev/null; then
      log "Health check passed on attempt $attempt/$HEALTHCHECK_ATTEMPTS"
      return 0
    fi
    log "Health check failed on attempt $attempt/$HEALTHCHECK_ATTEMPTS, waiting ${HEALTHCHECK_INTERVAL_SEC}s"
    sleep "$HEALTHCHECK_INTERVAL_SEC"
  done
  return 1
}

write_report() {
  python3 - "$REPORT_FILE" <<'PY'
import json
import os
import sys

report_file = sys.argv[1]
payload = {
    "status": os.environ.get("REPORT_STATUS", "failed"),
    "stage": os.environ.get("REPORT_STAGE", "unknown"),
    "message": os.environ.get("REPORT_MESSAGE", ""),
    "environment": os.environ.get("REPORT_DEPLOY_ENV", ""),
    "targetDir": os.environ.get("REPORT_TARGET_DIR", ""),
    "composeProjectName": os.environ.get("REPORT_COMPOSE_PROJECT_NAME", ""),
    "serviceName": os.environ.get("REPORT_SERVICE_NAME", ""),
    "imageRef": os.environ.get("REPORT_IMAGE_REF", ""),
    "previousImage": os.environ.get("REPORT_PREVIOUS_IMAGE", ""),
    "rolledBack": os.environ.get("REPORT_ROLLED_BACK", "false").lower() == "true",
    "healthcheckUrl": os.environ.get("REPORT_HEALTHCHECK_URL", ""),
    "buildVersion": os.environ.get("REPORT_BUILD_VERSION", ""),
    "buildCommitSha": os.environ.get("REPORT_BUILD_COMMIT_SHA", ""),
    "startedAt": os.environ.get("REPORT_STARTED_AT", ""),
    "finishedAt": os.environ.get("REPORT_FINISHED_AT", ""),
}
with open(report_file, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, ensure_ascii=False)
    handle.write("\n")
PY
}

compose_with_override() {
  "${COMPOSE_CMD[@]}" --project-name "$COMPOSE_PROJECT_NAME" -f "$TARGET_COMPOSE_PATH" -f "$OVERRIDE_FILE" "$@"
}

DEPLOY_ENV=""
IMAGE_REF=""
BUILD_VERSION=""
BUILD_COMMIT_SHA=""
DEPLOY_BASE_DIR="${WINLOOP_DEPLOY_BASE_DIR:-/opt/deploy/touch-win-loop}"
REPORT_FILE="${WINLOOP_DEPLOY_REPORT_FILE:-$PWD/deployment.json}"
TEMPLATE_FILE="${WINLOOP_DEPLOY_TEMPLATE_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/compose.yaml}"
LOCK_ROOT="${WINLOOP_DEPLOY_LOCK_ROOT:-/tmp/winloop-deploy-locks}"
REPORT_STATUS="failed"
REPORT_STAGE="init"
REPORT_MESSAGE=""
REPORT_ROLLED_BACK="false"
REPORT_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
REPORT_FINISHED_AT=""
REPORT_DEPLOY_ENV=""
REPORT_TARGET_DIR=""
REPORT_COMPOSE_PROJECT_NAME=""
REPORT_SERVICE_NAME=""
REPORT_IMAGE_REF=""
REPORT_PREVIOUS_IMAGE=""
REPORT_HEALTHCHECK_URL=""
REPORT_BUILD_VERSION=""
REPORT_BUILD_COMMIT_SHA=""
OVERRIDE_FILE=""

on_exit() {
  REPORT_FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  export REPORT_STATUS REPORT_STAGE REPORT_MESSAGE REPORT_ROLLED_BACK REPORT_STARTED_AT REPORT_FINISHED_AT
  export REPORT_DEPLOY_ENV REPORT_TARGET_DIR REPORT_COMPOSE_PROJECT_NAME REPORT_SERVICE_NAME
  export REPORT_IMAGE_REF REPORT_PREVIOUS_IMAGE REPORT_HEALTHCHECK_URL REPORT_BUILD_VERSION REPORT_BUILD_COMMIT_SHA
  if [[ -n "$OVERRIDE_FILE" ]]; then
    rm -f "$OVERRIDE_FILE"
  fi
  if [[ -n "${LOCK_DIR:-}" ]]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
  write_report || true
}
trap 'on_exit' EXIT
trap 'exit 130' INT TERM

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      DEPLOY_ENV="${2:-}"
      shift 2
      ;;
    --image-ref)
      IMAGE_REF="${2:-}"
      shift 2
      ;;
    --build-version)
      BUILD_VERSION="${2:-}"
      shift 2
      ;;
    --build-commit-sha)
      BUILD_COMMIT_SHA="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$DEPLOY_ENV" != "staging" && "$DEPLOY_ENV" != "production" ]]; then
  error "--env only supports staging or production"
  exit 1
fi

if [[ -z "$IMAGE_REF" ]]; then
  error "--image-ref is required"
  exit 1
fi

if [[ "$IMAGE_REF" != ghcr.io/*@sha256:* ]]; then
  error "--image-ref must be an immutable GHCR digest reference"
  exit 1
fi

if [[ -z "$BUILD_VERSION" ]]; then
  error "--build-version is required"
  exit 1
fi

if [[ -z "$BUILD_COMMIT_SHA" ]]; then
  error "--build-commit-sha is required"
  exit 1
fi

require_cmd docker
require_cmd curl
require_cmd install
require_cmd python3
resolve_compose_cmd

TARGET_DIR="${DEPLOY_BASE_DIR}/${DEPLOY_ENV}"
DEPLOY_ENV_FILE_PATH="${TARGET_DIR}/deploy.env"
TARGET_COMPOSE_PATH="${TARGET_DIR}/compose.yaml"
LOCK_DIR="${LOCK_ROOT}/touch-win-loop-${DEPLOY_ENV}.lock"

REPORT_DEPLOY_ENV="$DEPLOY_ENV"
REPORT_TARGET_DIR="$TARGET_DIR"
REPORT_IMAGE_REF="$IMAGE_REF"
REPORT_BUILD_VERSION="$BUILD_VERSION"
REPORT_BUILD_COMMIT_SHA="$BUILD_COMMIT_SHA"

if [[ ! -f "$TEMPLATE_FILE" ]]; then
  error "Compose template not found: $TEMPLATE_FILE"
  exit 1
fi

if [[ ! -f "$DEPLOY_ENV_FILE_PATH" ]]; then
  error "deploy.env not found: $DEPLOY_ENV_FILE_PATH"
  exit 1
fi

mkdir -p "$LOCK_ROOT"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  error "Another ${DEPLOY_ENV} deployment is already running"
  exit 1
fi

REPORT_STAGE="load_env"
load_env_file "$DEPLOY_ENV_FILE_PATH"

SERVICE_NAME="${SERVICE_NAME:-winloop}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-touch-win-loop-${DEPLOY_ENV}}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-.env.runtime}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3510/api/health}"
HEALTHCHECK_ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-20}"
HEALTHCHECK_INTERVAL_SEC="${HEALTHCHECK_INTERVAL_SEC:-3}"
ROLLBACK_ON_FAILURE="$(to_bool "${ROLLBACK_ON_FAILURE:-true}")"
FORCE_RECREATE="$(to_bool "${FORCE_RECREATE:-true}")"
STORAGE_HOST_DIR="${STORAGE_HOST_DIR:-./storage}"
RUNTIME_ENV_FILE_PATH="$(resolve_path "$RUNTIME_ENV_FILE" "$TARGET_DIR")"

REPORT_COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME"
REPORT_SERVICE_NAME="$SERVICE_NAME"
REPORT_HEALTHCHECK_URL="$HEALTHCHECK_URL"

if ! is_positive_integer "$HEALTHCHECK_ATTEMPTS"; then
  error "HEALTHCHECK_ATTEMPTS must be a positive integer"
  exit 1
fi
if ! is_positive_integer "$HEALTHCHECK_INTERVAL_SEC"; then
  error "HEALTHCHECK_INTERVAL_SEC must be a positive integer"
  exit 1
fi

if [[ ! -f "$RUNTIME_ENV_FILE_PATH" ]]; then
  error "runtime env file not found: $RUNTIME_ENV_FILE_PATH"
  exit 1
fi

mkdir -p "$TARGET_DIR"
if [[ "$STORAGE_HOST_DIR" == /* ]]; then
  mkdir -p "$STORAGE_HOST_DIR"
else
  mkdir -p "$(resolve_path "$STORAGE_HOST_DIR" "$TARGET_DIR")"
fi

REPORT_STAGE="sync_compose"
install -m 0644 "$TEMPLATE_FILE" "$TARGET_COMPOSE_PATH"

load_env_file "$RUNTIME_ENV_FILE_PATH"
export RUNTIME_ENV_FILE

cd "$TARGET_DIR"

compose_base=("${COMPOSE_CMD[@]}" --project-name "$COMPOSE_PROJECT_NAME" -f "$TARGET_COMPOSE_PATH")
current_container_id="$("${compose_base[@]}" ps -q "$SERVICE_NAME" 2>/dev/null || true)"
previous_image=""
if [[ -n "$current_container_id" ]]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$current_container_id" 2>/dev/null || true)"
fi
REPORT_PREVIOUS_IMAGE="$previous_image"

OVERRIDE_FILE="$(mktemp)"

write_override() {
  local target_image_ref="$1"
  cat > "$OVERRIDE_FILE" <<EOF_OVERRIDE
services:
  ${SERVICE_NAME}:
    image: ${target_image_ref}
    environment:
      WINLOOP_BUILD_VERSION: ${BUILD_VERSION}
      WINLOOP_BUILD_COMMIT_SHA: ${BUILD_COMMIT_SHA}
EOF_OVERRIDE
}

log "Deploy environment: $DEPLOY_ENV"
log "Deploy target image: $IMAGE_REF"
if [[ -n "$previous_image" ]]; then
  log "Current running image: $previous_image"
else
  log "Current running image: <none>"
fi

write_override "$IMAGE_REF"

REPORT_STAGE="pull"
compose_with_override pull "$SERVICE_NAME"

REPORT_STAGE="deploy"
if [[ "$FORCE_RECREATE" == "true" ]]; then
  compose_with_override up -d --force-recreate "$SERVICE_NAME"
else
  compose_with_override up -d "$SERVICE_NAME"
fi

REPORT_STAGE="healthcheck"
if check_health; then
  REPORT_STATUS="success"
  REPORT_STAGE="completed"
  REPORT_MESSAGE="Deployment succeeded"
  log "$REPORT_MESSAGE"
  exit 0
fi

error "Deployment health check failed"
REPORT_MESSAGE="Deployment health check failed"

if [[ "$ROLLBACK_ON_FAILURE" != "true" ]]; then
  REPORT_STAGE="failed"
  exit 1
fi
if [[ -z "$previous_image" ]]; then
  REPORT_STAGE="failed"
  REPORT_MESSAGE="Deployment failed and no previous image is available for rollback"
  error "$REPORT_MESSAGE"
  exit 1
fi
if [[ "$previous_image" == "$IMAGE_REF" ]]; then
  REPORT_STAGE="failed"
  REPORT_MESSAGE="Deployment failed and previous image equals target image, rollback skipped"
  error "$REPORT_MESSAGE"
  exit 1
fi

REPORT_STAGE="rollback"
REPORT_ROLLED_BACK="true"
log "Rolling back to previous image: $previous_image"
write_override "$previous_image"
compose_with_override pull "$SERVICE_NAME" || true
if [[ "$FORCE_RECREATE" == "true" ]]; then
  compose_with_override up -d --force-recreate "$SERVICE_NAME"
else
  compose_with_override up -d "$SERVICE_NAME"
fi

if check_health; then
  REPORT_STAGE="rolled_back"
  REPORT_MESSAGE="Deployment failed, rollback succeeded"
  error "$REPORT_MESSAGE"
  exit 1
fi

REPORT_STAGE="rollback_failed"
REPORT_MESSAGE="Deployment failed and rollback health check also failed"
error "$REPORT_MESSAGE"
exit 1
