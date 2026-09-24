// Loads .env/.env.local into process.env (values are NEVER printed) and
// re-execs scripts/ship-pr.sh so GITHUB_TOKEN reaches git/curl in one process.
// Values are only ever passed via environment to the child script.
const fs = require("fs");
const { spawnSync } = require("child_process");

const files = [".env", ".env.local"];
const env = { ...process.env };
let found = 0;
for (const f of files) {
  try {
    const text = fs.readFileSync(f, "utf8");
    for (const line of text.split("\n")) {
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
      if (m[1] === "GITHUB_TOKEN" && val) found++;
    }
  } catch {
    // missing file — fine
  }
}

if (!found) {
  console.error("ERROR: no GITHUB_TOKEN found in .env/.env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const res = spawnSync("sh", ["./scripts/ship-pr.sh", ...args], {
  env,
  stdio: "inherit",
});
process.exit(res.status ?? 1);
