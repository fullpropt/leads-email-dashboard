#!/bin/sh
set -e

# Set error handling
trap 'echo "[ERROR] Script failed at line $LINENO"; exit 1' ERR

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "[ERROR] DATABASE_URL environment variable is not set"
  exit 1
fi

echo "[Startup] Environment check passed"
echo "[Startup] Node version: $(node --version)"
echo "[Startup] pnpm version: $(pnpm --version)"

# Run database migrations (ignore if tables already exist)
echo "[Startup] Running database migrations..."
pnpm db:push --config=drizzle.config.ts || true

echo "[Startup] Database migrations completed"

# Start the application
echo "[Startup] Starting application..."
exec pnpm start
