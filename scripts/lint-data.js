/**
 * Content-authoring lint — fast, build-free integrity check of the data/ files.
 *
 *   npm run lint:data
 *
 * Mirrors the "data integrity" assertions in tests/store.test.js, but runs
 * straight against the JSON (no tsc/build) and reports EVERY problem in one
 * pass so an author can fix a whole batch at once. The test suite remains the
 * authoritative gate; this is the quick feedback loop while writing quizzes.
 *
 * Checks: quiz files exist + parse; prerequisites resolve; the anti-overwhelm
 * laws (0.85 threshold, >=5 sections, 1-3 paragraphs/section); every variant
 * has 4 options + 4 aligned explanations with the correct one starting
 * "Correct —"; rationale/interviewTip present; variant ids/texts unique;
 * variants 0 and 1 never share a correct position; and glossary sanity.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const quizzesDir = path.join(dataDir, "quizzes");
const templatePath = path.join(dataDir, "progress.json");
const glossaryPath = path.join(dataDir, "glossary.json");

const problems = [];
let modules = 0;
let sections = 0;
let questions = 0;

/** Record a failure (never throws — we want the full list). */
function check(cond, message) {
  if (!cond) problems.push(message);
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    problems.push(`${label}: cannot read/parse — ${err.message}`);
    return null;
  }
}

const template = readJson(templatePath, "progress.json");

/** Lint one parsed quiz module (shared by node-referenced and extra banks). */
function lintQuiz(quiz) {
  modules++;

  check(quiz.passThreshold === 0.85, `${quiz.id}: pass threshold must be 0.85`);
  check(
    Array.isArray(quiz.sections) && quiz.sections.length >= 5,
    `${quiz.id}: needs at least 5 sections`
  );

  for (const section of quiz.sections ?? []) {
      sections++;
      const where = `${quiz.id}/${section.heading}`;
      check(
        Array.isArray(section.paragraphs) &&
          section.paragraphs.length >= 1 &&
          section.paragraphs.length <= 3,
        `${where}: chunked-feeding law wants 1-3 paragraphs`
      );

      // Normalize like the renderer: variants[] or a legacy question pair.
      const pool =
        section.variants ??
        [section.question, section.altQuestion].filter(Boolean);
      check(pool.length >= 2, `${where}: needs a pool of at least 2 variants`);

      for (const q of pool) {
        questions++;
        const id = q.id || `${where} (unnamed variant)`;
        check(
          Array.isArray(q.options) && q.options.length === 4,
          `${id}: must have exactly 4 options`
        );
        check(
          q.correctAnswerIndex >= 0 &&
            q.correctAnswerIndex < (q.options?.length ?? 0),
          `${id}: correctAnswerIndex out of range`
        );
        check(
          Array.isArray(q.optionExplanations) &&
            q.optionExplanations.length === (q.options?.length ?? 0),
          `${id}: every option needs an aligned explanation`
        );
        check(
          /^correct\b/i.test((q.optionExplanations?.[q.correctAnswerIndex] || "").trim()),
          `${id}: correctAnswerIndex must point at the "Correct —" explanation`
        );
        check((q.rationale || "").length > 0, `${id}: rationale required`);
        check((q.interviewTip || "").length > 0, `${id}: interviewTip required`);
      }

      const ids = new Set(pool.map((q) => q.id));
      check(ids.size === pool.length, `${where}: duplicate variant ids`);
      const texts = new Set(pool.map((q) => (q.question || "").trim()));
      check(texts.size === pool.length, `${where}: duplicate variant text`);
      if (pool.length >= 2) {
        check(
          pool[0].correctAnswerIndex !== pool[1].correctAnswerIndex,
          `${where}: variants 0 and 1 share a correct index (anti-rote)`
        );
      }
  }
}

if (template) {
  // Prerequisites resolve to real nodes.
  for (const node of Object.values(template.nodes)) {
    for (const pre of node.prerequisites ?? []) {
      check(template.nodes[pre], `${node.id}: requires unknown node "${pre}"`);
    }
  }

  const linted = new Set();
  for (const node of Object.values(template.nodes)) {
    const file = path.join(quizzesDir, node.quizFile);
    if (!fs.existsSync(file)) {
      problems.push(`${node.id}: missing quiz file ${node.quizFile}`);
      continue;
    }
    linted.add(node.quizFile);
    const quiz = readJson(file, node.quizFile);
    if (quiz) lintQuiz(quiz);
  }

  // Banks not referenced by a node yet (e.g. herculean.json) obey the same
  // contract — sweep the directory so nothing ships unlinted.
  for (const file of fs.readdirSync(quizzesDir)) {
    if (!file.endsWith(".json") || linted.has(file)) continue;
    const quiz = readJson(path.join(quizzesDir, file), file);
    if (quiz) lintQuiz(quiz);
  }
}

// Glossary sanity: non-empty term + definition, tags is an array, no dup terms.
const glossary = readJson(glossaryPath, "glossary.json");
let terms = 0;
if (Array.isArray(glossary)) {
  const seen = new Set();
  for (const e of glossary) {
    terms++;
    check((e.term || "").trim().length > 0, `glossary: an entry has an empty term`);
    check(
      (e.definition || "").trim().length > 0,
      `glossary "${e.term}": definition required`
    );
    check(Array.isArray(e.tags), `glossary "${e.term}": tags must be an array`);
    const key = (e.term || "").toLowerCase();
    check(!seen.has(key), `glossary: duplicate term "${e.term}"`);
    seen.add(key);
  }
} else if (glossary !== null) {
  problems.push("glossary.json: expected an array of entries");
}

/* ---- Report ---- */
console.log(
  `lint:data — ${modules} modules, ${sections} sections, ${questions} questions, ${terms} glossary terms`
);
if (problems.length === 0) {
  console.log("  OK — content is well-formed.");
  process.exit(0);
}
console.error(`\n  ${problems.length} problem(s):`);
for (const p of problems) console.error(`   - ${p}`);
process.exit(1);
