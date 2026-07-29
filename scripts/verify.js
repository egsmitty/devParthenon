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
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");

// The smoke boots the REAL Electron app. It MUST run against a throwaway
// user-data dir — never the learner's real %APPDATA%/DevParthenon save — or a
// boot-time read/reset race could clobber their progress. (The UX audit does
// the same via PARTHENON_USERDATA.)
const smokeUserData = fs.mkdtempSync(path.join(os.tmpdir(), "parthenon-smoke-"));
process.on("exit", () => {
  try {
    fs.rmSync(smokeUserData, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

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
run("headless smoke (load + reload)", "npx electron .", {
  PARTHENON_SMOKE: "1",
  PARTHENON_USERDATA: smokeUserData,
});

console.log("\nverify: ALL GREEN — safe to commit.");
