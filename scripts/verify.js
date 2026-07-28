/**
 * One-command verification gate: `npm run verify`.
 *
 * Runs the full pre-commit gate in order and fails fast:
 *   1. build + unit tests  (tsc for main & renderer, then node --test)
 *   2. headless smoke       (boots Electron, loads + reloads, asserts IPC,
 *                            temple render, and zero renderer console errors)
 *
 * Exit 0 = safe to commit. Anything else = do not commit.
 * (UI/visual changes should also be eyeballed via `npm run audit:ux`.)
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

function run(label, command, env) {
  console.log(`\n=== verify: ${label} ===`);
  // shell:true so npm/npx resolve on Windows (Node blocks direct .cmd spawns).
  const r = spawnSync(command, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  if ((r.status ?? 1) !== 0) {
    console.error(`\nverify: FAILED at "${label}" — do not commit.`);
    process.exit(1);
  }
}

run("build + unit tests", "npm test");
run("headless smoke (load + reload)", "npx electron .", { PARTHENON_SMOKE: "1" });

console.log("\nverify: ALL GREEN — safe to commit.");
