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

# Run database migrations
echo "[Startup] Running database migrations..."
if ! pnpm db:push --config=drizzle.config.ts; then
  echo "[ERROR] Database migrations failed"
  exit 1
fi

echo "[Startup] Database migrations completed successfully"

# Start the application
echo "[Startup] Starting application..."
exec pnpm start