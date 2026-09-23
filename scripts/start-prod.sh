#!/bin/sh
# Production-style serve: ML service (if Python available) + Next.js server.
# Hosting-safe: invoked as `sh ./scripts/start-prod.sh` (no exec bit needed).
#
# The hosting builder is Node.js-only, so Python/venv may not exist there.
# The triage pipeline is layered by design: when the ML service (L1) is
# unreachable, in-process lexical rules (L2) classify — the app never breaks.
set -e
cd "$(dirname "$0")/.."

if command -v python3 >/dev/null 2>&1 && [ -x .venv/bin/python ] && [ -f ml/models/triage_bundle.joblib ]; then
  sh ./scripts/start-ml.sh &
else
  echo "[start-prod] Python/venv/model unavailable — serving with L2 lexical fallback (by design)."
fi

exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
