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
    // And the corrupt file was replaced with a valid one.
    const reread = JSON.parse(fs.readFileSync(path.join(tmpDir, "progress.json"), "utf-8"));
    assert.equal(reread.version, 1);
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

describe("data integrity", () => {
  const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));

  test("every node's quiz file exists and parses", () => {
    for (const node of Object.values(template.nodes)) {
      const file = path.join(quizzesDir, node.quizFile);
      assert.ok(fs.existsSync(file), `missing quiz file ${node.quizFile}`);
      assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, "utf-8")));
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
        const checkQuestion = (q, label) => {
          assert.ok(q, `${quiz.id}/${section.heading}: ${label} required`);
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
          assert.ok(q.rationale.length > 0, `${q.id}: rationale required`);
          assert.ok(q.interviewTip.length > 0, `${q.id}: interviewTip required`);
        };
        checkQuestion(section.question, "question (Test A)");
        checkQuestion(section.altQuestion, "altQuestion (Test B)");
        // The variant must be genuinely different, not a copy.
        assert.notEqual(
          section.altQuestion.id,
          section.question.id,
          `${section.question.id}: altQuestion needs a distinct id`
        );
        assert.notEqual(
          section.altQuestion.question.trim(),
          section.question.question.trim(),
          `${section.question.id}: altQuestion must pose a different question`
        );
      }
    }
  });
});
