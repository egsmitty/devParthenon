# Dev Parthenon — Master Build Prompt for Fable (Boss Coder)

> Paste this whole document as the task for an autonomous Claude (Fable) session
> working in `C:\WebDev\devParthenon` (repo: `github.com/egsmitty/devParthenon`,
> branch `main`). It is written against the *actual* current codebase, so treat
> the "Ground truth" section as fact you can rely on — verify only if a file
> contradicts it.

---

## 0. Role & operating contract

You are the lead engineer on Dev Parthenon, an offline Electron + TypeScript
desktop app that teaches web dev from foundations to interview-readiness,
visualized as a Greek temple. You are extending a working, tested, shipped app —
**not greenfield**. Protect what works; extend deliberately.

Rules of engagement:
- Work in small, verifiable commits. After each feature, run the full gate
  (§7) and commit only when green.
- Never regress an invariant in §1.2. If a change forces one, stop and surface
  it instead of silently breaking it.
- Prefer editing the existing architecture over rewrites. The store, IPC, and
  schema patterns are deliberate.
- Every new data file or schema field ships with: a TypeScript type, a
  validating assertion in `tests/store.test.js`, and a migration path if it
  touches persisted `progress.json`.
- Zero new runtime dependencies unless a feature is impossible without one
  (Playwright is a *dev* dependency — that's allowed).

---

## 1. Ground truth: current state

### 1.1 What exists and works
- **Structure**: foundation node → 6 pillar nodes (react, nextjs, node,
  databases, tailwind, git) → pediment capstone. Sequential prerequisites;
  pediment unlocks when all 6 pillars are `completed`.
- **Pass rule**: `PASS_THRESHOLD = 0.85` in `src/main/store.ts` (authoritative).
  A node becomes `completed` at ≥85%, else `in_progress`. Completed never
  downgrades. Passing a node unlocks any node whose prerequisites are all met.
- **Persistence**: atomic temp-file + rename to
  `%APPDATA%/DevParthenon/progress.json`, seeded from `data/progress.json` on
  first run; corrupt-save self-heals from the template. `ProgressData.version`
  is currently `1`.
- **Quiz content**: `data/quizzes/*.json` (8 modules, 41 sections). Each
  `LessonSection` has `heading`, `paragraphs` (≤3, enforced), a primary
  `question` (**Test A**) and an `altQuestion` (**Test B**) — same concept,
  different scenario/answer. 82 questions total. Every question has exactly 4
  options, 4 per-option `optionExplanations`, `rationale`, `interviewTip`.
- **Answer positions** are evenly distributed across indices 0–3; Test A and B
  of a section never share a correct index. Don't undo this.
- **Redemption Round** (`src/renderer/modal.ts`): score within 15 points of 85%
  → re-quiz missed sections using their **Test B** variant; corrected variants
  earn back their point value, capped at +15%; `final = min(1, base + back)`.
  More than 15 short → retake. Main process only ever receives the final number.
- **UI**: frameless dark Win11 title bar, SVG temple in `src/renderer/app.ts`
  (states `locked`/`unlocked`/`in_progress`/`completed`), quiz modal in
  `modal.ts`, glossary sidebar. Renderer runs under `contextIsolation: true`,
  `sandbox: true`, `nodeIntegration: false`; IPC via `contextBridge`.
- **Verification**: `npm test` (tsc + `node --test`, 15 tests incl. data
  integrity), a headless smoke mode (`PARTHENON_SMOKE=1`) that boots the app,
  round-trips IPC, asserts the temple rendered, and exits nonzero on any
  renderer console error. `npm run dist:win` packages NSIS + portable.

### 1.2 Invariants you must not break
1. Renderer stays sandboxed; all privileged work goes through the existing IPC
   handlers with validated arguments. No `nodeIntegration`, no fs in renderer.
2. `src/main/store.ts` remains Electron-free and the single source of truth for
   unlock state. Unit-testable with plain Node.
3. Writes stay atomic (temp + rename). No naive `writeFileSync` onto the live
   file.
4. Anti-overwhelm law: ≤3 teaching paragraphs before an interactive check.
5. Every quiz question: exactly 4 options, 4 aligned `optionExplanations`,
   `correctAnswerIndex` points at the option whose explanation starts
   "Correct —".
6. Existing `progress.json` files in the wild must keep loading — bump
   `version` and migrate, never break.
7. `npm test` and the smoke check are green before any commit.
8. Committed progress survives every reload, relaunch, `npm run dev` rebuild,
   and crash. In-progress module work must not silently vanish on a renderer
   refresh (see §3.6).

---

## 2. Feature A — N-level variant banks (Test A/B/C/D…)

Generalize the A/B pair into an ordered **variant pool** per section so the app
can draw a fresh question on every encounter.

### 2.1 Schema (in `src/types/schema.ts`)
Introduce `variants: QuizQuestion[]` on `LessonSection` (length ≥ 2, ideally
4). Keep `question` and `altQuestion` as **deprecated optional aliases** for one
release so nothing breaks mid-migration, but make `variants` the source of
truth. Add a normalization helper: if `variants` is absent, synthesize it from
`[question, altQuestion]`.

```ts
export interface LessonSection {
  heading: string;
  paragraphs: string[];       // ≤3
  variants: QuizQuestion[];   // ordered pool; index 0 is the canonical "Test A"
  /** @deprecated superseded by variants[0]; kept for one migration cycle */
  question?: QuizQuestion;
  /** @deprecated superseded by variants[1] */
  altQuestion?: QuizQuestion;
}
```

### 2.2 Selection policy (renderer)
A pure, testable `pickVariant(section, context)` function:
- **First graded pass**: `variants[0]` (deterministic, so the canonical bar is
  stable across users).
- **Redemption Round**: the *next* unused variant for that section this attempt
  (index 1, then 2…), never repeating what was just shown.
- **Practice/replay (Feature B)**: random variant, but cycle the whole pool
  before repeating (shuffle-bag, not naive random — no immediate repeats).
- Selection state (which variants were shown this attempt) lives in renderer
  session state, not persisted.

### 2.3 Authoring the extra variants at scale
You need Test C and D (and optionally E) for all 41 sections. Do it with
**parallel subagents, one per module file** (there are 8). Each agent:
1. Reads its `data/quizzes/<module>.json`.
2. For every section, appends new variants to reach the target pool size,
   mirroring the exact `QuizQuestion` shape (id = `<qid>-c`, `-d`, …).
3. Each variant tests the *same* interview trap with a genuinely different
   scenario, reworded options, independently-correct answer.
4. Preserves all existing content; writes valid 2-space JSON.

Then run the **answer-distribution pass** (a Node script): rotate each
question's `options` + `optionExplanations` in lockstep so correct positions
spread evenly and no two variants in a section share a correct index; verify
every `correctAnswerIndex` still lands on the "Correct —" explanation. (This
script already exists in git history from the A/B work — reuse its logic.)

### 2.4 Acceptance
- `variants.length ≥ 3` for every section (target 4); integrity test updated to
  validate *every* variant, distinct ids, distinct question text within a pool.
- Even correct-index distribution across the whole bank (assert no index holds
  > 40% of correct answers).
- Redemption never shows a variant already seen in that attempt.

---

## 3. Feature B — Replayability & relearn system

Let a learner revisit mastered material without disturbing their canonical
progress, and let the app steer them toward weak spots.

### 3.1 Practice Mode
- Completed nodes get a secondary **"Practice"** affordance on the temple
  (distinct from the primary click). Locked/unlocked nodes don't show it.
- Practice runs the full lesson+quiz flow but with **random variants** (§2.2)
  and does **not** alter unlock state. It may *raise* the stored best score but
  never lower it, and never re-locks anything.
- Practice is available for the whole module or a single section ("drill this
  concept").

### 3.2 Weak-spot review deck
- Track per-section miss data in `ProgressData` (new, migrated, `version: 2`):
  `sectionStats: Record<string, { seen: number; missed: number; lastSeenISO: string; nextReviewISO: string }>`
  keyed by `"<nodeId>/<sectionIndex>"`. Update on every graded or practice answer.
- A global **"Review"** entry (button near the glossary) assembles a cross-module
  quiz of the highest-miss / soonest-due concepts, pulling fresh variants.

### 3.3 Spaced repetition
- Implement a lightweight SM-2-style scheduler in a new Electron-free module
  `src/main/review.ts` (unit-tested): correct answer pushes `nextReviewISO`
  further out (e.g. 1d → 3d → 7d → 21d), a miss resets it to 1d. The Review deck
  orders by `nextReviewISO` ascending, then by miss rate.
- Time comes from the main process (`new Date().toISOString()`), passed to the
  renderer — keep the renderer from inventing its own clock so it's testable.

### 3.4 Persistence & migration
- Bump `ProgressData.version` to `2`. On load, if `version < 2`, add the
  `sectionStats` map (empty) and any new fields, then rewrite atomically.
  Add a store test that a `version: 1` file upgrades cleanly and keeps scores.

### 3.5 Acceptance
- Practicing a completed pillar never changes which nodes are unlocked.
- A `version: 1` save loads, upgrades to `version: 2`, retains all scores.
- Missing a concept moves it to the front of the Review deck; getting it right
  repeatedly pushes it back. Covered by `review.ts` unit tests.

### 3.6 Dev-loop reload safety & live (mid-module) persistence — FOUNDATIONAL, DO FIRST

Two concrete defects in the current build:
- `npm run dev` (`npm run build && electron . --dev`) passes a `--dev` flag that
  `main.ts` **ignores entirely** — no live reload, no DevTools. The
  "live-reload mode" wording in `package.json` is inaccurate. Make the dev loop
  honest: either implement real reload (watch `dist/`, `webContents.reload()`
  or relaunch on change) or rename the script; and open DevTools when `--dev`
  is present so a manual refresh is a first-class, expected action.
- A renderer reload (Ctrl+R) or an app close/crash **mid-module** discards the
  in-progress attempt — the learner restarts that module from section 1.
  Committed scores are safe (atomic writes to `%APPDATA%`, re-read on init);
  only the uncommitted, renderer-memory attempt is lost. Close that gap.

Requirements:
1. **Committed progress must survive** any reload, relaunch, dev rebuild, or
   crash. Already true via atomic writes — *lock it in* with a test that saves a
   score, simulates a reload (fresh `loadProgress`), and asserts persistence.
2. **Live mid-module persistence.** Autosave the active attempt (node id,
   current section index, chosen answers, redemption phase/queue, earned-back
   points) as the learner advances — either to a separate atomic `attempt.json`
   via a new `save-attempt` / `get-attempt` / `clear-attempt` IPC trio, or as an
   `activeAttempt` field on `ProgressData`. On launch/reload, if an attempt
   exists, offer **"Resume where you left off"** vs "Start over"; clear it on
   module completion or explicit abandon. Autosave uses the same temp-file +
   rename discipline — never a naive write.
3. **Reload during dev must be clean**: `init()` re-running must not double-
   register IPC/event listeners or leak, and must repaint the temple from disk
   with zero console errors. Extend the smoke check to reload the window once
   and re-assert (nodes present, temple rendered, no renderer errors).
4. Don't let the dev live-reload watcher touch or race the save files.

Acceptance:
- Reloading (Ctrl+R) or killing the app mid-section and relaunching resumes the
  exact section with prior answers and redemption state intact.
- `npm run dev`, edit a renderer file, re-run — committed progress never lost;
  the script's behavior matches its description.
- A unit test proves committed scores survive a simulated reload; the smoke
  check reloads once and stays error-free.

This **supersedes** the "Resume mid-module" bullet in §5 and is Phase 1 in §8.

---

## 4. Feature C — Playwright visual + UX audit

Add a **dev-only** Playwright harness that drives the app, captures the key
states as screenshots, and produces a UX critique. This is opt-in and
power-hungry — gate it behind its own npm script, never the default test run.

### 4.1 Harness
- Add `@playwright/test` as a dev dependency and `npm run audit:ux`.
- Use Playwright's Electron support (`_electron.launch({ args: ['.'] })`) so you
  test the *real* app, IPC and all. Point it at a **temp userData dir** (set
  `PARTHENON_USERDATA` env override in `main.ts`) so the audit uses a throwaway
  `progress.json` and can script any progress state without touching the
  learner's real save.
- Add a tiny test hook: honor `PARTHENON_SEED=<path>` to load a specific
  progress fixture, so the harness can render "all pillars complete, pediment
  unlocked" without clicking through 41 sections.

### 4.2 States to capture (screenshot each, at 1280×840 and at min size 980×680)
1. Fresh temple — foundation unlocked, everything else locked (lock badges).
2. A lesson section open (paragraphs + first check).
3. A question answered **correctly** (green feedback + interview tip).
4. A question answered **wrong** (red feedback + why-wrong + tip).
5. Redemption intro screen.
6. A redemption (Test B) question.
7. Pass result (marble/gold) + an unlock note.
8. Fail/too-low result.
9. Fully completed temple with the pediment carved.
10. Glossary with an active search filter.

### 4.3 The judging pass
- Feed the screenshots to a review agent (or the `frontend-design` skill) with a
  rubric: visual hierarchy, contrast/legibility (WCAG AA on text), whether the
  four node states are instantly distinguishable, marble/gold metaphor clarity,
  modal readability and scroll behavior, layout integrity at the minimum window
  size, and motion/feedback quality.
- Output a **prioritized findings list** (severity, screenshot ref, concrete
  fix). Then implement the high-severity fixes and re-run the audit to confirm.

### 4.4 Acceptance
- `npm run audit:ux` produces all 10 screenshots (both sizes) plus a written
  findings report under `audit/`.
- No horizontal scrollbars or clipped modals at 980×680.
- Text meets AA contrast; the four states are visually unambiguous.
- The audit never mutates the real `%APPDATA%` save.

---

## 5. Feature D — supporting polish (stretch, do after A–C)

Pick up as budget allows; each is independently shippable:
- **Resume mid-module**: *promoted to a foundational requirement — see §3.6.*
- **Keyboard support**: `1–4` to answer, `Enter` to continue, `Esc` to close;
  proper focus trap and ARIA roles on the modal.
- **Capstone as a real gauntlet**: make the pediment a timed, shuffled quiz that
  pulls variants across all six pillars, not a standalone 5-question module.
- **Completion payoff**: a carve/marble animation when a pillar completes and a
  distinct one when the pediment finally unlocks.
- **Window state**: remember size/position/maximized between launches.

---

## 6. Migration & backward-compat checklist
- Quiz files: `variants[]` added, `question`/`altQuestion` kept as optional
  aliases for one cycle; a normalizer bridges old and new. Remove the aliases
  only in a later, explicit cleanup commit.
- `progress.json`: `version` 1 → 2 with an idempotent upgrade on load; never
  assume new fields exist without defaulting them.
- Renderer selection state is session-only; nothing new leaks into the save
  except `sectionStats` and the bumped version.

---

## 7. Verification gate (run before every commit)
```
npm test            # tsc (main+renderer) + node --test; all green
PARTHENON_SMOKE=1 npx electron .   # exits 0, zero renderer errors
```
Plus, for the relevant feature:
```
npm run audit:ux    # Feature C only; screenshots + report generated
npm run dist:win    # packaging still succeeds (see README winCodeSign note)
```
Reload safety (§3.6): reload the renderer mid-module and confirm the attempt
resumes; relaunch and confirm committed scores persist; the smoke check reloads
once and stays error-free.
Data sanity after any content change: a Node pass asserting every variant has
4 options / 4 aligned explanations, `correctAnswerIndex` → "Correct —", and an
even answer-index distribution.

---

## 8. Suggested execution order
1. **Dev-loop reload safety & live persistence** (§3.6) — foundational; makes
   the dev/build loop honest and stops mid-module work from vanishing on
   refresh. Gate green, commit.
2. **Schema + selection refactor** (Feature A §2.1–2.2) with the normalizer, so
   nothing breaks while the pool is still size 2. Gate green, commit.
3. **Author variants C/D** via parallel agents, run the distribution + alignment
   script, extend the integrity test. Gate, commit.
4. **Replayability** (Feature B): `version: 2` migration, `sectionStats`,
   `review.ts` + tests, Practice affordance, Review deck. Gate, commit.
5. **Playwright audit** (Feature C): harness, fixtures, screenshots, judging,
   then implement the high-severity UX fixes. Gate, commit.
6. **Polish** (Feature D) as budget allows, one commit each.

Deliver each phase working and verified. Report what you changed, what the
audit found, and anything in §1.2 that a requested change would have forced —
before forcing it.
