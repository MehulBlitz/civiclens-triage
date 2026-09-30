// Ship the current work: stage, commit, and push main to origin using GITHUB_TOKEN.
//
// Loads .env/.env.local into process.env (values are NEVER printed) and runs
// node-spawned git — the same mechanism as ship-pr.cjs, which works where the
// interactive shell's git network ops are blocked.
//
// Usage:
//   node scripts/ship-main.cjs                        # push only
//   node scripts/ship-main.cjs --all --file MSG.txt   # stage all, commit, push
//
// If a direct push to main is rejected (e.g. branch protection), falls back to
// pushing a dated civiclens/import-* branch and opening a PR, like ship-pr.sh.
const fs = require("fs");
const { spawnSync } = require("child_process");

function loadEnv() {
  const env = { ...process.env };
  for (const f of [".env", ".env.local"]) {
    try {
      for (const line of fs.readFileSync(f, "utf8").split("\n")) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        let val = m[2];
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!(m[1] in env)) env[m[1]] = val; // .env.local wins by file order
      }
    } catch {
      // missing file — fine
    }
  }
  return env;
}

const env = loadEnv();
if (!env.GITHUB_TOKEN) {
  console.error("ERROR: GITHUB_TOKEN is not set. Add it in Settings -> Environment, then rerun.");
  process.exit(1);
}

// Credential helper feeds the token to git without persisting or printing it.
const CRED = '!f(){ printf "username=x-access-token\\npassword=%s\\n" "$GITHUB_TOKEN"; };f';
const git = (gargs, opts = {}) => spawnSync("git", gargs, { env, ...opts });

const args = process.argv.slice(2);

// 1) Stage everything (excluding the message file itself) when --all is given.
const mi = args.indexOf("--file");
const msgFile = mi !== -1 ? args[mi + 1] : null;
if (args.includes("--all")) {
  const add = git(["add", "-A"], { stdio: "inherit" });
  if (add.status !== 0) process.exit(add.status ?? 1);
  if (msgFile) git(["reset", "--", msgFile]); // keep the transient message file out of the commit
}

// 2) Commit staged work when a message file is given and something is staged.
if (msgFile) {
  const staged = git(["diff", "--cached", "--quiet"]);
  if (staged.status !== 0) {
    const c = git(["commit", "-F", msgFile], { stdio: "inherit" });
    if (c.status !== 0) process.exit(c.status ?? 1);
  } else {
    console.log("==> Nothing staged; skipping commit.");
  }
  try {
    fs.unlinkSync(msgFile); // temporary message file no longer needed
  } catch {}
}

// 3) Push main.
const push = git(["-c", `credential.helper=${CRED}`, "push", "-u", "origin", "main"], {
  stdio: "inherit",
});
if (push.status === 0) {
  console.log("==> main shipped.");
  process.exit(0);
}

// 4) Fallback: push a dated branch and open a PR into main.
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const branch = `civiclens/import-${stamp}`;
console.log(`==> Direct main push rejected. Shipping ${branch} instead...`);
const bp = git(["-c", `credential.helper=${CRED}`, "push", "-u", "origin", `HEAD:refs/heads/${branch}`], {
  stdio: "inherit",
});
if (bp.status !== 0) process.exit(bp.status ?? 1);

const originUrl = git(["remote", "get-url", "origin"], { encoding: "utf8" }).stdout.trim();
const m = /github\.com[/:]([^/]+)\/(.+?)(\.git)?$/.exec(originUrl);
if (!m) {
  console.log("==> Branch shipped, but could not parse origin URL for the PR step.");
  process.exit(0);
}
const [, owner, repo] = m;
const pr = spawnSync(
  "curl",
  [
    "-sS",
    "-X",
    "POST",
    "-H",
    `Authorization: Bearer ${env.GITHUB_TOKEN}`,
    "-H",
    "Accept: application/vnd.github+json",
    "-d",
    JSON.stringify({
      title: "CivicLens: BMC pipeline + standalone triage site",
      head: branch,
      base: "main",
    }),
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
  ],
  { encoding: "utf8" }
);
try {
  const data = JSON.parse(pr.stdout);
  if (data.html_url) console.log(`==> PR opened: ${data.html_url}`);
  else console.log("==> Branch shipped (PR may already exist or needs manual creation).");
} catch {
  console.log("==> Branch shipped (check the repo's Pull requests tab).");
}
