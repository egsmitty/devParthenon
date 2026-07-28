const { _electron: electron } = require("playwright");
const root = "C:/WebDev/devParthenon";
const [,, udd, out] = process.argv;
(async () => {
  const app = await electron.launch({ args: ["."], cwd: root, env: { ...process.env, PARTHENON_USERDATA: udd } });
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForSelector("#temple-svg-host svg");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1300, 900));
  await new Promise((r) => setTimeout(r, 300));
  await page.click('g.node[data-node-id="foundation"]');
  await page.waitForSelector(".modal-card");
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: out });
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
