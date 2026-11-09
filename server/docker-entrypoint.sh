#!/bin/sh
set -e

echo "[RoadGuard] Starting container initialization..."

# Ensure directory permissions on persistent volume
mkdir -p /data/prisma /data/uploads /app/logs

# Run database migrations automatically against persistent SQLite database
echo "[RoadGuard] Running Prisma database migrations..."
npx prisma migrate deploy

# If database is freshly created, seed with initial municipal infrastructure
if [ ! -f "/data/prisma/.seeded" ]; then
  echo "[RoadGuard] First-time startup detected: Seeding initial departments and accounts..."
  npx tsx prisma/seed.ts || true
  touch /data/prisma/.seeded
  echo "[RoadGuard] Seeding completed."
fi

echo "[RoadGuard] Starting production application process..."
exec "$@"

