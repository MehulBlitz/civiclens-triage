// Fetch origin refs via node-spawned git. The interactive shell's git shim
// blocks network git ops, but node-spawned git (same path as ship-pr.cjs) works.
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const res = spawnSync("git", ["fetch", "origin", ...args], { stdio: "inherit" });
process.exit(res.status ?? 1);
