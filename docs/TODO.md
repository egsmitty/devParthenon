# Dev Parthenon — open ToDo (handoff to next session)

Read `CLAUDE.md` first (guardrails, gate, gotchas), then this. Everything is
committed and pushed to `main`; the tree is clean. Gate = `npm run verify`
(build + 38 tests + two-pass smoke); for visual work also `npm run audit:ux`
and eyeball `audit/shots/`. Commit in small slices, gate green each time.
**Gotcha reminder:** no inline `style=` attributes (CSP — use `element.style`
via CSSOM; a test enforces this). Capture transient UI with a throwaway
Playwright script that does NOT emulate reduced motion. The window enforces
`minWidth: 980` (main.ts) — modal breakpoints below that are dead code.

## Recently shipped (this session)

All four items that were "in progress / next up" are done and verified:
1. **Two-column lesson layout** — graded/practice `renderLesson` is now lesson
   text (left) beside a squarish "Your turn" panel (right); stacks to one
   centered column ≤1080px. Redemption + gauntlet stay single-column.
2. **Codex Flashcards** — a flip-card drill over the glossary (term ⇄
   definition, Prev/Next/Shuffle, Space/arrows/Esc). New `flashcards.ts`,
   launched from a button in the Codex headband.
3. **Full-bleed temple scene** — the sky/sun/hills now fill a framed
   `#temple-stage` behind the temple and footer (see `buildScene()` +
   `#temple-scene`), instead of being letterboxed inside the temple SVG.
4. **Fancify** — torch light-pools, a breathing sun/moon halo, and per-pillar
   topic-tint hover glow (`--pillar-tint`).

## Next up (menu — pick by value; nothing committed to)

- **A Playwright *test* (not just the audit)** asserting a full graded pass +
  a gauntlet run, wired into `verify`. The audit already exercises these with
  assertions; the gap is having it block the gate.
- **Data-authoring lint** as a standalone `npm run lint:data` (the integrity
  checks currently live only inside the test suite).
- **Progress-based badges / achievements**; a guided first-play tour beyond
  the welcome rite.
- **Flashcards, deeper:** filter the deck by Codex tag, or a "known / review
  again" self-grade that reorders the queue.
- **Expand question banks** (Test E/F) or add sections so 85% is a smoother
  threshold on the 5-question pillars.
- **Codex art:** more statues / animated illumination in the spine.

## Backlog (full list in docs/PROJECT_STATE.md)
- Progress export/import already ships; a "share my temple" snapshot image is
  still open.
- Streaks / daily goal / XP.
- Per-pillar theming beyond the hover tint (tint each whole column).
- Code-sign the Windows build; auto-update channel if it ships beyond local.
