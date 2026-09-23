#!/usr/bin/env sh
# Connect this workspace to GitHub and push the repo.
#
# Usage: sh ./scripts/github-connect.sh [owner/repo] [--public|--private]
#
# Auth: reads GITHUB_TOKEN (or GH_TOKEN) from the environment.
# Add it in Settings -> Environment (a classic PAT with `repo` scope works).
#
# Behavior:
#   1. Verifies the token with the GitHub API.
#   2. Creates the target repo if it doesn't exist (when token owner matches).
#   3. Pushes main.
#   4. Fallback A: cannot push to upstream but repo exists -> fork, push fork,
#      open a PR into the upstream repo.
#   5. Fallback B: same user, push rejected (e.g. branch protection) ->
#      push a `civiclens/import` branch and open a PR.
set -eu

REPO_SLUG="${1:-${GITHUB_REPO:-MehulBlitz/civiclens-triage}}"
VISIBILITY="${2:-${GITHUB_REPO_VISIBILITY:-private}}"
OWNER="${REPO_SLUG%%/*}"
NAME="${REPO_SLUG#*/}"
API="https://api.github.com"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"

if [ -z "$TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN is not set."
  echo "Add a GitHub personal access token (classic, 'repo' scope) in"
  echo "Settings -> Environment as GITHUB_TOKEN, then rerun this script."
  exit 1
fi

command -v curl >/dev/null 2>&1 || { echo "ERROR: curl not available"; exit 1; }

gh_req() {
  curl -sS \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$@"
}

# Credential helper that feeds the token to git without persisting it anywhere.
CRED='!f(){ printf "username=x-access-token\npassword=%s\n" "$GITHUB_TOKEN"; };f'

ME=$(gh_req "$API/user" | sed -n 's/.*"login"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
if [ -z "$ME" ]; then
  echo "ERROR: GitHub rejected the token. Check GITHUB_TOKEN value/expiry."
  exit 1
fi
echo "==> Token OK (user: $ME). Target: $OWNER/$NAME ($VISIBILITY)"

# 1. Ensure the target repository exists.
CODE=$(gh_req -o /dev/null -w '%{http_code}' "$API/repos/$OWNER/$NAME")
if [ "$CODE" = "404" ] || [ "$CODE" = "000" ]; then
  if [ "$ME" = "$OWNER" ]; then
    echo "==> Repo missing — creating $OWNER/$NAME"
    PRIV=false; [ "$VISIBILITY" = "private" ] && PRIV=true
    gh_req -X POST "$API/user/repos" \
      -d "{\"name\":\"$NAME\",\"private\":$PRIV,\"description\":\"CivicLens — AI civic complaint triage (Smarter Cities, Happier Citizens)\"" \
      -o /dev/null
  else
    echo "ERROR: $OWNER/$NAME does not exist and this token belongs to '$ME'."
    echo "Create the repo on github.com as $OWNER, or use a token for that account."
    exit 1
  fi
fi

# 2. Point origin at the repo (idempotent).
git remote get-url origin >/dev/null 2>&1 || \
  git remote add origin "https://github.com/$OWNER/$NAME.git"
git remote set-url origin "https://github.com/$OWNER/$NAME.git"
git branch -M main 2>/dev/null || true

# 3. Try a direct push to main.
if git -c credential.helper="$CRED" push -u origin main 2>&1; then
  echo "==> Pushed main -> https://github.com/$OWNER/$NAME"
  echo "==> CI runs at https://github.com/$OWNER/$NAME/actions"
  exit 0
fi
echo "==> Direct push to main was not permitted."

# 4a. Different account: fork the upstream and open a PR.
if [ "$ME" != "$OWNER" ]; then
  echo "==> Forking $OWNER/$NAME to $ME/$NAME"
  gh_req -X POST "$API/repos/$OWNER/$NAME/forks" -o /dev/null || true
  sleep 3
  git remote remove fork 2>/dev/null || true
  git remote add fork "https://github.com/$ME/$NAME.git"
  git -c credential.helper="$CRED" push -u fork main
  gh_req -X POST "$API/repos/$OWNER/$NAME/pulls" \
    -d "{\"title\":\"CivicLens: full project import\",\"head\":\"$ME:main\",\"base\":\"main\"}" \
    -o /dev/null || echo "(PR may already exist — check the repo's Pull requests tab)"
  echo "==> Fork pushed and PR opened into $OWNER/$NAME"
  exit 0
fi

# 4b. Same account but protected main: branch + PR.
echo "==> Falling back to branch + PR"
git checkout -b civiclens/import 2>/dev/null || git checkout civiclens/import
git -c credential.helper="$CRED" push -u origin civiclens/import
gh_req -X POST "$API/repos/$OWNER/$NAME/pulls" \
  -d '{"title":"CivicLens: full project import","head":"civiclens/import","base":"main"}' \
  -o /dev/null || echo "(PR may already exist — check the Pull requests tab)"
echo "==> Branch pushed and PR opened into main"
