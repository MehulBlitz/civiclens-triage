// One-shot: manually dispatch the CI workflow on the current branch.
// Reason: PR #2's head commit got no github-actions check runs (only
// app-status suites, stuck queued). ci.yml has workflow_dispatch, so we can
// publish a check run on the PR head SHA without pushing a new commit.
// Token is read from .env/.env.local and never printed.
const fs = require("fs");
const { execFileSync } = require("child_process");

function token() {
  for (const f of [".env", ".env.local"]) {
    try {
      const t = fs.readFileSync(f, "utf8");
      const m = /^\s*GITHUB_TOKEN\s*=\s*(.+)\s*$/m.exec(t);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch {}
  }
  return null;
}

const tok = token();
if (!tok) {
  console.error("ERROR: no GITHUB_TOKEN in .env/.env.local");
  process.exit(1);
}

const branch = execFileSync("git", ["branch", "--show-current"]).toString().trim();
const REPO = "MehulBlitz/civiclens-triage";

const res = execFileSync(
  "curl",
  [
    "-sS",
    "-o",
    "/tmp/dispatch_body.json",
    "-w",
    "%{http_code}",
    "-X",
    "POST",
    "-H",
    `Authorization: Bearer ${tok}`,
    "-H",
    "Accept: application/vnd.github+json",
    `https://api.github.com/repos/${REPO}/actions/workflows/ci.yml/dispatches`,
    "-d",
    JSON.stringify({ ref: branch }),
  ],
  { maxBuffer: 10 * 1024 * 1024 }
).toString();

console.log(`dispatch ci.yml on ${branch}: HTTP ${res} (204 = queued)`);
if (res !== "204") {
  console.log((fs.existsSync("/tmp/dispatch_body.json") ? fs.readFileSync("/tmp/dispatch_body.json", "utf8") : "").slice(0, 300));
}
