#!/bin/sh
set -e

# This entrypoint exists only in the production image (see Dockerfile), so this
# guard never affects local development. The Dockerfile sets NODE_ENV=production,
# but `env_file: .env` in the compose files overrides it — a dev .env copied onto
# the VM (NODE_ENV=development, DEV_SKIP_EXTERNAL_SERVICES=true) would silently
# relax every fail-closed guard in the server's env validation. Refuse to start
# instead.
if [ "${NODE_ENV:-}" != "production" ]; then
  echo "FATAL: NODE_ENV is '${NODE_ENV:-<unset>}' but a deployed container requires 'production'." >&2
  echo "Fix the .env file next to docker-compose.yml on this host (it overrides the image's" >&2
  echo "NODE_ENV) and redeploy. See 'Environment Variables' in DEPLOYMENT.md." >&2
  exit 1
fi

echo "Running database migrations..."
cd packages/server
node node_modules/prisma/build/index.js migrate deploy
cd /app

echo "Starting server..."
exec node packages/server/dist/index.js
