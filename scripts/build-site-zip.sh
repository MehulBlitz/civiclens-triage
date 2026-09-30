#!/bin/sh
# Build the standalone CivicLens React site and package it as a zip.
#
#   sh ./scripts/build-site-zip.sh
#
# Output: civiclens-react-ui.zip (workspace root + public/ for preview download)
# Zip contains BOTH:
#   • site-source/  — full Vite+React sources (deploys to GitHub Pages)
#   • dist/         — the built static bundle (drop on any static host as-is)
set -e
cd "$(dirname "$0")/.."

echo "== installing site deps =="
(cd site && bun install)

echo "== typecheck =="
(cd site && ./node_modules/.bin/tsc --noEmit)

echo "== building =="
(cd site && bun run build)

echo "== packaging =="
STAGE="$(mktemp -d)"
mkdir -p "$STAGE/site-source"
cp -r site/src site/public site/index.html site/package.json site/tsconfig.json \
      site/vite.config.ts site/tailwind.config.ts site/.gitignore "$STAGE/site-source/"
cp -r site/dist "$STAGE/dist"
cp site/README.md "$STAGE/README.md" 2>/dev/null || true

mkdir -p public
(cd "$STAGE" && zip -qr "$OLDPWD/civiclens-react-ui.zip" . -x "*/node_modules/*")
cp civiclens-react-ui.zip public/civiclens-react-ui.zip

echo "[build-site-zip] wrote civiclens-react-ui.zip ($(du -h civiclens-react-ui.zip | cut -f1))"
echo "[build-site-zip] also copied to public/ so the preview can serve it at /civiclens-react-ui.zip"
