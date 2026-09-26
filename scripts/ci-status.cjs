// One-shot: poll check runs for PR #2's head; print CI workflow run status.
const fs = require("fs");

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
const H = { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json" };

(async () => {
  const runs = await (
    await fetch(
      "https://api.github.com/repos/MehulBlitz/civiclens-triage/actions/runs?per_page=5",
      { headers: H }
    )
  ).json();
  for (const r of runs.workflow_runs ?? []) {
    console.log(`- ${r.name} | ${r.event} | head=${r.head_sha.slice(0, 8)} | ${r.status}/${r.conclusion}`);
  }
})();
