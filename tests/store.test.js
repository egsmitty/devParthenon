/**
 * Unit tests for the progress store: template cloning, the Pillar
 * Progression Rule, prerequisite unlocking, atomic persistence, and
 * quiz-data integrity. Run with: node --test tests/
 * (requires a prior `npm run build` for dist/main/store.js)
 */
const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const store = require("../dist/main/store.js");
const review = require("../dist/main/review.js");

const templatePath = path.join(__dirname, "..", "data", "progress.json");
const quizzesDir = path.join(__dirname, "..", "data", "quizzes");

let tmpDir;
let paths;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "parthenon-test-"));
  paths = { userDataDir: tmpDir, templatePath };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadProgress", () => {
  test("clones the template on first run", () => {
    const data = store.loadProgress(paths);
    assert.ok(fs.existsSync(path.join(tmpDir, "progress.json")));
    assert.equal(data.foundationCompleted, false);
    assert.equal(data.nodes["foundation"].status, "unlocked");
    assert.equal(data.nodes["pillar-react"].status, "locked");
  });

  test("recovers from a corrupt save file", () => {
    fs.writeFileSync(path.join(tmpDir, "progress.json"), "{not valid json!!", "utf-8");
    const data = store.loadProgress(paths);
    assert.equal(data.foundationCompleted, false);
    // And the corrupt file was replaced with a valid, migrated one.
    const reread = JSON.parse(fs.readFileSync(path.join(tmpDir, "progress.json"), "utf-8"));
    assert.equal(reread.version, store.PROGRESS_VERSION);
  });
});

describe("saveQuizScore — pillar progression rule", () => {
  test("passing the foundation unlocks only pillar 1", () => {
    const result = store.saveQuizScore(paths, "foundation", 0.85);
    assert.equal(result.passed, true);
    assert.equal(result.progress.foundationCompleted, true);
    assert.deepEqual(result.newlyUnlocked, ["pillar-react"]);
    assert.equal(result.progress.nodes["pillar-react"].status, "unlocked");
    assert.equal(result.progress.nodes["pillar-nextjs"].status, "locked");
    assert.deepEqual(result.progress.unlockedPillars, ["pillar-react"]);
  });

  test("a score below 85% does not complete or unlock anything", () => {
    const result = store.saveQuizScore(paths, "foundation", 0.84);
    assert.equal(result.passed, false);
    assert.equal(result.progress.nodes["foundation"].status, "in_progress");
    assert.equal(result.progress.foundationCompleted, false);
    assert.deepEqual(result.newlyUnlocked, []);
    assert.equal(result.progress.nodes["pillar-react"].status, "locked");
  });

  test("exactly 85% passes; 84% does not", () => {
    assert.equal(store.saveQuizScore(paths, "foundation", 0.85).passed, true);
    store.resetProgress(paths);
    assert.equal(store.saveQuizScore(paths, "foundation", 0.84).passed, false);
  });

  test("attempting a locked pillar throws (prerequisite locking)", () => {
    assert.throws(
      () => store.saveQuizScore(paths, "pillar-nextjs", 1),
      /locked/
    );
  });

  test("unknown node id throws", () => {
    assert.throws(() => store.saveQuizScore(paths, "pillar-cobol", 1), /Unknown/);
  });

  test("a later lower score never downgrades the best score", () => {
    store.saveQuizScore(paths, "foundation", 0.9);
    const result = store.saveQuizScore(paths, "foundation", 0.5);
    assert.equal(result.progress.nodes["foundation"].score, 0.9);
    // A completed node stays completed even after a weak replay.
    assert.equal(result.progress.nodes["foundation"].status, "completed");
  });

  test("completing all six pillars unlocks the pediment", () => {
    const order = [
      "foundation",
      "pillar-react",
      "pillar-nextjs",
      "pillar-node",
      "pillar-databases",
      "pillar-tailwind",
      "pillar-git",
    ];
    let last;
    for (const id of order) last = store.saveQuizScore(paths, id, 1);
    assert.deepEqual(last.newlyUnlocked, ["pediment"]);
    assert.equal(last.progress.nodes["pediment"].status, "unlocked");
    assert.equal(last.progress.unlockedPillars.length, 6);
  });
});

describe("persistence", () => {
  test("scores survive a reload from disk", () => {
    store.saveQuizScore(paths, "foundation", 0.85);
    const reloaded = store.loadProgress(paths);
    assert.equal(reloaded.nodes["foundation"].status, "completed");
    assert.equal(reloaded.nodes["foundation"].score, 0.85);
  });

  test("rapid repeated writes never corrupt the file", () => {
    store.saveQuizScore(paths, "foundation", 0.9);
    for (let i = 0; i < 50; i++) {
      store.saveQuizScore(paths, "pillar-react", i % 2 ? 0.5 : 0.95);
      // The file must be valid JSON after every single write.
      const raw = fs.readFileSync(path.join(tmpDir, "progress.json"), "utf-8");
      assert.doesNotThrow(() => JSON.parse(raw));
    }
    // No stray temp file left behind.
    assert.equal(fs.existsSync(path.join(tmpDir, "progress.json.tmp")), false);
  });

  test("resetProgress restores the pristine template", () => {
    store.saveQuizScore(paths, "foundation", 1);
    const fresh = store.resetProgress(paths);
    assert.equal(fresh.foundationCompleted, false);
    assert.equal(fresh.nodes["foundation"].status, "unlocked");
    assert.equal(fresh.nodes["foundation"].score, null);
    const onDisk = store.loadProgress(paths);
    assert.equal(onDisk.foundationCompleted, false);
  });
});

describe("attempt persistence (§3.6 reload safety)", () => {
  const sampleAttempt = {
    nodeId: "foundation",
    phase: "lesson",
    sectionIndex: 3,
    correct: 2,
    missed: [1],
    redeemQueue: [],
    redeemPoints: 0,
  };

  test("an attempt survives a save/load round-trip (simulated reload)", () => {
    store.saveAttempt(paths, sampleAttempt);
    const loaded = store.loadAttempt(paths);
    assert.equal(loaded.nodeId, "foundation");
    assert.equal(loaded.sectionIndex, 3);
    assert.deepEqual(loaded.missed, [1]);
    assert.ok(loaded.savedAtISO, "save is timestamped");
    // No stray temp file — the write was atomic.
    assert.equal(fs.existsSync(path.join(tmpDir, "attempt.json.tmp")), false);
  });

  test("no attempt returns null; clear removes it", () => {
    assert.equal(store.loadAttempt(paths), null);
    store.saveAttempt(paths, sampleAttempt);
    store.clearAttempt(paths);
    assert.equal(store.loadAttempt(paths), null);
  });

  test("a corrupt attempt file is discarded, not fatal", () => {
    fs.writeFileSync(path.join(tmpDir, "attempt.json"), "{oops", "utf-8");
    assert.equal(store.loadAttempt(paths), null);
    assert.equal(fs.existsSync(path.join(tmpDir, "attempt.json")), false);
  });

  test("grading a score clears the stale attempt", () => {
    store.saveAttempt(paths, sampleAttempt);
    store.saveQuizScore(paths, "foundation", 0.9);
    assert.equal(store.loadAttempt(paths), null);
  });

  test("committed progress is untouched by attempt churn", () => {
    store.saveQuizScore(paths, "foundation", 0.9);
    store.saveAttempt(paths, { ...sampleAttempt, nodeId: "pillar-react" });
    store.clearAttempt(paths);
    const reloaded = store.loadProgress(paths);
    assert.equal(reloaded.nodes["foundation"].status, "completed");
    assert.equal(reloaded.nodes["foundation"].score, 0.9);
  });
});

describe("variant selection policy (pickVariant)", () => {
  const { pathToFileURL } = require("node:url");
  const variantsUrl = pathToFileURL(
    path.join(__dirname, "..", "dist", "renderer", "variants.js")
  ).href;

  const mkQ = (id, idx) => ({
    id,
    question: `q-${id}`,
    options: ["a", "b", "c", "d"],
    correctAnswerIndex: idx,
    rationale: "r",
    optionExplanations: ["", "", "", ""],
    interviewTip: "t",
  });
  const section = {
    heading: "h",
    paragraphs: ["p"],
    variants: [mkQ("x-a", 0), mkQ("x-b", 1), mkQ("x-c", 2)],
  };

  test("graded mode always returns the canonical variants[0]", async () => {
    const { pickVariant } = await import(variantsUrl);
    for (let i = 0; i < 5; i++) {
      assert.equal(pickVariant(section, { mode: "graded" }).id, "x-a");
    }
  });

  test("redeem mode returns the first unseen variant, never a repeat", async () => {
    const { pickVariant } = await import(variantsUrl);
    assert.equal(
      pickVariant(section, { mode: "redeem", usedIds: new Set(["x-a"]) }).id,
      "x-b"
    );
    assert.equal(
      pickVariant(section, { mode: "redeem", usedIds: new Set(["x-a", "x-b"]) }).id,
      "x-c"
    );
    // Pool exhausted: falls back to the first non-canonical variant.
    assert.equal(
      pickVariant(section, {
        mode: "redeem",
        usedIds: new Set(["x-a", "x-b", "x-c"]),
      }).id,
      "x-b"
    );
  });

  test("practice mode draws only from unused variants (shuffle-bag)", async () => {
    const { pickVariant } = await import(variantsUrl);
    const picked = pickVariant(section, {
      mode: "practice",
      usedIds: new Set(["x-a", "x-c"]),
      rng: () => 0.99,
    });
    assert.equal(picked.id, "x-b");
  });

  test("legacy question/altQuestion sections normalize into a pool", async () => {
    const { sectionVariants } = await import(variantsUrl);
    const legacy = { heading: "h", paragraphs: ["p"], question: mkQ("l-a", 0), altQuestion: mkQ("l-b", 1) };
    assert.deepEqual(sectionVariants(legacy).map((q) => q.id), ["l-a", "l-b"]);
  });
});

describe("v1 -> v2 migration (review scheduler)", () => {
  test("a version:1 save upgrades to v2 and keeps scores", () => {
    // Seed a v1-shaped save (no version field, no sectionStats).
    const v1 = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
    delete v1.version;
    delete v1.sectionStats;
    v1.nodes["foundation"].status = "completed";
    v1.nodes["foundation"].score = 0.9;
    v1.foundationCompleted = true;
    fs.writeFileSync(path.join(tmpDir, "progress.json"), JSON.stringify(v1), "utf-8");

    const loaded = store.loadProgress(paths);
    assert.equal(loaded.version, store.PROGRESS_VERSION);
    assert.deepEqual(loaded.sectionStats, {});
    // Scores/unlock state preserved through the upgrade.
    assert.equal(loaded.nodes["foundation"].status, "completed");
    assert.equal(loaded.nodes["foundation"].score, 0.9);

    // Upgrade was persisted, not just in-memory.
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, "progress.json"), "utf-8"));
    assert.equal(onDisk.version, store.PROGRESS_VERSION);
    assert.ok(onDisk.sectionStats);
  });

  test("recordSectionResult accumulates per-concept stats", () => {
    store.recordSectionResult(paths, "foundation", 2, false);
    store.recordSectionResult(paths, "foundation", 2, true);
    const data = store.loadProgress(paths);
    const stat = data.sectionStats["foundation/2"];
    assert.equal(stat.seen, 2);
    assert.equal(stat.missed, 1);
    assert.equal(stat.streak, 1); // reset by the miss, then +1 for the correct
    assert.ok(stat.nextReviewISO);
  });

  test("recordSectionResult rejects unknown nodes", () => {
    assert.throws(() => store.recordSectionResult(paths, "pillar-cobol", 0, true), /Unknown/);
  });
});

describe("SM-2-lite scheduler (review.ts)", () => {
  const t0 = "2026-01-01T00:00:00.000Z";
  const days = (iso, n) =>
    new Date(Date.parse(iso) + n * 86400000).toISOString();

  test("a correct answer schedules the next review one interval out", () => {
    const s = review.recordResult(undefined, true, t0);
    assert.equal(s.seen, 1);
    assert.equal(s.streak, 1);
    // First interval is 1 day.
    assert.equal(s.nextReviewISO, days(t0, review.INTERVALS_DAYS[0]));
  });

  test("streak lengthens the interval; a miss resets it to 1 day", () => {
    let s = review.recordResult(undefined, true, t0); // streak 1, +1d
    s = review.recordResult(s, true, t0); // streak 2, +3d
    assert.equal(s.nextReviewISO, days(t0, review.INTERVALS_DAYS[1]));
    s = review.recordResult(s, false, t0); // miss -> streak 0, +1d
    assert.equal(s.streak, 0);
    assert.equal(s.missed, 1);
    assert.equal(s.nextReviewISO, days(t0, 1));
  });

  test("orderDeck puts the most-overdue concept first", () => {
    const soon = { seen: 1, missed: 1, streak: 0, lastSeenISO: t0, nextReviewISO: days(t0, 1) };
    const later = { seen: 3, missed: 0, streak: 3, lastSeenISO: t0, nextReviewISO: days(t0, 21) };
    const ordered = review.orderDeck([
      { key: "a/0", stat: later },
      { key: "b/0", stat: soon },
    ]);
    assert.equal(ordered[0].key, "b/0");
  });

  test("isDue is true only once the review date has passed", () => {
    const s = review.recordResult(undefined, true, t0); // due in 1 day
    assert.equal(review.isDue(s, t0), false);
    assert.equal(review.isDue(s, days(t0, 2)), true);
  });
});

describe("settings persistence", () => {
  test("defaults when no file exists", () => {
    const s = store.loadSettings(paths);
    assert.equal(s.theme, "temple-dark");
    assert.equal(s.optionLabels, "letters");
    assert.equal(s.fontScale, 1);
    assert.equal(s.introSeen, false);
  });

  test("save merges a patch and persists atomically", () => {
    store.saveSettings(paths, { theme: "parchment", introSeen: true });
    const s = store.loadSettings(paths);
    assert.equal(s.theme, "parchment");
    assert.equal(s.introSeen, true);
    assert.equal(s.optionLabels, "letters"); // untouched
    assert.equal(fs.existsSync(path.join(tmpDir, "settings.json.tmp")), false);
  });

  test("sanitizes bad values", () => {
    store.saveSettings(paths, { theme: "neon", fontScale: 99, optionLabels: "x" });
    const s = store.loadSettings(paths);
    assert.equal(s.theme, "temple-dark");
    assert.equal(s.fontScale, 1.4); // clamped
    assert.equal(s.optionLabels, "letters");
  });

  test("corrupt settings file falls back to defaults", () => {
    fs.writeFileSync(path.join(tmpDir, "settings.json"), "{broken", "utf-8");
    assert.equal(store.loadSettings(paths).theme, "temple-dark");
  });
});

describe("data integrity", () => {
  const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));

  test("every node's quiz file exists and parses", () => {
    for (const node of Object.values(template.nodes)) {
      const file = path.join(quizzesDir, node.quizFile);
      assert.ok(fs.existsSync(file), `missing quiz file ${node.quizFile}`);
      assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, "utf-8")));
    }
  });

  test("built renderer has no inline style= attributes (CSP style-src self)", () => {
    const dir = path.join(__dirname, "..", "dist", "renderer");
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".js")) continue;
      const src = fs.readFileSync(path.join(dir, f), "utf-8");
      assert.ok(
        !/style="/.test(src),
        `${f} emits an inline style= attribute — use CSSOM (element.style) instead`
      );
    }
  });

  test("every prerequisite refers to a real node", () => {
    for (const node of Object.values(template.nodes)) {
      for (const pre of node.prerequisites) {
        assert.ok(template.nodes[pre], `${node.id} requires unknown node ${pre}`);
      }
    }
  });

  test("quiz modules obey the anti-overwhelm laws", () => {
    for (const node of Object.values(template.nodes)) {
      const quiz = JSON.parse(
        fs.readFileSync(path.join(quizzesDir, node.quizFile), "utf-8")
      );
      assert.equal(quiz.passThreshold, 0.85, `${quiz.id} pass threshold`);
      assert.ok(quiz.sections.length >= 5, `${quiz.id} has too few sections`);
      for (const section of quiz.sections) {
        assert.ok(
          section.paragraphs.length >= 1 && section.paragraphs.length <= 3,
          `${quiz.id}/${section.heading}: chunked-feeding law (1-3 paragraphs)`
        );
        // Normalize like the renderer does: variants[] or legacy pair.
        const pool =
          section.variants ??
          [section.question, section.altQuestion].filter(Boolean);
        assert.ok(
          pool.length >= 2,
          `${quiz.id}/${section.heading}: needs a pool of at least 2 variants`
        );
        for (const q of pool) {
          assert.equal(q.options.length, 4, `${q.id}: must have exactly 4 options`);
          assert.ok(
            q.correctAnswerIndex >= 0 && q.correctAnswerIndex < q.options.length,
            `${q.id}: correctAnswerIndex out of range`
          );
          assert.equal(
            q.optionExplanations.length,
            q.options.length,
            `${q.id}: every option needs a why-wrong/why-right explanation`
          );
          assert.match(
            (q.optionExplanations[q.correctAnswerIndex] || "").trim(),
            /^correct\b/i,
            `${q.id}: correctAnswerIndex must point at the "Correct —" explanation`
          );
          assert.ok(q.rationale.length > 0, `${q.id}: rationale required`);
          assert.ok(q.interviewTip.length > 0, `${q.id}: interviewTip required`);
        }
        // Variants must be genuinely different questions, not copies.
        const ids = new Set(pool.map((q) => q.id));
        assert.equal(ids.size, pool.length, `${pool[0].id}: duplicate variant ids`);
        const texts = new Set(pool.map((q) => q.question.trim()));
        assert.equal(texts.size, pool.length, `${pool[0].id}: duplicate variant text`);
        // The graded check and the first redemption variant never share a
        // correct position (anti-rote).
        assert.notEqual(
          pool[0].correctAnswerIndex,
          pool[1].correctAnswerIndex,
          `${pool[0].id}: variants 0 and 1 share a correct index`
        );
      }
    }
  });
});
