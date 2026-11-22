#!/bin/sh
set -e

echo "=== Kindergarten Backend Startup ==="

echo "Applying database migrations..."
MAX_RETRIES=30
COUNT=0
until npx prisma migrate deploy || [ $COUNT -eq $MAX_RETRIES ]; do
  echo "Database is unavailable or migrations failed. Retrying in 2 seconds ($((COUNT + 1))/$MAX_RETRIES)..."
  COUNT=$((COUNT + 1))
  sleep 2
done

if [ $COUNT -eq $MAX_RETRIES ]; then
  echo "Error: Could not apply migrations after $MAX_RETRIES attempts."
  exit 1
fi

echo "Migrations successfully applied!"

if [ "$SEED_ON_STARTUP" = "true" ]; then
  echo "Running database seed..."
  node prisma/seed.js || echo "Seed completed or skipped."
fi

echo "Starting application: $@"
exec "$@"
