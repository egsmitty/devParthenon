# Dev Parthenon — open ToDo (handoff to next session)

Read `CLAUDE.md` first (guardrails, gate, gotchas), then this. Everything is
committed and pushed to `main`; the tree is clean. Gate = `npm run verify`
(build + 38 tests + two-pass smoke); for visual work also `npm run audit:ux`
and eyeball `audit/shots/`. Commit in small slices, gate green each time.
**Gotcha reminder:** no inline `style=` attributes (CSP — use `element.style`
via CSSOM; a test enforces this). Capture transient UI with a throwaway
Playwright script that does NOT emulate reduced motion.

## In progress / next up (from the user's latest requests)

### 1. Two-column lesson layout  ← was mid-build when we handed off
Restructure the **lesson** modal (graded/practice `renderLesson` in
`src/renderer/modal.ts`) into two columns:
- **Left:** lesson text — heading, paragraphs, the "In short" summary, and the
  "In the Codex" chips.
- **Right:** a squarish "Your Turn" panel with the question and the answer
  options listed, and the **Step away** button tucked in the right corner.
- Make the lesson card wider to fit two columns; **stack to one column on
  narrow windows** (media query / flex-wrap). Redemption + gauntlet screens
  have no lesson text — leave them single-column/centered.
- Keep answer badges, feedback, keyboard (1–4/A–D, Enter, Esc), and focus
  behaviour working. (Task #20)

### 2. Codex flashcards mode
Add a **Flashcards** button in the Codex (`app.ts` codex wiring) that opens a
flip-card drill over the glossary: term on the front, flip to reveal the
definition, next/prev, shuffle. Self-contained overlay following the existing
`#x-root` + open/close + Esc/backdrop pattern. (Task #21)

### 3. Extend the temple scene full-bleed
The sky/sun/hills backdrop is currently drawn inside the temple SVG, so it's
letterboxed in a box. Make it **fill the whole temple stage** — from just below
the stats bar down to the bottom, out to the panel's inner border, **behind the
footer buttons** — and give it an outline/frame. Suggested approach: wrap
`#temple-svg-host` + `#temple-footer` in a `#temple-stage` div; render the scene
(`buildScene()` / a positioned background SVG, `preserveAspectRatio` slice) as
its background layer; remove `buildBackdrop()` from the temple SVG so the temple
stands transparent over the stage scene. Theme-aware (day/night). (Task #22)

### 4. "Fancify" — open-ended polish the user invited
Anything that raises production value: richer animated illumination, per-pillar
theming, hover/press micro-interactions, etc. Keep it reduced-motion-aware and
CSP-clean.

## Backlog (see docs/PROJECT_STATE.md for the full list)
- Progress-based badges / achievements; guided first-play tour.
- Expand question banks further (Test E/F) or more sections per module.
- A Playwright *test* (not just the audit) asserting a full graded pass +
  gauntlet, wired into `verify`.

## Current state (what already shipped)
See `docs/PROJECT_STATE.md`. Highlights this session: Parchment Day theme,
Settings panel, A/B/C/D lettering, Welcome rite, Chronicle (mastery ring, day
streak, recall heatmap, export/import), Keys help, synthesized sound, temple
backdrop scene, per-section "In short" summaries + pass recap, Codex term
chips, next-step guide button, and a Chronicle width/frame fix.
