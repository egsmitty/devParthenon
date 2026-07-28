/**
 * Copies static renderer assets (html, css, bundled fonts) into dist/renderer
 * so the compiled app is fully self-contained under dist/.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src", "renderer");
const outDir = path.join(root, "dist", "renderer");

fs.mkdirSync(outDir, { recursive: true });
for (const file of ["index.html", "styles.css", "fonts.css"]) {
  fs.copyFileSync(path.join(srcDir, file), path.join(outDir, file));
  console.log(`copied ${file} -> dist/renderer/`);
}

const fontsSrc = path.join(srcDir, "fonts");
const fontsOut = path.join(outDir, "fonts");
fs.mkdirSync(fontsOut, { recursive: true });
for (const file of fs.readdirSync(fontsSrc)) {
  fs.copyFileSync(path.join(fontsSrc, file), path.join(fontsOut, file));
}
console.log(`copied fonts/ (${fs.readdirSync(fontsSrc).length} files) -> dist/renderer/fonts/`);
