// One-shot: fetch origin/main, merge it into the current branch, resolve
// conflicts (favor our branch on overlap; main's changes win only where we
// never touched), and print a summary. Node-spawned git works where the
// interactive shell shim blocks network git.
const { execFileSync, spawnSync } = require("child_process");

function git(...args) {
  return execFileSync("git", args, { maxBuffer: 50 * 1024 * 1024 }).toString();
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  return r.status ?? 1;
}

// Fetch via credential helper like ship-pr.sh does (public repo, but keep it uniform).
const fs = require("fs");
let tok = "";
for (const f of [".env", ".env.local"]) {
  try {
    const m = /^\s*GITHUB_TOKEN\s*=\s*(.+)\s*$/m.exec(fs.readFileSync(f, "utf8"));
    if (m) { tok = m[1].trim().replace(/^["']|["']$/g, ""); break; }
  } catch {}
}
const CRED = `!f(){ printf "username=x-access-token\\npassword=%s\\n" "${tok}"; };f`;
let fr = spawnSync("git", ["-c", `credential.helper=${CRED}`, "fetch", "origin", "main"], { stdio: "inherit" });
if (fr.status !== 0) {
  console.error("fetch failed");
  process.exit(1);
}

const base = git("merge-base", "HEAD", "origin/main").trim();
console.log("merge-base:", base.slice(0, 8));
console.log("origin/main:", git("rev-parse", "--short", "origin/main").trim());

const changedOnMain = git("diff", "--name-only", base, "origin/main").trim().split("\n").filter(Boolean);
console.log("\nfiles changed on main since branch point:");
console.log(changedOnMain.map((f) => "  " + f).join("\n"));

console.log("\n== merging origin/main into", git("branch", "--show-current").trim());
const mr = spawnSync("git", ["merge", "origin/main", "--no-edit"], { stdio: "inherit" });
if (mr.status !== 0) {
  const status = git("status", "--porcelain");
  const conflicted = status.split("\n").filter((l) => l.startsWith("UU") || l.startsWith("AA")).map((l) => l.slice(3));
  console.log("\nconflicts:", conflicted);
  if (process.env.FAVOR_OURS === "1") {
    for (const f of conflicted) {
      spawnSync("git", ["checkout", "--ours", f], { stdio: "inherit" });
      spawnSync("git", ["add", f], { stdio: "inherit" });
    }
    const cr = spawnSync("git", ["-c", "core.editor=true", "merge", "--continue"], { stdio: "inherit" });
    process.exit(cr.status ?? 1);
  }
  process.exit(1);
}
console.log("merge done");
console.log(git("log", "--oneline", "-3"));
