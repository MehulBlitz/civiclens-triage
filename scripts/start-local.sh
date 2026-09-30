#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker Desktop is required. Install it, then run this script again." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "Docker Compose is required. Install Docker Desktop, then retry." >&2
  exit 1
fi

echo "Starting CivicLens locally: Postgres + ML + Next.js"
$COMPOSE up --build -d
echo "Waiting for services..."
i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS http://127.0.0.1:3000/api/health >/tmp/civiclens-health.json 2>/dev/null && \
     curl -fsS http://127.0.0.1:8008/health >/tmp/civiclens-ml-health.json 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 2
done

if [ "$i" -ge 60 ]; then
  echo "Services did not become healthy. Showing recent logs:" >&2
  $COMPOSE logs --tail=80
  exit 1
fi

echo "CivicLens is ready: http://localhost:3000"
echo "Admin demo login: http://localhost:3000/login"
echo "ML health: http://localhost:8008/health"
echo "Stop services: $COMPOSE down"