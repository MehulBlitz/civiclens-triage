// Read-only GitHub diagnostics: why aren't CI check runs appearing for the PR?
// Reads GITHUB_TOKEN from .env/.env.local; never prints the token.
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

const REPO = "MehulBlitz/civiclens-triage";
const tok = token();
if (!tok) {
  console.error("no token");
  process.exit(1);
}

async function req(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: "application/vnd.github+json",
    },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

(async () => {
  const wf = await req("/actions/workflows");
  console.log("== workflows (HTTP", wf.status, ")");
  if (wf.json && wf.json.workflows) {
    for (const w of wf.json.workflows) {
      console.log(`- ${w.name} | path=${w.path} | state=${w.state}`);
    }
  } else {
    console.log((wf.text || "").slice(0, 300));
  }

  const runs = await req("/actions/runs?per_page=10");
  console.log("\n== workflow runs (HTTP", runs.status, ")");
  if (runs.json && runs.json.workflow_runs) {
    console.log("total_count:", runs.json.total_count);
    for (const r of runs.json.workflow_runs.slice(0, 10)) {
      console.log(
        `- #${r.id} ${r.name} | ${r.event} | head=${String(r.head_sha).slice(0, 8)} | status=${r.status} concl=${r.conclusion} | branch=${r.head_branch}`
      );
    }
  } else {
    console.log((runs.text || "").slice(0, 300));
  }

  // PR head check suites as GitHub reports them
  const prs = await req("/pulls?state=open&per_page=10");
  console.log("\n== open PRs (HTTP", prs.status, ")");
  if (Array.isArray(prs.json)) {
    for (const p of prs.json) {
      console.log(`- PR #${p.number} "${p.title}" head=${p.head.sha.slice(0, 8)} mergeable=${p.mergeable}`);
      const suites = await req(`/commits/${p.head.sha}/check-suites`);
      if (suites.json && suites.json.check_suites) {
        console.log(`  check_suites: ${suites.json.total_count}`);
        for (const s of suites.json.check_suites) {
          console.log(`  - suite ${s.id} app=${s.app && s.app.slug} status=${s.status} concl=${s.conclusion}`);
        }
      }
    }
  }

  const repo = await req("");
  if (repo.json) {
    console.log("\n== repo facts");
    console.log("private:", repo.json.private, "| default_branch:", repo.json.default_branch, "| archived:", repo.json.archived);
  }
})();
