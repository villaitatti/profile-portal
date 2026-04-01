#!/bin/sh
set -e

echo "Running database migrations..."
cd packages/server
npx prisma migrate deploy
cd /app

echo "Starting server..."
exec node packages/server/dist/index.js
