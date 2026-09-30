#!/bin/sh
set -eu
echo "Web -> API:"
curl -fsS http://127.0.0.1:3000/api/health
printf '\nML service: '
curl -fsS http://127.0.0.1:8008/health
printf '\nML prediction: '
curl -fsS -X POST http://127.0.0.1:8008/predict -H 'Content-Type: application/json' \
  -d '{"texts":["deep pothole near the school, bikes are skidding"]}'
printf '\nAll local connectivity checks passed.\n'