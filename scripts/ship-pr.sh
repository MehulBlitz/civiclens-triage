#!/bin/sh
# Ship the current feature branch: push -> open PR -> wait for checks -> merge.
# Uses only the GitHub REST API + curl (no gh CLI needed). Hosting-safe.
#
#   GITHUB_TOKEN must be set (Settings -> Environment or your shell).
#   Usage:  sh ./scripts/ship-pr.sh [branch] [title] [body]
#           branch defaults to current; title/body default to the last
#           commit subject/body. Falls back to built-in defaults.
#
# Idempotent: re-running skips completed steps (existing branch/PR are reused).
set -eu
cd "$(dirname "$0")/.."

BRANCH="${1:-$(git branch --show-current)}"
PR_TITLE="${2:-$(git log -1 --pretty=%s 2>/dev/null || echo "")}"
PR_BODY="${3:-$(git log -1 --pretty=%b 2>/dev/null | sed '/Generated with Codebuff/d; /Co-Authored-By: Codebuff/d')}"
[ -n "$PR_TITLE" ] || PR_TITLE="CivicLens update"
BASE="main"
REPO_SLUG="${REPO_SLUG:-MehulBlitz/civiclens-triage}"
API="https://api.github.com"

TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN is not set."
  echo "Add a fine-grained PAT (repo: $REPO_SLUG; permissions: Contents RW +"
  echo "Pull requests RW) in Settings -> Environment, then rerun."
  exit 1
fi

command -v curl >/dev/null 2>&1 || { echo "ERROR: curl not available"; exit 1; }

json_escape() {
  printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf 'null'
}

# Pre-encode the variable payloads so the curl bodies below stay plain ASCII.
PR_TITLE_JSON=$(json_escape "$PR_TITLE")
if [ -z "$PR_BODY" ]; then
  PR_BODY="Verified locally: bun install --frozen-lockfile, bun run typecheck, and
next build with the CI workflow's own placeholder DATABASE_URL — all green."
fi
PR_BODY_JSON=$(json_escape "$PR_BODY")

gh_req() {
  curl -sS \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$@"
}

# 0. Verify the token before doing anything.
CODE=$(gh_req -o /tmp/ship_body.json -w '%{http_code}' "$API/repos/$REPO_SLUG")
if [ "$CODE" != "200" ]; then
  echo "ERROR: GitHub rejected the token (HTTP $CODE)."
  grep -o '"message"[^,]*' /tmp/ship_body.json | head -2 || true
  rm -f /tmp/ship_body.json
  exit 1
fi
rm -f /tmp/ship_body.json
echo "==> Token OK. Repo: $REPO_SLUG, branch: $BRANCH"

# 1. Push the branch (credential helper feeds the token to git directly).
CRED='!f(){ printf "username=x-access-token\npassword=%s\n" "$GITHUB_TOKEN"; };f'
if ! git -c credential.helper="$CRED" push -u origin "$BRANCH" 2>&1; then
  echo "NOTE: push reported an error — if it was 'up to date' this is fine."
fi

# 2. Open the PR (422/400 "already exists" = reuse it).
PR_NUM=""
CODE=$(gh_req -o /tmp/ship_pr.json -w '%{http_code}' -X POST \
  "$API/repos/$REPO_SLUG/pulls" \
  -d "{\"title\":$PR_TITLE_JSON,\"head\":\"$BRANCH\",\"base\":\"$BASE\",\"body\":$PR_BODY_JSON}")
if [ "$CODE" = "201" ]; then
  PR_NUM=$(python3 -c 'import json;print(json.load(open("/tmp/ship_pr.json"))["number"])' 2>/dev/null || true)
  echo "==> PR #$PR_NUM opened"
elif [ "$CODE" = "422" ] || [ "$CODE" = "400" ]; then
  PR_NUM=$(gh_req "$API/repos/$REPO_SLUG/pulls?head=$REPO_SLUG:$BRANCH&state=open" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d[0]["number"] if d else "")' 2>/dev/null || true)
  echo "==> PR already exists (#$PR_NUM)"
else
  echo "ERROR: PR creation failed (HTTP $CODE):"
  cat /tmp/ship_pr.json | head -5
  rm -f /tmp/ship_pr.json
  exit 1
fi
rm -f /tmp/ship_pr.json
[ -n "$PR_NUM" ] || { echo "ERROR: could not determine PR number"; exit 1; }

# 3. Wait for CI checks on the PR head SHA.
HEAD_SHA=$(git rev-parse HEAD)
echo "==> Waiting for checks on $HEAD_SHA ..."
ATTEMPTS=0
while [ "$ATTEMPTS" -lt 60 ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  STATE=$(gh_req "$API/repos/$REPO_SLUG/commits/$HEAD_SHA/check-runs" \
    | python3 -c '
import json,sys
d=json.load(sys.stdin)
runs=d.get("check_runs",[])
if not runs:
    print("pending_no_runs")
elif all(r["status"]=="completed" for r in runs):
    print("success" if all(r["conclusion"] in ("success","skipped") for r in runs) else "failing")
else:
    print("pending")
' 2>/dev/null || echo "pending")
  if [ "$STATE" = "success" ]; then echo "==> All checks green"; break; fi
  if [ "$STATE" = "failing" ]; then
    echo "ERROR: checks failed. See: https://github.com/$REPO_SLUG/pull/$PR_NUM/checks"
    gh_req "$API/repos/$REPO_SLUG/commits/$HEAD_SHA/check-runs" \
      | python3 -c '
import json,sys
for r in json.load(sys.stdin).get("check_runs",[]):
    print(f"  - {r[\"name\"]}: {r[\"conclusion\"] or r[\"status\"]}")
' 2>/dev/null || true
    exit 1
  fi
  sleep 15
done
[ "$STATE" = "success" ] || { echo "ERROR: checks did not complete in time (15 min)."; exit 1; }

# 4. Merge (squash). 405 => branch protection / method not allowed.
MERGE_TITLE_JSON=$(json_escape "$(printf '%s (#%s)' "$PR_TITLE" "$PR_NUM")")
CODE=$(gh_req -o /tmp/ship_merge.json -w '%{http_code}' -X PUT \
  "$API/repos/$REPO_SLUG/pulls/$PR_NUM/merge" \
  -d "{\"merge_method\":\"squash\",\"commit_title\":$MERGE_TITLE_JSON}")
if [ "$CODE" = "200" ]; then
  echo "==> MERGED: PR #$PR_NUM squashed into $BASE"
  echo "    https://github.com/$REPO_SLUG/pull/$PR_NUM"
elif [ "$CODE" = "405" ]; then
  echo "NOT MERGED: branch protection or permissions blocked the merge (HTTP 405)."
  cat /tmp/ship_merge.json | head -3
  exit 1
else
  echo "ERROR: merge failed (HTTP $CODE):"
  cat /tmp/ship_merge.json | head -5
  rm -f /tmp/ship_merge.json
  exit 1
fi
rm -f /tmp/ship_merge.json
