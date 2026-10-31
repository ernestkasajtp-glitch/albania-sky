#!/bin/sh
# Container start for Render (and any Docker host).
# 1) Create the schema if the database is empty (no-op when tables exist).
# 2) Start the API, which also serves the FMS panel and the booking portal.
set -e
cd /app
echo "[start] checking database schema"
pnpm --filter @workspace/db run bootstrap
cd /app/artifacts/api-server
echo "[start] starting server on port ${PORT:-unset}"
exec node --enable-source-maps ./dist/index.mjs
