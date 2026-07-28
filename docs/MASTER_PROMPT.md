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

## 5. Feature D — THE MAXIMUM DESIGN PASS (Phase 6)

> Role for this phase: **World-class game UI/UX lead & creative technologist.**
> Phases 1–5 shipped a working, tested app with a solid mid-2000s strategy-RPG
> temple skin. Your job now is to take that baseline and go *full-port* — the
> richest, most alive, most tactile version of this interface that a
> self-contained Electron app can be, without breaking a single invariant.
> Think Age of Mythology / Titan Quest / Diablo skill-tree: carved, glowing,
> reactive, dense, unforgettable. This is a licensed maximalist pass — spend
> the effort, but stay inside the guardrails in §5.2.

### 5.1 Ground truth — build on what exists, don't tear it out
The skin already lives in:
- `src/renderer/styles.css` — granite atmosphere, carved marble/brass panels,
  gold-foil headers, node-state styling, the stone-tablet modal.
- `src/renderer/app.ts` — the temple SVG builder (`buildDefs` gradients +
  `feTurbulence` grain filters, Doric capitals, triglyph frieze, pediment
  relief, seals, sparks, chains) and node click/shake wiring.
- `src/renderer/index.html` — the `#atmosphere` layer (light beams, motes,
  vignette) and Cinzel / Cinzel Decorative fonts (bundled locally in
  `src/renderer/fonts/`, wired via `fonts.css`).

**Start by looking at the baseline you're improving:** run `npm run audit:ux`,
then read `audit/FINDINGS.md` and open `audit/shots/`. FINDINGS already lists
the concrete defects to fix *and* a "max it out" idea list — treat it as your
opening brief and keep it updated as you go.

### 5.2 Non-negotiable guardrails (breaking any of these fails the pass)
1. **Self-contained / CSP.** The renderer runs under
   `default-src 'self'; font-src 'self'; img-src 'self' data:`. **No** CDNs,
   external fonts, remote images, or network calls. Every asset is bundled,
   inlined, or a `data:` URI. New fonts/textures ship in `src/renderer/` and
   copy via `scripts/copy-assets.js`.
2. **Security unchanged.** `sandbox: true`, `contextIsolation: true`,
   `nodeIntegration: false` stay; all privileged work goes through existing IPC.
3. **Zero renderer console errors.** The two-pass smoke check fails on *any*
   renderer error, and it reloads once — so your effects must survive a reload
   and re-init without throwing or double-binding listeners.
4. **60 fps on integrated graphics.** Animate **only** `transform`, `opacity`,
   and `filter` (compositor-friendly). Never animate `width/height/top/left` or
   anything that triggers layout. Cap the number of simultaneous heavy
   `filter`/`drop-shadow` layers; prefer pre-baked gradients/textures over
   per-frame recomputation. The temple re-renders by rebuilding the SVG on
   state change — keep that path cheap and don't attach unthrottled listeners.
5. **`prefers-reduced-motion` from the first commit.** Wrap every ambient and
   keyframe animation in `@media (prefers-reduced-motion: no-preference)`; under
   `reduce`, snap to the static end-state and keep everything usable. This is
   both an accessibility requirement *and* what keeps the audit deterministic
   (the harness emulates reduced motion; today the breathing animation forces
   Playwright to `force`-click).
6. **No new runtime dependencies.** Dev-only deps are fine.
7. **Green gate every commit** (§7): `npm test` + smoke, and `npm run audit:ux`
   for anything visual.

### 5.3 Visual surfaces to push (the maximalist wishlist)
Ship these as small, independently-reviewable slices. Not every idea is
mandatory — chase the ones with the highest wow-per-risk.

- **Atmosphere & depth.** Volumetric god-rays behind the temple; animated dust
  drifting inside the light beams; a subtle pointer-parallax on the beams and
  background granite (translate a few px on `mousemove`, rAF-throttled); a
  slow-breathing vignette. Layer for real depth, not a flat backdrop.
- **The temple as a living scene.** Torch sconces flanking the pediment with
  flickering flame + warm cast light; a slow specular highlight sweeping across
  the marble of completed nodes; locked nodes cold-desaturated with faintly
  swaying chains; richer capitals/relief that read at both window sizes
  (FINDINGS notes the pediment meander is too faint at minimum size).
- **Per-node hover.** Lift + glow bloom, a carved-cartouche tooltip naming the
  module and score, a torch-flicker intensify. Locked hover = a colder shudder
  hinting "sealed."
- **State-transition moments — the headliner.** These must fire **once, on the
  status transition** (track previous status; don't replay every render):
  - *Stone set* (node → completed): dark-to-marble wipe, gold filigree drawing
    itself on (`stroke-dashoffset`), a spark burst, the seal stamping down.
  - *Pediment unlock* (all six pillars done): a grander sequence — beams surge,
    the tympanum meander draws itself, a temple-wide gold shimmer, the capstone
    settling in. This is the emotional payoff of the whole app; make it land.
- **The modal as an artifact.** The tablet zoom-in exists; add a matching exit,
  an ink/chisel ripple on option select, a green laurel flourish on correct and
  a brief stone-crack shudder on wrong, a drop-cap or engraved rule on the
  lesson heading. Keep text AA-legible (FINDINGS flags the `.why-wrong` dim).
- **Micro-interactions.** Gold-plate button press depth + hover bloom + an
  engraved-looking focus ring; option-hover ripple; a bottom fade on the
  glossary list signalling more entries; reveal-on-scroll for glossary rows.
- **"Sound visualizer" feedback.** Per the original brief, a CSS ripple/pulse
  on click that reads as an audible tap — no actual audio required (and none
  may be fetched remotely).

### 5.4 Functional polish to ship alongside the visuals
- **Keyboard & a11y.** `1–4` select an option, `Enter` confirm/advance, `Esc`
  close the modal; roving focus; a real focus trap while the modal is open;
  ARIA (`role="dialog"`, options as a `radiogroup`, `aria-live` for feedback).
  Build on the existing `scrollIntoView` + auto-focus of the Continue button.
- **Capstone as a gauntlet.** Turn the pediment into a timed, shuffled quiz that
  draws variants across *all six pillars* (reuse `pickVariant` in practice mode
  over pillar sections) instead of a standalone 5-question module. Keep the main
  process authoritative for the pass/unlock decision.
- **Window state.** Remember size / position / maximized across launches (a
  small `window-state.json` in `userData`, restored on `createWindow`, guarded
  against off-screen bounds). Never let it collide with the save files.
- Clear the remaining **FINDINGS** items (reduced-motion, contrast, keyboard).

### 5.5 How to work
Iterate visually: after each slice run `npm run audit:ux`, eyeball
`audit/shots/`, and update `audit/FINDINGS.md`. Commit in small themed slices
(atmosphere → node states → completion moments → modal → keyboard → capstone →
window state), gating green each time. Add the `prefers-reduced-motion` guard
*as you write each animation*, not as a cleanup afterthought.

### 5.6 Acceptance
- Every ambient/keyframe animation is guarded by `prefers-reduced-motion`;
  under `reduce` the app is fully usable and the audit clicks nodes **without**
  `force`.
- The *stone-set* and *pediment-unlock* moments fire exactly once on transition
  (not per render), demonstrably captured by the audit or a described capture.
- A full **keyboard-only** path works: open a module, answer with `1–4`+`Enter`,
  finish, `Esc` — no mouse, focus never escapes the modal.
- Only `transform`/`opacity`/`filter` are animated; no layout-triggering
  properties animate; interaction stays smooth on integrated graphics.
- CSP is unchanged and **no external request is made** (grep the built renderer
  for `http`/CDN/font URLs — must be none).
- `npm test` + two-pass smoke green; `npm run audit:ux` still produces every
  state; `npm run dist:win` still packages.

*(Resume-mid-module, once a §5 item, shipped in Phase 1 — see §3.6.)*

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

## 8. Execution order & status

**Phases 1–5 are complete and on `main`** (verified: 31 tests green, two-pass
smoke clean, `audit:ux` produces all states):
1. ~~Dev-loop reload safety & live persistence (§3.6).~~ **Done.**
2. ~~Schema + selection refactor — `variants[]` + `pickVariant` (§2).~~ **Done.**
3. ~~Author variants C/D — 4-question bank per concept, 164 total (§2.3).~~ **Done.**
4. ~~Replayability — v2 migration, `review.ts`, practice mode, review deck (§3).~~ **Done.**
5. ~~Playwright audit harness + high-severity fix (§4).~~ **Done.**

6. ~~**The Maximum Design Pass** (§5) — shipped in six slices: (A) reduced
   motion + legibility, (B) keyboard/a11y + focus trap, (C) one-shot stone-set
   + grand pediment unlock, (D) living temple (torches/sheen/toast/parallax),
   (E) window-state persistence, (F) the timed cross-pillar Capstone
   Gauntlet.~~ **Done — all §5.6 acceptance criteria verified.**

Deliver each slice working and verified. Report what you changed, what the
audit found, and anything in §1.2 that a requested change would have forced —
before forcing it.
