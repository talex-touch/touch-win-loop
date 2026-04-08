#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_BASE_DIR="${1:-/opt/deploy/touch-win-loop}"

mkdir -p "${DEPLOY_BASE_DIR}/staging/storage"
mkdir -p "${DEPLOY_BASE_DIR}/production/storage"

install -m 0644 "${SCRIPT_DIR}/deploy.env.example" "${DEPLOY_BASE_DIR}/staging/deploy.env"
install -m 0644 "${SCRIPT_DIR}/deploy.env.example" "${DEPLOY_BASE_DIR}/production/deploy.env"
install -m 0644 "${SCRIPT_DIR}/.env.runtime.example" "${DEPLOY_BASE_DIR}/staging/.env.runtime"
install -m 0644 "${SCRIPT_DIR}/.env.runtime.example" "${DEPLOY_BASE_DIR}/production/.env.runtime"

python3 - "${DEPLOY_BASE_DIR}" <<'PY'
import pathlib
import sys

base = pathlib.Path(sys.argv[1])
staging = base / "staging" / "deploy.env"
production = base / "production" / "deploy.env"

def replace(path: pathlib.Path, replacements: dict[str, str]) -> None:
    text = path.read_text(encoding="utf-8")
    for source, target in replacements.items():
        text = text.replace(source, target)
    path.write_text(text, encoding="utf-8")

replace(staging, {
    "COMPOSE_PROJECT_NAME=touch-win-loop-staging": "COMPOSE_PROJECT_NAME=touch-win-loop-staging",
    "HEALTHCHECK_URL=http://127.0.0.1:3511/api/health": "HEALTHCHECK_URL=http://127.0.0.1:3511/api/health",
    "APP_HOST_PORT=3511": "APP_HOST_PORT=3511",
})

replace(production, {
    "COMPOSE_PROJECT_NAME=touch-win-loop-staging": "COMPOSE_PROJECT_NAME=touch-win-loop-production",
    "HEALTHCHECK_URL=http://127.0.0.1:3511/api/health": "HEALTHCHECK_URL=http://127.0.0.1:3510/api/health",
    "APP_HOST_PORT=3511": "APP_HOST_PORT=3510",
})
PY

cat <<EOF
Initialized target layout at:
  ${DEPLOY_BASE_DIR}/staging
  ${DEPLOY_BASE_DIR}/production

Files created:
  ${DEPLOY_BASE_DIR}/staging/deploy.env
  ${DEPLOY_BASE_DIR}/staging/.env.runtime
  ${DEPLOY_BASE_DIR}/production/deploy.env
  ${DEPLOY_BASE_DIR}/production/.env.runtime

Next:
  1. Fill in sensitive values in both .env.runtime files
  2. Adjust deploy.env healthcheck/base URL/ports if needed
EOF
