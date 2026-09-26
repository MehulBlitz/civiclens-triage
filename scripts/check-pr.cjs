// Read-only helper: report check-run status for the current HEAD commit.
// The token is read from .env files but never printed or logged.
const fs = require("fs");
const { execFileSync } = require("child_process");

function token() {
  for (const f of [".env", ".env.local"]) {
    try {
      const t = fs.readFileSync(f, "utf8");
      const m = /^GITHUB_TOKEN=(.+)$/m.exec(t);
      if (m) return m[1].trim();
    } catch {}
  }
  return null;
}

const tok = token();
if (!tok) {
  console.error("ERROR: no GITHUB_TOKEN in .env files");
  process.exit(1);
}

const sha = execFileSync("git", ["rev-parse", "HEAD"]).toString().trim();
const out = execFileSync(
  "curl",
  [
    "-sS",
    "-H",
    `Authorization: Bearer ${tok}`,
    "-H",
    "Accept: application/vnd.github+json",
    `https://api.github.com/repos/MehulBlitz/civiclens-triage/commits/${sha}/check-runs`,
  ],
  { maxBuffer: 10 * 1024 * 1024 }
).toString();

const d = JSON.parse(out);
const runs = d.check_runs ?? [];
if (runs.length === 0) {
  console.log("No check runs yet for", sha.slice(0, 8), "-", d.message ?? "");
} else {
  for (const r of runs) {
    console.log(`- ${r.name}: ${r.status} ${r.conclusion ?? ""}`);
  }
}
