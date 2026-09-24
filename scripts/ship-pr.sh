#!/bin/sh
# Ship the current feature branch: push -> open PR -> wait for checks -> merge.
# Uses only the GitHub REST API + curl (no gh CLI needed). Hosting-safe.
#
#   GITHUB_TOKEN must be set (Settings -> Environment or your shell).
#   Usage:  sh ./scripts/ship-pr.sh [branch]        # branch defaults to current
#
# Idempotent: re-running skips completed steps (existing branch/PR are reused).
set -eu
cd "$(dirname "$0")/.."

BRANCH="${1:-$(git branch --show-current)}"
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

# 2. Open the PR (400 "already exists" = reuse it).
PR_BODY=$(cat <<'EOF'
Evidence vision layer, trust scoring, and corpus insights — closes the gaps
where uploaded images were never analyzed and no data-authenticity layer
existed. From-scratch NumPy CNN + TS parity, EXIF/ELA/pHash forensics,
composite trust score with a routing gate, TF-IDF duplicate + flooding
detection, upgraded risk NN (Adam/L2/dropout/early-stop), Holt forecast +
spike anomalies, and dashboard UI for all of it.

Verified locally: bun install --frozen-lockfile, bun run typecheck, and
next build with the CI workflow's own placeholder DATABASE_URL — all green.
EOF
)
PR_NUM=""
CODE=$(gh_req -o /tmp/ship_pr.json -w '%{http_code}' -X POST \
  "$API/repos/$REPO_SLUG/pulls" \
  -d "{\"title\":\"feat: evidence vision layer, trust scoring, corpus insights\",\"head\":\"$BRANCH\",\"base\":\"$BASE\",\"body\":$(printf '%s' "$PR_BODY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf 'null')}")
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
CODE=$(gh_req -o /tmp/ship_merge.json -w '%{http_code}' -X PUT \
  "$API/repos/$REPO_SLUG/pulls/$PR_NUM/merge" \
  -d '{"merge_method":"squash","commit_title":"feat: evidence vision layer, trust scoring, corpus insights (#'"$PR_NUM"')"}')
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
