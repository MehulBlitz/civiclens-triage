#!/bin/sh
# Sync the built site into public/ so the Freebuff preview (Next.js static
# file serving) can display it, and keep the zip fresh.
#
#   sh ./scripts/preview-site.sh
set -e
cd "$(dirname "$0")/.."

if [ ! -f site/dist/index.html ]; then
  echo "[preview-site] site/dist missing — building first"
  (cd site && bun install && bun run build)
fi

rm -rf public/site-ui
cp -r site/dist public/site-ui
cp civiclens-react-ui.zip public/civiclens-react-ui.zip 2>/dev/null || true

echo "[preview-site] preview paths:"
echo "  /site-preview.html       → redirect into the app"
echo "  /site-ui/index.html      → the app directly"
echo "  /civiclens-react-ui.zip  → the hand-off zip"
