#!/usr/bin/env bash

set -euo pipefail

log() {
  printf '[winloop-deploy] %s\n' "$*"
}

error() {
  printf '[winloop-deploy][error] %s\n' "$*" >&2
}

usage() {
  cat <<'USAGE'
Usage:
  deploy-winloop-1panel.sh [options]

Options:
  --project-dir <path>          Docker Compose project directory (optional, default: cwd/auto-detect)
  --compose-file <file>         Compose file path (default: docker-compose.yml)
  --service <name>              Service name in compose (default: winloop)
  --image <repo>                Image repo, for example ghcr.io/acme/touch-win-loop (optional)
  --tag <tag>                   Image tag (default: latest)
  --image-ref <value>           Full image ref (repo:tag or repo@digest, optional)
  --bootstrap-compose           Create a minimal compose file when missing
  --bootstrap-http-port <port>  Host port for generated compose (default: 3510)
  --health-url <url>            Health check URL (default: http://127.0.0.1:3510/api/health)
  --health-attempts <number>    Health check attempts (default: 20)
  --health-interval <seconds>   Health check interval seconds (default: 3)
  --pull-only                   Only pull target image and exit, do not restart service
  --no-rollback                 Disable rollback when health check fails
  -h, --help                    Show this help

Environment fallback:
  WINLOOP_PROJECT_DIR
  WINLOOP_COMPOSE_FILE
  WINLOOP_SERVICE_NAME
  WINLOOP_IMAGE_REPO
  WINLOOP_IMAGE_TAG
  WINLOOP_IMAGE_REF
  WINLOOP_BUILD_VERSION
  WINLOOP_BUILD_COMMIT_SHA
  WINLOOP_DEFAULT_IMAGE_REPO
  WINLOOP_RUNTIME_ENV_FILES
  WINLOOP_FORCE_RECREATE=true|false
  WINLOOP_BOOTSTRAP_COMPOSE=true|false
  WINLOOP_BOOTSTRAP_HTTP_PORT
  WINLOOP_HEALTHCHECK_URL
  WINLOOP_HEALTHCHECK_ATTEMPTS
  WINLOOP_HEALTHCHECK_INTERVAL_SEC
  WINLOOP_ROLLBACK_ON_FAILURE=true|false
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Missing required command: $1"
    exit 1
  fi
}

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

to_bool() {
  local raw
  raw="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    1|true|yes|y|on) echo "true" ;;
    0|false|no|n|off) echo "false" ;;
    *)
      error "Invalid boolean value: $1"
      exit 1
      ;;
  esac
}

escape_regex() {
  sed 's/[][(){}.^$?+*|\\/]/\\&/g' <<<"$1"
}

trim_spaces() {
  local value="$1"
  value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//;s/[[:space:]]+$//')"
  printf '%s' "$value"
}

normalize_image_ref() {
  local raw
  raw="$(printf '%s' "$1" | tr -d '\r' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  raw="${raw#\"}"
  raw="${raw%\"}"
  raw="${raw#\'}"
  raw="${raw%\'}"
  printf '%s' "$raw"
}

resolve_runtime_env_file_list() {
  local raw_list="$1"
  local item=""
  local candidate=""
  local -a temp_list=()

  IFS=',' read -r -a temp_list <<< "$raw_list"
  for item in "${temp_list[@]}"; do
    item="$(trim_spaces "$item")"
    if [[ -z "$item" ]]; then
      continue
    fi

    if [[ "$item" == /* ]]; then
      candidate="$item"
    else
      candidate="$PROJECT_DIR/$item"
    fi

    if [[ -f "$candidate" ]]; then
      RUNTIME_ENV_FILE_PATHS+=("$candidate")
    fi
  done
}

load_runtime_env_files() {
  local env_file=""
  if [[ ${#RUNTIME_ENV_FILE_PATHS[@]} -eq 0 ]]; then
    log "Runtime env files: <none>"
    return
  fi

  log "Runtime env files: ${RUNTIME_ENV_FILE_PATHS[*]}"
  for env_file in "${RUNTIME_ENV_FILE_PATHS[@]}"; do
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  done
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
  error "docker compose / docker-compose is not available"
  exit 1
}

resolve_compose_file_path() {
  if [[ "$COMPOSE_FILE" == /* ]]; then
    printf '%s' "$COMPOSE_FILE"
    return 0
  fi
  printf '%s/%s' "$PROJECT_DIR" "$COMPOSE_FILE"
}

extract_image_ref_from_compose_service() {
  local service="$1"
  local file="$2"
  awk -v service="$service" '
    BEGIN {
      in_services = 0
      in_target = 0
    }
    /^[[:space:]]*services:[[:space:]]*$/ {
      in_services = 1
      next
    }
    in_services == 1 && /^[^[:space:]]/ {
      in_services = 0
      in_target = 0
    }
    in_services == 1 && $0 ~ ("^[[:space:]]{2}" service ":[[:space:]]*$") {
      in_target = 1
      next
    }
    in_target == 1 && $0 ~ "^[[:space:]]{2}[A-Za-z0-9_.-]+:[[:space:]]*$" {
      in_target = 0
    }
    in_target == 1 && $0 ~ "^[[:space:]]{4}image:[[:space:]]*" {
      sub("^[[:space:]]{4}image:[[:space:]]*", "", $0)
      print $0
      exit
    }
  ' "$file"
}

extract_winloop_image_ref_from_compose() {
  local file="$1"
  awk '
    /^[[:space:]]*image:[[:space:]]*/ {
      value = $0
      sub("^[[:space:]]*image:[[:space:]]*", "", value)
      lower = tolower(value)
      if (lower ~ /touch-win-loop/) {
        print value
        exit
      }
    }
  ' "$file"
}

extract_service_by_image_ref() {
  local image_ref="$1"
  local file="$2"
  local escaped
  escaped="$(escape_regex "$image_ref")"
  awk -v image_ref="$escaped" '
    BEGIN {
      in_services = 0
      current = ""
    }
    /^[[:space:]]*services:[[:space:]]*$/ {
      in_services = 1
      next
    }
    in_services == 1 && /^[^[:space:]]/ {
      in_services = 0
      current = ""
    }
    in_services == 1 && match($0, /^[[:space:]]{2}([A-Za-z0-9_.-]+):[[:space:]]*$/, m) {
      current = m[1]
      next
    }
    in_services == 1 && current != "" && $0 ~ "^[[:space:]]{4}image:[[:space:]]*" {
      value = $0
      sub("^[[:space:]]{4}image:[[:space:]]*", "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (value ~ image_ref) {
        print current
        exit
      }
    }
  ' "$file"
}

resolve_image_from_compose() {
  local compose_path="$1"
  local from_service=""
  local from_winloop=""

  from_service="$(extract_image_ref_from_compose_service "$SERVICE_NAME" "$compose_path" || true)"
  from_service="$(normalize_image_ref "$from_service")"
  if [[ -n "$from_service" ]]; then
    printf '%s' "$from_service"
    return 0
  fi

  from_winloop="$(extract_winloop_image_ref_from_compose "$compose_path" || true)"
  from_winloop="$(normalize_image_ref "$from_winloop")"
  if [[ -n "$from_winloop" ]]; then
    local resolved_service
    resolved_service="$(extract_service_by_image_ref "$from_winloop" "$compose_path" || true)"
    resolved_service="$(printf '%s' "$resolved_service" | tr -d '\r' | xargs)"
    if [[ -n "$resolved_service" && "$resolved_service" != "$SERVICE_NAME" ]]; then
      SERVICE_NAME="$resolved_service"
      log "Auto-detected service name: $SERVICE_NAME"
    fi
    printf '%s' "$from_winloop"
    return 0
  fi

  return 1
}

autodetect_compose_target() {
  local image_repo_regex=""
  if [[ -n "$IMAGE_REPO" ]]; then
    image_repo_regex="$(escape_regex "$IMAGE_REPO")"
  fi

  local best_file=""
  local best_score=-1
  local roots=()
  if [[ -n "$PROJECT_DIR" && -d "$PROJECT_DIR" ]]; then
    roots+=("$PROJECT_DIR")
  fi
  roots+=("$(pwd)")
  roots+=(
    "/opt/1panel/apps"
    "/opt/1panel/resources/apps"
    "/opt/1panel"
  )

  for root in "${roots[@]}"; do
    if [[ ! -d "$root" ]]; then
      continue
    fi

    local max_depth=4
    if [[ "$root" != /opt/1panel* ]]; then
      max_depth=2
    fi

    while IFS= read -r file; do
      local score=0
      if grep -Eq "^[[:space:]]{2}${SERVICE_NAME}:[[:space:]]*$" "$file"; then
        score=$((score + 2))
      fi
      if [[ -n "$image_repo_regex" ]] && grep -Eiq "image:[[:space:]]*${image_repo_regex}([:@][^[:space:]]*)?" "$file"; then
        score=$((score + 3))
      fi
      if grep -Eiq "image:[[:space:]]*ghcr\\.io/.*/touch-win-loop([:@][^[:space:]]*)?" "$file"; then
        score=$((score + 1))
      fi
      if [[ "$(basename "$file")" == "docker-compose.yml" ]]; then
        score=$((score + 1))
      fi
      if [[ -n "$PROJECT_DIR" && "$(cd "$(dirname "$file")" && pwd)" == "$PROJECT_DIR" ]]; then
        score=$((score + 1))
      fi

      if ((score > best_score)); then
        best_score="$score"
        best_file="$file"
      fi
    done < <(find "$root" -maxdepth "$max_depth" -type f \( -name "docker-compose.yml" -o -name "docker-compose.yaml" -o -name "compose.yml" -o -name "compose.yaml" \) 2>/dev/null)
  done

  if [[ -z "$best_file" ]]; then
    return 1
  fi
  # At least one strong signal is required (service/image match),
  # otherwise a generic docker-compose.yml may be selected by mistake.
  if ((best_score < 2)); then
    return 1
  fi

  PROJECT_DIR="$(cd "$(dirname "$best_file")" && pwd)"
  COMPOSE_FILE="$(basename "$best_file")"
  log "Auto-detected compose file: ${PROJECT_DIR}/${COMPOSE_FILE}"
  return 0
}

ensure_image_target() {
  local compose_path="$1"

  if [[ -n "$IMAGE_REF" ]]; then
    return 0
  fi

  if [[ -z "$IMAGE_REPO" ]]; then
    local detected_image_ref=""
    if [[ -f "$compose_path" ]]; then
      detected_image_ref="$(resolve_image_from_compose "$compose_path" || true)"
    fi
    detected_image_ref="$(normalize_image_ref "$detected_image_ref")"
    if [[ "$detected_image_ref" == *'$'* ]]; then
      detected_image_ref=""
    fi
    if [[ -n "$detected_image_ref" ]]; then
      IMAGE_REF="$detected_image_ref"
      log "Auto-detected image ref from compose: $IMAGE_REF"
      return 0
    fi

    IMAGE_REPO="$DEFAULT_IMAGE_REPO"
  fi

  IMAGE_REF="${IMAGE_REPO}:${IMAGE_TAG}"
  log "Resolved image ref: $IMAGE_REF"
}

bootstrap_compose_file() {
  local compose_target
  compose_target="$(resolve_compose_file_path)"
  mkdir -p "$(dirname "$compose_target")"
  cat > "$compose_target" <<EOF_COMPOSE
services:
  ${SERVICE_NAME}:
    image: ${IMAGE_REF}
    restart: unless-stopped
    ports:
      - "${BOOTSTRAP_HTTP_PORT}:3000"
    environment:
      NODE_ENV: production
      HOST: 0.0.0.0
      PORT: 3000
      NUXT_HOST: 0.0.0.0
      NUXT_PORT: 3000
      WINLOOP_STORAGE_LOCAL_ROOT: /app/tmp/document-storage
      WINLOOP_PG_URL: \${WINLOOP_PG_URL:-postgresql://winloop:password@127.0.0.1:5432/winloop}
      WINLOOP_REDIS_URL: \${WINLOOP_REDIS_URL:-redis://:password@127.0.0.1:6379/0}
    volumes:
      - "./tmp/document-storage:/app/tmp/document-storage"
EOF_COMPOSE
  log "Compose file created: $compose_target"
}

check_health() {
  if [[ -z "$HEALTHCHECK_URL" ]]; then
    return 0
  fi

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

compose_with_override() {
  "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" "$@"
}

PROJECT_DIR="${WINLOOP_PROJECT_DIR:-$(pwd)}"
COMPOSE_FILE="${WINLOOP_COMPOSE_FILE:-docker-compose.yml}"
SERVICE_NAME="${WINLOOP_SERVICE_NAME:-winloop}"
IMAGE_REPO="${WINLOOP_IMAGE_REPO:-}"
IMAGE_TAG="${WINLOOP_IMAGE_TAG:-latest}"
IMAGE_REF="${WINLOOP_IMAGE_REF:-}"
DEFAULT_IMAGE_REPO="${WINLOOP_DEFAULT_IMAGE_REPO:-ghcr.io/your-org/touch-win-loop}"
RUNTIME_ENV_FILES="${WINLOOP_RUNTIME_ENV_FILES:-.env,.env.dev,.env.prod,.env.local,.env.server}"
RUNTIME_ENV_FILE_PATHS=()
HEALTHCHECK_URL="${WINLOOP_HEALTHCHECK_URL:-http://127.0.0.1:3510/api/health}"
HEALTHCHECK_ATTEMPTS="${WINLOOP_HEALTHCHECK_ATTEMPTS:-20}"
HEALTHCHECK_INTERVAL_SEC="${WINLOOP_HEALTHCHECK_INTERVAL_SEC:-3}"
ROLLBACK_ON_FAILURE="$(to_bool "${WINLOOP_ROLLBACK_ON_FAILURE:-true}")"
FORCE_RECREATE="$(to_bool "${WINLOOP_FORCE_RECREATE:-true}")"
PULL_ONLY="false"
BOOTSTRAP_COMPOSE="$(to_bool "${WINLOOP_BOOTSTRAP_COMPOSE:-false}")"
BOOTSTRAP_HTTP_PORT="${WINLOOP_BOOTSTRAP_HTTP_PORT:-3510}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir)
      PROJECT_DIR="${2:-}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --service)
      SERVICE_NAME="${2:-}"
      shift 2
      ;;
    --image)
      IMAGE_REPO="${2:-}"
      shift 2
      ;;
    --tag)
      IMAGE_TAG="${2:-}"
      shift 2
      ;;
    --image-ref)
      IMAGE_REF="${2:-}"
      shift 2
      ;;
    --bootstrap-compose)
      BOOTSTRAP_COMPOSE="true"
      shift
      ;;
    --bootstrap-http-port)
      BOOTSTRAP_HTTP_PORT="${2:-}"
      shift 2
      ;;
    --health-url)
      HEALTHCHECK_URL="${2:-}"
      shift 2
      ;;
    --health-attempts)
      HEALTHCHECK_ATTEMPTS="${2:-}"
      shift 2
      ;;
    --health-interval)
      HEALTHCHECK_INTERVAL_SEC="${2:-}"
      shift 2
      ;;
    --pull-only)
      PULL_ONLY="true"
      shift
      ;;
    --no-rollback)
      ROLLBACK_ON_FAILURE="false"
      shift
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

if [[ ! -d "$PROJECT_DIR" ]]; then
  if [[ "$BOOTSTRAP_COMPOSE" == "true" ]]; then
    mkdir -p "$PROJECT_DIR"
    log "Project directory created: $PROJECT_DIR"
  else
    PROJECT_DIR="/opt/1panel"
    log "Project directory not found, fallback to auto-detect root: $PROJECT_DIR"
  fi
fi

if ! is_positive_integer "$HEALTHCHECK_ATTEMPTS"; then
  error "health-attempts must be a positive integer: $HEALTHCHECK_ATTEMPTS"
  exit 1
fi
if ! is_positive_integer "$HEALTHCHECK_INTERVAL_SEC"; then
  error "health-interval must be a positive integer: $HEALTHCHECK_INTERVAL_SEC"
  exit 1
fi
if ! is_positive_integer "$BOOTSTRAP_HTTP_PORT"; then
  error "bootstrap-http-port must be a positive integer: $BOOTSTRAP_HTTP_PORT"
  exit 1
fi

require_cmd docker
resolve_compose_cmd
if [[ -n "$HEALTHCHECK_URL" ]]; then
  require_cmd curl
fi

cd "$PROJECT_DIR"
if [[ ! -f "$COMPOSE_FILE" ]]; then
  if [[ "${COMPOSE_FILE}" != /* ]] && autodetect_compose_target; then
    cd "$PROJECT_DIR"
  elif [[ "$BOOTSTRAP_COMPOSE" == "true" ]]; then
    ensure_image_target "$(resolve_compose_file_path)"
    bootstrap_compose_file
  else
    error "Compose file not found: $(resolve_compose_file_path)"
    error "Hint: run from your 1Panel app path or pass --project-dir /opt/1panel/apps/touch-win-loop"
    error "Hint: pass --bootstrap-compose to auto-create a minimal compose file"
    exit 1
  fi
fi

ensure_image_target "$(resolve_compose_file_path)"
resolve_runtime_env_file_list "$RUNTIME_ENV_FILES"
load_runtime_env_files

compose_base=("${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE")
current_container_id="$("${compose_base[@]}" ps -q "$SERVICE_NAME" 2>/dev/null || true)"
previous_image=""
if [[ -n "$current_container_id" ]]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$current_container_id" 2>/dev/null || true)"
fi

OVERRIDE_FILE="$(mktemp ".winloop-image-override.XXXXXX.yml")"
cleanup() {
  rm -f "$OVERRIDE_FILE"
}
trap cleanup EXIT

write_override() {
  local image_ref="$1"
  cat > "$OVERRIDE_FILE" <<EOF_OVERRIDE
services:
  ${SERVICE_NAME}:
    image: ${image_ref}
EOF_OVERRIDE

  if [[ ${#RUNTIME_ENV_FILE_PATHS[@]} -gt 0 ]]; then
    {
      echo "    env_file:"
      for env_file in "${RUNTIME_ENV_FILE_PATHS[@]}"; do
        printf '      - "%s"\n' "$env_file"
      done
    } >> "$OVERRIDE_FILE"
  fi

  cat >> "$OVERRIDE_FILE" <<'EOF_OVERRIDE_ENV'
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      HOST: ${HOST:-0.0.0.0}
      PORT: ${PORT:-3000}
      NUXT_HOST: ${NUXT_HOST:-0.0.0.0}
      NUXT_PORT: ${NUXT_PORT:-3000}
      WINLOOP_STORAGE_LOCAL_ROOT: ${WINLOOP_STORAGE_LOCAL_ROOT:-/app/tmp/document-storage}
      WINLOOP_BUILD_VERSION: ${WINLOOP_BUILD_VERSION:-}
      WINLOOP_BUILD_COMMIT_SHA: ${WINLOOP_BUILD_COMMIT_SHA:-}
EOF_OVERRIDE_ENV
}

log "Deploy target image: $IMAGE_REF"
if [[ -n "$previous_image" ]]; then
  log "Current running image: $previous_image"
else
  log "Current running image: <none>"
fi

write_override "$IMAGE_REF"
compose_with_override pull "$SERVICE_NAME"

if [[ "$PULL_ONLY" == "true" ]]; then
  log "Pull-only mode enabled, image fetched successfully. Service was not restarted."
  exit 0
fi

if [[ "$FORCE_RECREATE" == "true" ]]; then
  compose_with_override up -d --force-recreate "$SERVICE_NAME"
else
  compose_with_override up -d "$SERVICE_NAME"
fi

if check_health; then
  log "Deployment succeeded"
  exit 0
fi

error "Deployment health check failed"
if [[ "$ROLLBACK_ON_FAILURE" != "true" ]]; then
  error "Rollback is disabled"
  exit 1
fi
if [[ -z "$previous_image" ]]; then
  error "No previous image available for rollback"
  exit 1
fi
if [[ "$previous_image" == "$IMAGE_REF" ]]; then
  error "Previous image is the same as target image, skip rollback"
  exit 1
fi

log "Rolling back to previous image: $previous_image"
write_override "$previous_image"
compose_with_override pull "$SERVICE_NAME" || true
if [[ "$FORCE_RECREATE" == "true" ]]; then
  compose_with_override up -d --force-recreate "$SERVICE_NAME"
else
  compose_with_override up -d "$SERVICE_NAME"
fi

if check_health; then
  log "Rollback succeeded"
else
  error "Rollback health check failed, manual intervention required"
  exit 1
fi
