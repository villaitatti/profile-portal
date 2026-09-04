#!/usr/bin/env bash
# Scheduled PostgreSQL + uploads backup for the Profile Portal.
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
#   * The uploads volume (admin-uploaded catalog tile images, served at
#     /uploads/images) is archived to a tar.gz alongside the dump with the same
#     `.partial` handling — the archive must pass a gzip integrity check before
#     it is renamed into place. A restored database without the matching
#     uploads restore references images that no longer exist.
#   * Dumps and uploads archives older than BACKUP_RETENTION_DAYS are pruned,
#     but the newest BACKUP_MIN_KEEP of *each* are always retained regardless
#     of age.
#   * Any failure exits non-zero and writes a clear message to stderr, so cron
#     mails the operator. Informational output goes to stdout only when
#     BACKUP_VERBOSE=true (keep stdout redirected to a log file in crontab so
#     stderr stays the alerting channel).
#   * OFFSITE COPY IS REQUIRED. Backups land on the same VM disk as the pgdata
#     volume, so a disk or VM loss takes both. Set BACKUP_OFFSITE_COMMAND to a
#     command that ships each finished artifact (the dump, then the uploads
#     archive) somewhere else; the script fails the run if that command fails.
#   * DEAD-MAN'S SWITCH. If BACKUP_PING_URL is set, the script pings it after a
#     fully successful run and pings "$BACKUP_PING_URL/fail" on any failure
#     (healthchecks.io semantics — the monitor then alerts on the *absence* of
#     runs, which cron mail cannot). Ping delivery problems only warn; they
#     never fail the backup itself.
#
# Environment variables (all optional, defaults shown):
#   DEPLOY_PATH              /opt/profile-portal   directory holding docker-compose.yml
#   COMPOSE_PROJECT_NAME     profile-portal        compose project name
#   COMPOSE_FILE_NAME        docker-compose.yml    compose file inside DEPLOY_PATH
#   DB_SERVICE               db                    compose service running PostgreSQL
#   DB_USER                  portal                PostgreSQL role used for pg_dump
#   DB_NAME                  profile_portal        database to dump
#   UPLOADS_VOLUME           <project>_uploads_data  docker volume holding uploads
#   BACKUP_DIR               $DEPLOY_PATH/backups  where dumps are written
#   BACKUP_RETENTION_DAYS    14                    prune backups older than this
#   BACKUP_MIN_KEEP          7                     never prune below this many of each
#   BACKUP_GZIP              true                  gzip the dump (uploads are always .tar.gz)
#   BACKUP_OFFSITE_COMMAND   (unset)               shell command; "$1" is the artifact path
#   BACKUP_PING_URL          (unset)               dead-man's-switch URL (see DEPLOYMENT.md "Monitoring")
#   BACKUP_VERBOSE           false                 print progress to stdout
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/profile-portal}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-profile-portal}"
COMPOSE_FILE_NAME="${COMPOSE_FILE_NAME:-docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-portal}"
DB_NAME="${DB_NAME:-profile_portal}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-${COMPOSE_PROJECT_NAME}_uploads_data}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_PATH/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_MIN_KEEP="${BACKUP_MIN_KEEP:-7}"
BACKUP_GZIP="${BACKUP_GZIP:-true}"
BACKUP_OFFSITE_COMMAND="${BACKUP_OFFSITE_COMMAND:-}"
BACKUP_PING_URL="${BACKUP_PING_URL:-}"
BACKUP_VERBOSE="${BACKUP_VERBOSE:-false}"

export COMPOSE_PROJECT_NAME

log() {
  if [[ "$BACKUP_VERBOSE" == "true" ]]; then
    printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
  fi
}

# Dead-man's-switch ping. Deliberately failure-safe: a monitoring hiccup must
# never turn a good backup into a failed run, so problems only warn on stderr.
ping_monitor() {
  local url="$1"
  if ! command -v curl >/dev/null 2>&1; then
    echo "profile-portal backup WARNING: BACKUP_PING_URL is set but curl is not on PATH; no ping was sent." >&2
    return 0
  fi
  curl -fsS --max-time 10 --retry 3 -o /dev/null "$url" \
    || echo "profile-portal backup WARNING: could not reach $url; the dead-man's-switch monitor was not pinged." >&2
}

die() {
  echo "profile-portal backup FAILED: $1" >&2
  if [[ -n "$BACKUP_PING_URL" ]]; then
    # healthchecks.io-style failure signal; harmless 404 on plain endpoints.
    ping_monitor "$BACKUP_PING_URL/fail"
  fi
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
# Same stamp as the dump so a restore can pair database and uploads trivially.
uploads_target="$BACKUP_DIR/profile_portal_uploads_${stamp}.tar.gz"
uploads_partial="$uploads_target.partial"

cleanup() {
  rm -f "$partial" "$uploads_partial"
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT

# Ships one finished artifact offsite. Runs via `bash -c` with the artifact
# path as "$1", e.g.
#   BACKUP_OFFSITE_COMMAND='rclone copyto "$1" itatti-backups:profile-portal/"$(basename "$1")"'
offsite_copy() {
  local artifact="$1"
  if [[ -z "$BACKUP_OFFSITE_COMMAND" ]]; then
    return 0
  fi
  log "Copying $artifact offsite via BACKUP_OFFSITE_COMMAND"
  if ! bash -c "$BACKUP_OFFSITE_COMMAND" offsite-copy "$artifact"; then
    die "Offsite copy failed for $artifact. The local file was kept; fix the copy target."
  fi
  log "Offsite copy succeeded for $artifact"
}

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

offsite_copy "$target"

# ── Uploads volume ──
# Admin-uploaded images live in the named uploads volume, not in PostgreSQL. A
# database dump restored without them leaves catalog rows pointing at images
# that no longer exist, so the uploads archive is part of the same backup run.
docker volume inspect "$UPLOADS_VOLUME" >/dev/null 2>&1 \
  || die "Uploads volume '$UPLOADS_VOLUME' does not exist. Set UPLOADS_VOLUME if the compose project uses a different name."

# tar runs in a throwaway container so the archive does not depend on the
# portal container being up (it may be mid-deploy or crash-looping — exactly
# when a backup matters). The db container's image is reused because it is
# alpine-based (busybox tar + gzip) and guaranteed present locally, so nothing
# is pulled. --log-driver none keeps the tar stream out of the Docker log;
# --network none because archiving needs no network.
tar_image="$(docker inspect --format '{{.Config.Image}}' "$container_id" 2>/dev/null || true)"
[[ -n "$tar_image" ]] || die "Could not resolve the '$DB_SERVICE' container image to run tar for the uploads archive."

log "Archiving uploads volume $UPLOADS_VOLUME to $uploads_target"
if ! docker run --rm --log-driver none --network none \
    -v "$UPLOADS_VOLUME:/uploads:ro" --entrypoint tar "$tar_image" \
    -C /uploads -czf - . > "$uploads_partial"; then
  die "Archiving the uploads volume failed. The database dump $target was kept."
fi
[[ -s "$uploads_partial" ]] || die "tar produced an empty archive for $UPLOADS_VOLUME."

# gzip stores a CRC and stream trailer, so this catches a truncated archive the
# same way the completion-marker check catches a truncated dump.
gzip -t "$uploads_partial" 2>/dev/null \
  || die "Uploads archive failed gzip integrity verification; treating it as truncated."

mv "$uploads_partial" "$uploads_target" || die "Could not move the completed uploads archive into $uploads_target."
uploads_size="$(wc -c < "$uploads_target" | tr -d ' ')"
log "Uploads archive complete: $uploads_target ($uploads_size bytes)"

offsite_copy "$uploads_target"

if [[ -z "$BACKUP_OFFSITE_COMMAND" ]]; then
  echo "profile-portal backup WARNING: BACKUP_OFFSITE_COMMAND is not set, so $target and $uploads_target exist only on this VM's disk — the same disk as the pgdata volume. Configure an offsite copy (see DEPLOYMENT.md)." >&2
fi

# Prune: delete backups older than the retention window, but always keep the
# newest BACKUP_MIN_KEEP so a burst of failures can't leave us with nothing.
# Database dumps and uploads archives are pruned as separate families so the
# floor applies to each — a pile of dumps can never starve out the archives.
prune_family() {
  local -a family
  local index=0 file
  mapfile -t family < <(ls -1t "$@" 2>/dev/null || true)
  if (( ${#family[@]} <= BACKUP_MIN_KEEP )); then
    return 0
  fi
  for file in "${family[@]}"; do
    index=$((index + 1))
    if (( index <= BACKUP_MIN_KEEP )); then
      continue
    fi
    if [[ -n "$(find "$file" -maxdepth 0 -mtime "+$BACKUP_RETENTION_DAYS" 2>/dev/null)" ]]; then
      log "Pruning $file (older than ${BACKUP_RETENTION_DAYS}d)"
      rm -f "$file" || echo "profile-portal backup WARNING: could not prune $file" >&2
    fi
  done
}

prune_family "$BACKUP_DIR"/profile_portal_*.sql "$BACKUP_DIR"/profile_portal_*.sql.gz
prune_family "$BACKUP_DIR"/profile_portal_uploads_*.tar.gz

# Leftover .partial files mean an earlier run died mid-dump; surface them.
shopt -s nullglob
stale_partials=("$BACKUP_DIR"/*.partial)
shopt -u nullglob
if (( ${#stale_partials[@]} > 0 )); then
  echo "profile-portal backup WARNING: stale partial dumps present in $BACKUP_DIR: ${stale_partials[*]}" >&2
fi

log "Retention: keeping backups newer than ${BACKUP_RETENTION_DAYS}d plus the newest ${BACKUP_MIN_KEEP} of each kind"

if [[ -n "$BACKUP_PING_URL" ]]; then
  ping_monitor "$BACKUP_PING_URL"
  log "Pinged dead-man's-switch monitor"
else
  echo "profile-portal backup WARNING: BACKUP_PING_URL is not set, so nothing alerts on the ABSENCE of a backup run — cron mail only reports runs that start and fail, not a timer that silently stops firing. Configure a dead-man's switch (see the Monitoring section of DEPLOYMENT.md)." >&2
fi
