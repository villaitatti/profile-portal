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
# Readiness budget. docker-entrypoint.sh runs `prisma migrate deploy` before the
# server listens, so a release with a slow migration is legitimately not ready
# for minutes. The old 40x3s=120s budget could declare failure and roll the app
# image back while the NEW schema had already been committed — precisely the
# old-code/new-schema mismatch that needs manual recovery. The default budget
# below (150 x 4s = 10 minutes) comfortably exceeds the container healthcheck's
# 180s start_period in deploy/docker-compose.yml.
READY_WAIT_ATTEMPTS="${READY_WAIT_ATTEMPTS:-150}"
READY_WAIT_INTERVAL="${READY_WAIT_INTERVAL:-4}"
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
remote_ready_attempts="$(quote "$READY_WAIT_ATTEMPTS")"
remote_ready_interval="$(quote "$READY_WAIT_INTERVAL")"
remote_env_prefix="DEPLOY_PATH=$remote_path COMPOSE_PROJECT_NAME=$remote_project_name IMAGE_NAME=$remote_image_name IMAGE_TAG=$remote_image_tag IMAGE_REF=$remote_image_ref CREATE_BACKUP=$remote_create_backup BACKUP_DIR=$remote_backup_dir READY_WAIT_ATTEMPTS=$remote_ready_attempts READY_WAIT_INTERVAL=$remote_ready_interval"

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

# Shared preamble for every remote invocation: environment setup plus the
# rollback function, so the post-deploy external healthcheck (which runs on
# this machine, not the VM) can trigger the same rollback in a later SSH call.
remote_lib="$(cat <<'REMOTE_LIB'
set -euo pipefail

cd "$DEPLOY_PATH"

export COMPOSE_PROJECT_NAME IMAGE_NAME IMAGE_TAG IMAGE_REF

READY_WAIT_ATTEMPTS="${READY_WAIT_ATTEMPTS:-150}"
READY_WAIT_INTERVAL="${READY_WAIT_INTERVAL:-4}"

# Printed on every failure path. docker-entrypoint.sh runs `prisma migrate
# deploy` BEFORE the server starts listening, so by the time a readiness check
# fails the new schema is very often already committed. Rolling the image back
# does not undo that, and the operator has to know it.
warn_migration_may_be_applied() {
  cat >&2 <<'MIGRATION_WARNING'

  IMPORTANT — READ BEFORE TREATING THIS AS A CLEAN FAILURE
  The container entrypoint runs `prisma migrate deploy` BEFORE the server
  starts listening. A readiness failure therefore does NOT mean the database
  is untouched: the new schema may already be fully applied and committed.
  Rolling the application image back does NOT revert migrations.

  Next steps:
    1. Check what was applied (-w matters: the Prisma 7 CLI resolves
       prisma.config.ts from its working directory):
         docker compose -f docker-compose.yml exec -w /app/packages/server portal \
           node node_modules/prisma/build/index.js migrate status
    2. If the previous application version cannot run against the new schema,
       fix forward on the app code (preferred), or restore the pre-deploy
       database backup together with the previous image.
    3. Follow "Rollback note" and the migration recovery sequence in
       DEPLOYMENT.md before declaring this deploy recovered.

MIGRATION_WARNING
}

rollback_portal() {
  if [[ -z "${PREVIOUS_IMAGE_ID:-}" ]]; then
    echo "No previous portal image is available for automatic rollback." >&2
    return 1
  fi

  local rollback_tag rollback_container_id rollback_health
  rollback_tag="rollback-$(date -u +%Y%m%d-%H%M%S)"
  echo "Rolling the portal application back to image $PREVIOUS_IMAGE_ID." >&2
  if ! docker tag "$PREVIOUS_IMAGE_ID" "$IMAGE_NAME:$rollback_tag"; then
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
  for rollback_attempt in $(seq 1 "$READY_WAIT_ATTEMPTS"); do
    if ! rollback_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$rollback_container_id")"; then
      echo "Could not inspect rollback portal health." >&2
      return 1
    fi
    if [[ "$rollback_health" == "healthy" ]]; then
      echo "Application rollback succeeded. Database changes were NOT reverted." >&2
      docker compose -f docker-compose.yml ps || true
      return 0
    fi
    if [[ "$rollback_health" == "unhealthy" ]]; then
      break
    fi
    echo "Waiting for rollback healthcheck ($rollback_attempt/$READY_WAIT_ATTEMPTS): $rollback_health"
    sleep "$READY_WAIT_INTERVAL"
  done

  echo "Application rollback failed." >&2
  docker compose -f docker-compose.yml logs --tail=120 portal || true
  return 1
}
REMOTE_LIB
)"

remote_deploy="$(cat <<'REMOTE_DEPLOY'
if [[ ! -f .env ]]; then
  echo "Missing $DEPLOY_PATH/.env. Create it on the server before deploying." >&2
  exit 1
fi

previous_container_id="$(docker compose -f docker-compose.yml ps -q portal 2>/dev/null || true)"
PREVIOUS_IMAGE_ID=""
if [[ -n "$previous_container_id" ]]; then
  PREVIOUS_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$previous_container_id" 2>/dev/null || true)"
fi
# Persisted so a rollback requested after this deploy (for example when the
# external healthcheck run from the deploy runner fails) targets this image.
printf '%s\n' "$PREVIOUS_IMAGE_ID" > .previous-portal-image

fail_deployment() {
  local reason="$1"
  echo "$reason" >&2
  docker compose -f docker-compose.yml ps || true
  docker compose -f docker-compose.yml logs --tail=120 portal || true
  if ! rollback_portal; then
    echo "Automatic application rollback was not successful; manual recovery is required." >&2
  fi
  # Printed last so it is the final thing in the job log.
  warn_migration_may_be_applied
  exit 1
}

if [[ "$CREATE_BACKUP" == "true" ]]; then
  safe_tag="${IMAGE_TAG//[^A-Za-z0-9_.-]/_}"
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR"
  echo "Creating database backup before deploying $IMAGE_TAG"
  backup_target="$BACKUP_DIR/profile_portal_${safe_tag}_${stamp}.sql"
  # Dump to .partial and rename only on success, so a truncated dump is never
  # left behind under a name the release gate would accept as a recovery point.
  # This is the pre-deploy safety net only; scheduled backups (with retention
  # and offsite copy) are scripts/backup-database.sh, installed on the VM.
  if ! docker compose -f docker-compose.yml exec -T db pg_dump -U portal profile_portal \
    > "$backup_target.partial"; then
    rm -f "$backup_target.partial"
    echo "Pre-deploy database backup failed; refusing to deploy without a recovery point." >&2
    exit 1
  fi
  mv "$backup_target.partial" "$backup_target"
  echo "Pre-deploy backup written to $backup_target"
fi

# Scoped to `portal` on purpose. `docker compose pull` with no service also
# pulls the mutable `postgres:17-alpine` tag, so shipping app code could fetch a
# new PostgreSQL minor version and recreate the database container as a side
# effect. The db service additionally pins `pull_policy: missing`.
docker compose -f docker-compose.yml pull portal
if ! docker compose -f docker-compose.yml up -d --remove-orphans; then
  fail_deployment "Docker Compose failed while starting the deployment."
fi

if ! container_id="$(docker compose -f docker-compose.yml ps -q portal)"; then
  fail_deployment "Could not inspect the deployed portal container."
fi
if [[ -z "$container_id" ]]; then
  fail_deployment "Portal container was not created."
fi

for attempt in $(seq 1 "$READY_WAIT_ATTEMPTS"); do
  if ! health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"; then
    fail_deployment "Could not inspect portal health."
  fi
  if [[ "$health" == "healthy" ]]; then
    if ! docker compose -f docker-compose.yml ps; then
      fail_deployment "Could not verify the final Docker Compose state."
    fi
    exit 0
  fi
  if [[ "$health" == "unhealthy" ]]; then
    fail_deployment "Portal container became unhealthy."
  fi
  echo "Waiting for portal healthcheck ($attempt/$READY_WAIT_ATTEMPTS): $health"
  sleep "$READY_WAIT_INTERVAL"
done

fail_deployment "Portal container did not become healthy within $((READY_WAIT_ATTEMPTS * READY_WAIT_INTERVAL))s."
REMOTE_DEPLOY
)"

remote_rollback="$(cat <<'REMOTE_ROLLBACK'
PREVIOUS_IMAGE_ID="$(cat .previous-portal-image 2>/dev/null || true)"
docker compose -f docker-compose.yml ps || true
docker compose -f docker-compose.yml logs --tail=120 portal || true
rollback_status=0
if ! rollback_portal; then
  echo "Automatic application rollback was not successful; manual recovery is required." >&2
  rollback_status=1
fi
warn_migration_may_be_applied
exit "$rollback_status"
REMOTE_ROLLBACK
)"

echo "Deploying $IMAGE_REF"
printf '%s\n%s\n' "$remote_lib" "$remote_deploy" | \
  ssh "${ssh_opts[@]}" "$TARGET" "$remote_env_prefix bash -s"

# The external healthcheck must run from this machine: requests the VM sends
# to its own public hostname hairpin through the Cloudflare edge, where the
# WAF answers them with a managed challenge (403) instead of reaching the app.
if [[ -n "$HEALTHCHECK_URL" ]]; then
  external_ready=false
  # The container already reported `healthy` here, so this only has to cover the
  # tunnel re-pointing at the new container. 20 x 3s = 60s.
  external_attempts="${EXTERNAL_WAIT_ATTEMPTS:-20}"
  for external_attempt in $(seq 1 "$external_attempts"); do
    external_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTHCHECK_URL" || true)"
    if [[ "$external_status" == "200" ]]; then
      external_ready=true
      break
    fi
    echo "Waiting for external healthcheck ($external_attempt/$external_attempts): HTTP ${external_status:-000}"
    sleep 3
  done
  if [[ "$external_ready" != "true" ]]; then
    echo "External healthcheck failed: $HEALTHCHECK_URL" >&2
    printf '%s\n%s\n' "$remote_lib" "$remote_rollback" | \
      ssh "${ssh_opts[@]}" "$TARGET" "$remote_env_prefix bash -s" || \
      echo "Automatic application rollback was not successful; manual recovery is required." >&2
    echo "This deploy already ran 'prisma migrate deploy'. The new schema may be committed; rolling the image back does not revert it. See the rollback/migration recovery procedure in DEPLOYMENT.md." >&2
    exit 1
  fi
fi
