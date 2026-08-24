#!/usr/bin/env bash
# Scheduled PostgreSQL backup for the Profile Portal.
#
# Runs ON THE APP VM (not on a GitHub runner) and is meant to be driven by cron
# or a systemd timer — see the "Scheduled backups" section of DEPLOYMENT.md for
# the install lines. It is independent of `scripts/deploy-image.sh`, which still
# takes its own pre-deploy dump; this script is what gives us a recovery point
# on days when nothing is deployed.
#
# Behaviour:
#   * `pg_dump` runs inside the running `db` container, so the dump is always
#     produced by the same PostgreSQL major version that owns the data.
#   * The dump is written to a `.partial` file and only renamed into place after
#     pg_dump exits 0 and the completion marker is present, so a truncated dump
#     can never be mistaken for a good recovery point.
#   * Dumps older than BACKUP_RETENTION_DAYS are pruned, but the newest
#     BACKUP_MIN_KEEP dumps are always retained regardless of age.
#   * Any failure exits non-zero and writes a clear message to stderr, so cron
#     mails the operator. Informational output goes to stdout only when
#     BACKUP_VERBOSE=true (keep stdout redirected to a log file in crontab so
#     stderr stays the alerting channel).
#   * OFFSITE COPY IS REQUIRED. Dumps land on the same VM disk as the pgdata
#     volume, so a disk or VM loss takes both. Set BACKUP_OFFSITE_COMMAND to a
#     command that ships the dump somewhere else; the script fails the run if
#     that command fails.
#
# Environment variables (all optional, defaults shown):
#   DEPLOY_PATH              /opt/profile-portal   directory holding docker-compose.yml
#   COMPOSE_PROJECT_NAME     profile-portal        compose project name
#   COMPOSE_FILE_NAME        docker-compose.yml    compose file inside DEPLOY_PATH
#   DB_SERVICE               db                    compose service running PostgreSQL
#   DB_USER                  portal                PostgreSQL role used for pg_dump
#   DB_NAME                  profile_portal        database to dump
#   BACKUP_DIR               $DEPLOY_PATH/backups  where dumps are written
#   BACKUP_RETENTION_DAYS    14                    prune dumps older than this
#   BACKUP_MIN_KEEP          7                     never prune below this many dumps
#   BACKUP_GZIP              true                  gzip the dump
#   BACKUP_OFFSITE_COMMAND   (unset)               shell command; "$1" is the dump path
#   BACKUP_VERBOSE           false                 print progress to stdout
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/profile-portal}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-profile-portal}"
COMPOSE_FILE_NAME="${COMPOSE_FILE_NAME:-docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-portal}"
DB_NAME="${DB_NAME:-profile_portal}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_PATH/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_MIN_KEEP="${BACKUP_MIN_KEEP:-7}"
BACKUP_GZIP="${BACKUP_GZIP:-true}"
BACKUP_OFFSITE_COMMAND="${BACKUP_OFFSITE_COMMAND:-}"
BACKUP_VERBOSE="${BACKUP_VERBOSE:-false}"

export COMPOSE_PROJECT_NAME

log() {
  if [[ "$BACKUP_VERBOSE" == "true" ]]; then
    printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
  fi
}

die() {
  echo "profile-portal backup FAILED: $1" >&2
  exit 1
}

if [[ ! "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  die "BACKUP_RETENTION_DAYS must be a whole number of days (got '$BACKUP_RETENTION_DAYS')."
fi
if [[ ! "$BACKUP_MIN_KEEP" =~ ^[0-9]+$ ]]; then
  die "BACKUP_MIN_KEEP must be a whole number (got '$BACKUP_MIN_KEEP')."
fi

command -v docker >/dev/null 2>&1 || die "docker is not on PATH."

compose_file="$DEPLOY_PATH/$COMPOSE_FILE_NAME"
[[ -f "$compose_file" ]] || die "Compose file not found: $compose_file"

cd "$DEPLOY_PATH"

compose() {
  docker compose -f "$COMPOSE_FILE_NAME" "$@"
}

mkdir -p "$BACKUP_DIR" || die "Could not create backup directory $BACKUP_DIR"

# A single lock keeps a long-running dump from overlapping the next timer tick
# (and from racing a deploy's pre-deploy dump on the same disk).
lock_dir="$BACKUP_DIR/.backup.lock"
if ! mkdir "$lock_dir" 2>/dev/null; then
  die "Another backup run holds $lock_dir. Remove it if no backup is running."
fi

stamp="$(date -u +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/profile_portal_${stamp}.sql"
if [[ "$BACKUP_GZIP" == "true" ]]; then
  target="$target.gz"
fi
partial="$target.partial"

cleanup() {
  rm -f "$partial"
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT

container_id="$(compose ps -q "$DB_SERVICE" 2>/dev/null || true)"
[[ -n "$container_id" ]] || die "Database service '$DB_SERVICE' is not running in $DEPLOY_PATH."

if ! compose exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
  die "PostgreSQL in '$DB_SERVICE' did not answer pg_isready; refusing to write a backup."
fi

log "Dumping $DB_NAME to $target"

# pipefail is on, so a pg_dump failure fails the pipeline even with gzip
# downstream. Writing to $partial first means the final filename only ever
# exists for a dump that completed.
if [[ "$BACKUP_GZIP" == "true" ]]; then
  compose exec -T "$DB_SERVICE" pg_dump -U "$DB_USER" "$DB_NAME" | gzip -c > "$partial" \
    || die "pg_dump failed for $DB_NAME (see stderr above). No backup was written."
else
  compose exec -T "$DB_SERVICE" pg_dump -U "$DB_USER" "$DB_NAME" > "$partial" \
    || die "pg_dump failed for $DB_NAME (see stderr above). No backup was written."
fi

[[ -s "$partial" ]] || die "pg_dump produced an empty file for $DB_NAME."

# pg_dump's plain-text format ends with this marker. Its absence means the dump
# was truncated even if the exit status looked clean.
if [[ "$BACKUP_GZIP" == "true" ]]; then
  dump_tail="$(gzip -cd "$partial" | tail -c 200 || true)"
else
  dump_tail="$(tail -c 200 "$partial" || true)"
fi
case "$dump_tail" in
  *"PostgreSQL database dump complete"*) : ;;
  *) die "Dump is missing the pg_dump completion marker; treating it as truncated." ;;
esac

mv "$partial" "$target" || die "Could not move the completed dump into $target."
size="$(wc -c < "$target" | tr -d ' ')"
log "Backup complete: $target ($size bytes)"

if [[ -n "$BACKUP_OFFSITE_COMMAND" ]]; then
  log "Copying offsite via BACKUP_OFFSITE_COMMAND"
  # The dump path is passed as "$1" to the configured command, e.g.
  #   BACKUP_OFFSITE_COMMAND='rclone copyto "$1" itatti-backups:profile-portal/"$(basename "$1")"'
  if ! bash -c "$BACKUP_OFFSITE_COMMAND" offsite-copy "$target"; then
    die "Offsite copy failed for $target. The local dump was kept; fix the copy target."
  fi
  log "Offsite copy succeeded for $target"
else
  echo "profile-portal backup WARNING: BACKUP_OFFSITE_COMMAND is not set, so $target exists only on this VM's disk — the same disk as the pgdata volume. Configure an offsite copy (see DEPLOYMENT.md)." >&2
fi

# Prune: delete dumps older than the retention window, but always keep the
# newest BACKUP_MIN_KEEP so a burst of failures can't leave us with nothing.
mapfile -t dumps < <(ls -1t "$BACKUP_DIR"/profile_portal_*.sql "$BACKUP_DIR"/profile_portal_*.sql.gz 2>/dev/null || true)
total="${#dumps[@]}"
if (( total > BACKUP_MIN_KEEP )); then
  index=0
  for dump in "${dumps[@]}"; do
    index=$((index + 1))
    if (( index <= BACKUP_MIN_KEEP )); then
      continue
    fi
    if [[ -n "$(find "$dump" -maxdepth 0 -mtime "+$BACKUP_RETENTION_DAYS" 2>/dev/null)" ]]; then
      log "Pruning $dump (older than ${BACKUP_RETENTION_DAYS}d)"
      rm -f "$dump" || echo "profile-portal backup WARNING: could not prune $dump" >&2
    fi
  done
fi

# Leftover .partial files mean an earlier run died mid-dump; surface them.
shopt -s nullglob
stale_partials=("$BACKUP_DIR"/*.partial)
shopt -u nullglob
if (( ${#stale_partials[@]} > 0 )); then
  echo "profile-portal backup WARNING: stale partial dumps present in $BACKUP_DIR: ${stale_partials[*]}" >&2
fi

log "Retention: keeping dumps newer than ${BACKUP_RETENTION_DAYS}d plus the newest ${BACKUP_MIN_KEEP}"
