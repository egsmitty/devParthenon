/**
 * Copies static renderer assets (index.html, styles.css) into dist/renderer
 * so the compiled app is fully self-contained under dist/.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src", "renderer");
const outDir = path.join(root, "dist", "renderer");

fs.mkdirSync(outDir, { recursive: true });
for (const file of ["index.html", "styles.css"]) {
  fs.copyFileSync(path.join(srcDir, file), path.join(outDir, file));
  console.log(`copied ${file} -> dist/renderer/`);
}
