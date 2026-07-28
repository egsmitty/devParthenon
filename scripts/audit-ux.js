/**
 * UI/UX audit harness (master prompt §4).
 *
 * Drives the REAL Electron app via Playwright's _electron support through the
 * key visual states and writes screenshots + a manifest under audit/. Runs
 * against a throwaway userData dir (PARTHENON_USERDATA) so it never touches
 * the learner's real save. Opt-in: `npm run audit:ux`. Not part of `npm test`.
 *
 * Deterministic: graded checks always use variants[0], so correct-answer
 * indices are read straight from the quiz data.
 */
const { _electron: electron } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "audit");
const shots = path.join(outDir, "shots");
const template = path.join(root, "data", "progress.json");
const foundation = JSON.parse(
  fs.readFileSync(path.join(root, "data", "quizzes", "foundation.json"), "utf-8")
);
/** Correct index of the graded (variants[0]) question for each section. */
const correctA = foundation.sections.map((s) => s.variants[0].correctAnswerIndex);
/** Correct index of the first redemption variant (variants[1]) for section 0. */
const correctB0 = foundation.sections[0].variants[1].correctAnswerIndex;

const SIZES = { wide: { w: 1280, h: 840 }, min: { w: 980, h: 680 } };
const manifest = [];

function seed(dir, mutate) {
  fs.mkdirSync(dir, { recursive: true });
  const data = JSON.parse(fs.readFileSync(template, "utf-8"));
  if (mutate) mutate(data);
  fs.writeFileSync(path.join(dir, "progress.json"), JSON.stringify(data, null, 2));
}

async function launch(dir) {
  const app = await electron.launch({
    args: [".", "--dev-audit"],
    cwd: root,
    env: { ...process.env, PARTHENON_USERDATA: dir },
  });
  const page = await app.firstWindow();
  // Deterministic captures: with reduced motion honored, nodes are stable
  // and clickable without force — which also verifies the a11y guard works.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForSelector("#temple-svg-host svg", { timeout: 15000 });
  return { app, page };
}

async function clickNode(page, nodeId) {
  await page.click(`g.node[data-node-id="${nodeId}"]`);
  await page.waitForSelector(".modal-card");
}

async function resize(app, size) {
  await app.evaluate(({ BrowserWindow }, s) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(s.w, s.h);
  }, size);
  await new Promise((r) => setTimeout(r, 350));
}

async function shot(page, name, note) {
  const file = path.join(shots, `${name}.png`);
  await page.screenshot({ path: file });
  manifest.push({ name, note, file: path.relative(outDir, file) });
  console.log(`  captured ${name}`);
}

async function answer(page, index) {
  await page.locator(".option-btn").nth(index).click();
  await page.waitForSelector(".feedback", { timeout: 5000 });
}

async function advance(page, label) {
  await page.locator(`.modal-actions .primary-btn`, { hasText: label }).click();
}

async function main() {
  // Clear only generated output — FINDINGS.md (the committed report) stays.
  fs.rmSync(shots, { recursive: true, force: true });
  fs.rmSync(path.join(outDir, "manifest.json"), { force: true });
  fs.mkdirSync(shots, { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "parthenon-audit-"));

  /* ---- Scenario 1: fresh temple, glossary, full quiz flow ---- */
  {
    const dir = path.join(tmpRoot, "fresh");
    seed(dir);
    const { app, page } = await launch(dir);
    await resize(app, SIZES.wide);
    await shot(page, "01-temple-fresh-wide", "Fresh temple, foundation unlocked, all else locked (1280x840)");
    await resize(app, SIZES.min);
    await shot(page, "02-temple-fresh-min", "Fresh temple at minimum window size (980x680)");
    await resize(app, SIZES.wide);

    // Glossary search
    await page.fill("#glossary-search", "hydration");
    await new Promise((r) => setTimeout(r, 200));
    await shot(page, "03-glossary-search", "Glossary filtered to 'hydration'");
    await page.fill("#glossary-search", "");

    // Open the foundation module.
    await clickNode(page, "foundation");
    await shot(page, "04-lesson-section", "Lesson chunk + first interactive check");

    // Section 0: answer WRONG to capture failure feedback + set up redemption.
    const wrong0 = (correctA[0] + 1) % 4;
    await answer(page, wrong0);
    await shot(page, "05-feedback-wrong", "Wrong-answer feedback: why it's wrong + interview tip");
    await advance(page, "Continue");

    // Section 1: answer CORRECT to capture positive feedback.
    await page.waitForSelector(".option-btn:not([disabled])");
    await answer(page, correctA[1]);
    await shot(page, "06-feedback-correct", "Correct-answer feedback: rationale + interview tip");
    await advance(page, "Continue");

    // Sections 2..5 correct.
    for (let i = 2; i < foundation.sections.length; i++) {
      await page.waitForSelector(".option-btn:not([disabled])");
      await answer(page, correctA[i]);
      const label = i === foundation.sections.length - 1 ? "See results" : "Continue";
      await advance(page, label);
    }

    // 5/6 = 83% -> redemption intro.
    await page.waitForSelector('[data-action="begin"]');
    await shot(page, "07-redemption-intro", "Redemption Round offer (missed 1, within 15 points)");
    await page.click('[data-action="begin"]');

    // Redemption question (section 0, variant B).
    await page.waitForSelector(".option-btn:not([disabled])");
    await shot(page, "08-redemption-question", "Redemption question: different scenario, same concept");
    await answer(page, correctB0);
    await advance(page, "See results");

    // Pass result.
    await page.waitForSelector(".result-score");
    await shot(page, "09-result-pass", "Pass result after redemption (marble + unlock note)");
    await app.close();
  }

  /* ---- Scenario 2: too-low result ---- */
  {
    const dir = path.join(tmpRoot, "toolow");
    seed(dir);
    const { app, page } = await launch(dir);
    await clickNode(page, "foundation");
    for (let i = 0; i < foundation.sections.length; i++) {
      await page.waitForSelector(".option-btn:not([disabled])");
      await answer(page, (correctA[i] + 1) % 4); // all wrong
      const label = i === foundation.sections.length - 1 ? "See results" : "Continue";
      await advance(page, label);
    }
    await page.waitForSelector(".result-score");
    await shot(page, "10-result-toolow", "Too-low result: below redemption range, retake");
    await app.close();
  }

  /* ---- Scenario 3: mixed-state temple ---- */
  {
    const dir = path.join(tmpRoot, "mixed");
    seed(dir, (d) => {
      const set = (id, st, sc) => { d.nodes[id].status = st; d.nodes[id].score = sc; };
      set("foundation", "completed", 0.92);
      set("pillar-react", "completed", 1.0);
      set("pillar-nextjs", "in_progress", 0.6);
      d.foundationCompleted = true;
      d.unlockedPillars = ["pillar-react", "pillar-nextjs"];
    });
    const { app, page } = await launch(dir);
    await resize(app, SIZES.wide);
    await shot(page, "11-temple-mixed-wide", "Mixed states: completed marble, in-progress runes, locked stone");
    await resize(app, SIZES.min);
    await shot(page, "12-temple-mixed-min", "Mixed-state temple at minimum size");
    await app.close();
  }

  /* ---- Scenario 4: all complete, pediment carved ---- */
  {
    const dir = path.join(tmpRoot, "complete");
    seed(dir, (d) => {
      for (const id of Object.keys(d.nodes)) {
        d.nodes[id].status = "completed";
        d.nodes[id].score = 0.95;
      }
      d.foundationCompleted = true;
      d.unlockedPillars = Object.keys(d.nodes).filter((k) => k.startsWith("pillar-"));
    });
    const { app, page } = await launch(dir);
    await resize(app, SIZES.wide);
    await shot(page, "13-temple-complete-wide", "Every stone marble, pediment carved (the payoff)");
    await resize(app, SIZES.min);
    await shot(page, "14-temple-complete-min", "Completed temple at minimum size");
    await app.close();
  }

  /* ---- Scenario 5: keyboard-only path (acceptance criterion §5.6) ---- */
  {
    const dir = path.join(tmpRoot, "keyboard");
    seed(dir);
    const { app, page } = await launch(dir);
    // Open the foundation module with the keyboard alone.
    await page.evaluate(() => {
      document.querySelector('g.node[data-node-id="foundation"]').focus();
    });
    await page.keyboard.press("Enter");
    await page.waitForSelector(".modal-card");
    // Answer every section via number keys; Enter advances (Continue button
    // is auto-focused after each answer).
    for (let i = 0; i < foundation.sections.length; i++) {
      await page.waitForSelector(".option-btn:not([disabled])");
      await page.keyboard.press(String(correctA[i] + 1));
      await page.waitForSelector(".feedback");
      await page.keyboard.press("Enter");
    }
    await page.waitForSelector(".result-score");
    await shot(page, "15-keyboard-only-result", "Full module completed via keyboard only (Enter to open, 1-4 to answer, Enter to advance)");
    // Esc returns to the temple.
    await page.keyboard.press("Escape");
    await page.waitForSelector(".modal-card", { state: "detached" });
    await app.close();
  }

  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ generatedFrom: "scripts/audit-ux.js", shots: manifest }, null, 2)
  );
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log(`\nUX audit: ${manifest.length} screenshots -> audit/shots/`);
}

main().catch((err) => {
  console.error("audit failed:", err);
  process.exit(1);
});
