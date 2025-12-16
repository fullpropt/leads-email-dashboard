#!/bin/sh

# Run database migrations
echo "[Startup] Running database migrations..."
pnpm db:push --config=drizzle.config.ts

# Start the application
echo "[Startup] Starting application..."
exec pnpm start
