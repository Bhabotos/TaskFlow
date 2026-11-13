#!/usr/bin/env bash
# Runs ON the EC2 instance (as root, via SSM Run Command) from $DEPLOY_DIR.
# Required env: TASKFLOW_IMAGE, ECR_REGISTRY, AWS_REGION
# Optional env: DEPLOY_DIR (default /opt/taskflow), HEALTH_URL (default http://127.0.0.1/api/health)
# Never removes volumes: the SQLite data in the task_data volume is preserved,
# including during rollback. Images are only pulled, never built, on this host.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/taskflow}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1/api/health}"

: "${TASKFLOW_IMAGE:?TASKFLOW_IMAGE is required}"
: "${ECR_REGISTRY:?ECR_REGISTRY is required}"
: "${AWS_REGION:?AWS_REGION is required}"

for tool in docker aws curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "!! Required tool not found on instance: $tool" >&2; exit 1; }
done
docker compose version >/dev/null 2>&1 || { echo "!! Docker Compose plugin not available" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "!! Docker daemon is not running" >&2; exit 1; }

cd "$DEPLOY_DIR"
COMPOSE=(docker compose -p taskflow -f docker-compose.yml)

PREV_IMAGE=""
if [ -f .env ]; then
  PREV_IMAGE="$(grep '^TASKFLOW_IMAGE=' .env | cut -d= -f2- || true)"
fi

echo "==> Logging in to ECR ($ECR_REGISTRY)"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "==> Pulling $TASKFLOW_IMAGE"
docker pull "$TASKFLOW_IMAGE"

healthy() {
  local _
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# Start the stack with the given image. Returns non-zero if compose fails
# (e.g. web never becomes healthy) so the caller can roll back instead of
# aborting under `set -e`.
start() {
  # Compose prefers shell variables over .env, so export it too; otherwise a
  # rollback would keep using the image this script was launched with.
  export TASKFLOW_IMAGE="$1"
  echo "TASKFLOW_IMAGE=$1" > .env
  "${COMPOSE[@]}" up -d --remove-orphans || return 1
  # Nginx resolves `web` at startup; reload so it never keeps a stale container IP.
  "${COMPOSE[@]}" exec -T nginx nginx -s reload >/dev/null 2>&1 || true
  healthy
}

echo "==> Starting new version"
if start "$TASKFLOW_IMAGE"; then
  echo "==> Health check passed via $HEALTH_URL: $(curl -fsS "$HEALTH_URL")"
  docker image prune -f >/dev/null   # dangling layers only
  "${COMPOSE[@]}" ps
  exit 0
fi

echo "!! Deployment FAILED health check for $TASKFLOW_IMAGE" >&2
"${COMPOSE[@]}" ps >&2 || true
"${COMPOSE[@]}" logs --tail=50 web >&2 || true

if [ -n "$PREV_IMAGE" ] && [ "$PREV_IMAGE" != "$TASKFLOW_IMAGE" ]; then
  echo "!! Rolling back to $PREV_IMAGE (volumes are left untouched)" >&2
  if start "$PREV_IMAGE"; then
    echo "!! Rollback succeeded; deployment is still reported as failed" >&2
  else
    echo "!! Rollback ALSO failed - manual intervention required" >&2
  fi
else
  echo "!! No previous image recorded; nothing to roll back to" >&2
fi
exit 1
