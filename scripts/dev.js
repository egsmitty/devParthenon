/**
 * Real live-reload dev loop (§3.6):
 *   1. Full build (main + renderer + assets).
 *   2. Launch Electron with --dev (opens DevTools; main watches dist/renderer
 *      and reloads the window when compiled output changes).
 *   3. Keep `tsc -w` running for both configs, and re-copy index.html /
 *      styles.css into dist when the source copies change.
 *
 * Renderer edits hot-reload the window. Main-process edits recompile but need
 * an app relaunch (Electron cannot hot-swap its main process) — the console
 * says so when it happens. Watchers only touch src/ and dist/; save files in
 * %APPDATA% are never observed or written.
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

console.log("[dev] initial build...");
const build = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build"],
  { cwd: root, stdio: "inherit", shell: false }
);
if (build.status !== 0) process.exit(build.status ?? 1);

const children = [];
function watchTsc(project, label) {
  const child = spawn(npx, ["tsc", "-w", "--preserveWatchOutput", "-p", project], {
    cwd: root,
    shell: false,
  });
  child.stdout.on("data", (d) => {
    const line = d.toString().trim();
    if (line) console.log(`[tsc:${label}] ${line}`);
    if (label === "main" && /Found 0 errors/.test(line)) {
      console.log("[dev] main-process change compiled — relaunch Electron to pick it up");
    }
  });
  child.stderr.on("data", (d) => console.error(`[tsc:${label}] ${d.toString().trim()}`));
  children.push(child);
}

watchTsc("tsconfig.main.json", "main");
watchTsc("tsconfig.renderer.json", "renderer");

// Static renderer assets: copy on change so the dist watcher sees them.
const srcRenderer = path.join(root, "src", "renderer");
const outRenderer = path.join(root, "dist", "renderer");
let assetDebounce = null;
fs.watch(srcRenderer, (_event, file) => {
  if (!file || !/\.(html|css)$/.test(file)) return;
  if (assetDebounce) clearTimeout(assetDebounce);
  assetDebounce = setTimeout(() => {
    try {
      fs.copyFileSync(path.join(srcRenderer, file), path.join(outRenderer, file));
      console.log(`[dev] copied ${file} -> dist/renderer/`);
    } catch (err) {
      console.error(`[dev] asset copy failed: ${err.message}`);
    }
  }, 100);
});

console.log("[dev] launching Electron (--dev: DevTools + auto-reload on dist changes)");
const electron = spawn(npx, ["electron", ".", "--dev"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

electron.on("exit", (code) => {
  for (const child of children) child.kill();
  process.exit(code ?? 0);
});
