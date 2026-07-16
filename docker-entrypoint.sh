#!/bin/sh
set -e

echo "Running database migrations..."
cd packages/server
node node_modules/prisma/build/index.js migrate deploy
cd /app

echo "Starting server..."
exec node packages/server/dist/index.js
