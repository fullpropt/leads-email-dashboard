#!/bin/sh

# Run database migrations
echo "[Startup] Running database migrations..."
pnpm db:push

# Start the application
echo "[Startup] Starting application..."
exec pnpm start
