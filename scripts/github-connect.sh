#!/usr/bin/env sh
# Connect this workspace to GitHub and push the repo.
# Usage: sh ./scripts/github-connect.sh [owner/repo] [--public|--private]
#
# Prerequisites (one of):
#   - The workspace's GitHub integration is authorized (platform-managed auth), or
#   - GH_TOKEN / GITHUB_TOKEN env var set to a PAT with repo scope, or
#   - gh CLI already authenticated via `gh auth login`.
set -eu

REPO_SLUG="${1:-${GITHUB_REPO:-MehulBlitz/civiclens-triage}}"
VISIBILITY="${2:-${GITHUB_REPO_VISIBILITY:-private}}"

echo "==> Target: https://github.com/$REPO_SLUG ($VISIBILITY)"

# 1. Make sure git has an authenticated credential path.
if command -v gh >/dev/null 2>&1; then
  if ! gh auth status >/dev/null 2>&1; then
    TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
    if [ -n "$TOKEN" ]; then
      printf '%s\n' "$TOKEN" | gh auth login --with-token >/dev/null 2>&1 || true
    fi
  fi
  gh auth setup-git >/dev/null 2>&1 || true
fi

# 2. Idempotently point 'origin' at the repo.
REMOTE_URL="https://github.com/$REPO_SLUG.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

# 3. Create the repo if it doesn't exist / isn't reachable yet.
if ! git ls-remote --exit-code origin HEAD >/dev/null 2>&1; then
  if command -v gh >/dev/null 2>&1; then
    echo "==> Repo not reachable — creating $REPO_SLUG ($VISIBILITY)"
    gh repo create "$REPO_SLUG" --"$VISIBILITY" || true
  else
    echo "ERROR: $REPO_SLUG is not reachable and gh CLI is unavailable."
    echo "Authorize the workspace GitHub integration or set GITHUB_TOKEN, then retry."
    exit 1
  fi
fi

# 4. Push main with upstream tracking.
[ "$(git branch --show-current)" = "main" ] || git branch -M main
git push -u origin main
echo "==> Pushed. CI workflow will run at https://github.com/$REPO_SLUG/actions"
