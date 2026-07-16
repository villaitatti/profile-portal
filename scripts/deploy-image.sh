#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_env DEPLOY_HOST
require_env DEPLOY_USER
require_env DEPLOY_PATH
require_env IMAGE_NAME
require_env IMAGE_TAG
require_env SSH_KEY_PATH

DEPLOY_PORT="${DEPLOY_PORT:-22}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-profile-portal}"
COMPOSE_FILE_SOURCE="${COMPOSE_FILE_SOURCE:-deploy/docker-compose.yml}"
SSH_KNOWN_HOSTS_FILE="${SSH_KNOWN_HOSTS_FILE:-$HOME/.ssh/known_hosts}"
CREATE_BACKUP="${CREATE_BACKUP:-false}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_PATH/backups}"
IMAGE_REF="${IMAGE_REF:-$IMAGE_NAME:$IMAGE_TAG}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ ! -f "$COMPOSE_FILE_SOURCE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE_SOURCE" >&2
  exit 1
fi

ssh_opts=(
  -i "$SSH_KEY_PATH"
  -p "$DEPLOY_PORT"
  -o "UserKnownHostsFile=$SSH_KNOWN_HOSTS_FILE"
  -o StrictHostKeyChecking=yes
)

quote() {
  printf '%q' "$1"
}

remote_path="$(quote "$DEPLOY_PATH")"
remote_project_name="$(quote "$COMPOSE_PROJECT_NAME")"
remote_image_name="$(quote "$IMAGE_NAME")"
remote_image_tag="$(quote "$IMAGE_TAG")"
remote_image_ref="$(quote "$IMAGE_REF")"
remote_create_backup="$(quote "$CREATE_BACKUP")"
remote_backup_dir="$(quote "$BACKUP_DIR")"
remote_healthcheck_url="$(quote "$HEALTHCHECK_URL")"

echo "Preparing $TARGET:$DEPLOY_PATH"
ssh "${ssh_opts[@]}" "$TARGET" "mkdir -p $remote_path"

echo "Uploading Docker Compose deployment file"
scp -i "$SSH_KEY_PATH" -P "$DEPLOY_PORT" \
  -o "UserKnownHostsFile=$SSH_KNOWN_HOSTS_FILE" \
  -o StrictHostKeyChecking=yes \
  "$COMPOSE_FILE_SOURCE" "$TARGET:$DEPLOY_PATH/docker-compose.yml"

if [[ -n "${REGISTRY_TOKEN:-}" ]]; then
  require_env REGISTRY_USERNAME
  echo "Logging remote Docker client into GHCR"
  printf '%s' "$REGISTRY_TOKEN" | ssh "${ssh_opts[@]}" "$TARGET" \
    "docker login ghcr.io -u $(quote "$REGISTRY_USERNAME") --password-stdin >/dev/null"
fi

echo "Deploying $IMAGE_REF"
ssh "${ssh_opts[@]}" "$TARGET" \
  "DEPLOY_PATH=$remote_path COMPOSE_PROJECT_NAME=$remote_project_name IMAGE_NAME=$remote_image_name IMAGE_TAG=$remote_image_tag IMAGE_REF=$remote_image_ref CREATE_BACKUP=$remote_create_backup BACKUP_DIR=$remote_backup_dir HEALTHCHECK_URL=$remote_healthcheck_url bash -s" <<'REMOTE'
set -euo pipefail

cd "$DEPLOY_PATH"

if [[ ! -f .env ]]; then
  echo "Missing $DEPLOY_PATH/.env. Create it on the server before deploying." >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME IMAGE_NAME IMAGE_TAG IMAGE_REF

previous_container_id="$(docker compose -f docker-compose.yml ps -q portal 2>/dev/null || true)"
previous_image_id=""
if [[ -n "$previous_container_id" ]]; then
  previous_image_id="$(docker inspect --format '{{.Image}}' "$previous_container_id" 2>/dev/null || true)"
fi

rollback_portal() {
  if [[ -z "$previous_image_id" ]]; then
    echo "No previous portal image is available for automatic rollback." >&2
    return 1
  fi

  local rollback_tag rollback_container_id rollback_health
  rollback_tag="rollback-$(date -u +%Y%m%d-%H%M%S)"
  echo "Rolling the portal application back to image $previous_image_id." >&2
  if ! docker tag "$previous_image_id" "$IMAGE_NAME:$rollback_tag"; then
    echo "Could not tag the previous portal image for rollback." >&2
    return 1
  fi
  IMAGE_REF="$IMAGE_NAME:$rollback_tag"
  export IMAGE_REF
  if ! docker compose -f docker-compose.yml up -d --no-deps portal; then
    echo "Could not recreate the portal container from the previous image." >&2
    return 1
  fi

  if ! rollback_container_id="$(docker compose -f docker-compose.yml ps -q portal)"; then
    echo "Could not inspect the rollback portal container." >&2
    return 1
  fi
  if [[ -z "$rollback_container_id" ]]; then
    echo "Rollback portal container was not created." >&2
    return 1
  fi
  for rollback_attempt in $(seq 1 40); do
    if ! rollback_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$rollback_container_id")"; then
      echo "Could not inspect rollback portal health." >&2
      return 1
    fi
    if [[ "$rollback_health" == "healthy" ]]; then
      echo "Application rollback succeeded. Database changes were not reverted." >&2
      docker compose -f docker-compose.yml ps || true
      return 0
    fi
    if [[ "$rollback_health" == "unhealthy" ]]; then
      break
    fi
    echo "Waiting for rollback healthcheck ($rollback_attempt/40): $rollback_health"
    sleep 3
  done

  echo "Application rollback failed." >&2
  docker compose -f docker-compose.yml logs --tail=120 portal || true
  return 1
}

fail_deployment() {
  local reason="$1"
  echo "$reason" >&2
  docker compose -f docker-compose.yml ps || true
  docker compose -f docker-compose.yml logs --tail=120 portal || true
  if ! rollback_portal; then
    echo "Automatic application rollback was not successful; manual recovery is required." >&2
  fi
  exit 1
}

if [[ "$CREATE_BACKUP" == "true" ]]; then
  safe_tag="${IMAGE_TAG//[^A-Za-z0-9_.-]/_}"
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  echo "Creating database backup before deploying $IMAGE_TAG"
  docker compose -f docker-compose.yml exec -T db pg_dump -U portal profile_portal \
    > "$BACKUP_DIR/profile_portal_${safe_tag}_${stamp}.sql"
fi

docker compose -f docker-compose.yml pull
if ! docker compose -f docker-compose.yml up -d --remove-orphans; then
  fail_deployment "Docker Compose failed while starting the deployment."
fi

if ! container_id="$(docker compose -f docker-compose.yml ps -q portal)"; then
  fail_deployment "Could not inspect the deployed portal container."
fi
if [[ -z "$container_id" ]]; then
  fail_deployment "Portal container was not created."
fi

for attempt in $(seq 1 40); do
  if ! health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"; then
    fail_deployment "Could not inspect portal health."
  fi
  if [[ "$health" == "healthy" ]]; then
    if [[ -n "$HEALTHCHECK_URL" ]]; then
      external_ready=false
      for external_attempt in $(seq 1 10); do
        if curl -fsS --max-time 10 "$HEALTHCHECK_URL" >/dev/null; then
          external_ready=true
          break
        fi
        echo "Waiting for external healthcheck ($external_attempt/10)"
        sleep 3
      done
      if [[ "$external_ready" != "true" ]]; then
        fail_deployment "External production healthcheck failed: $HEALTHCHECK_URL"
      fi
    fi
    if ! docker compose -f docker-compose.yml ps; then
      fail_deployment "Could not verify the final Docker Compose state."
    fi
    exit 0
  fi
  if [[ "$health" == "unhealthy" ]]; then
    fail_deployment "Portal container became unhealthy."
  fi
  echo "Waiting for portal healthcheck ($attempt/40): $health"
  sleep 3
done

fail_deployment "Portal container did not become healthy in time."
REMOTE
