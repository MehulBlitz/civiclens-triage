#!/bin/sh
# Start the Python ML inference service (foreground; used by dev + preview).
# Hosting-safe: invoked as `sh ./scripts/start-ml.sh`, never ./scripts/...
set -e
cd "$(dirname "$0")/.."

if [ ! -x .venv/bin/python ]; then
  echo "[start-ml] venv missing — run: sh ./scripts/setup-ml.sh" >&2
  exit 1
fi

# Skip if a healthy instance already holds the port (idempotent restarts).
if curl -s -m 2 "http://127.0.0.1:${ML_PORT:-8008}/health" >/dev/null 2>&1; then
  echo "[start-ml] service already healthy on :${ML_PORT:-8008}"
  exit 0
fi

exec .venv/bin/python -m uvicorn ml.serve:app --host 0.0.0.0 --port "${ML_PORT:-8008}"
