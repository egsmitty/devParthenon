# Dev Parthenon — open ToDo (handoff to next session)

Read `CLAUDE.md` first (guardrails, gate, gotchas), then this. Everything is
committed and pushed to `main`; the tree is clean and even with origin. Gate =
`npm run verify` (build + **48 tests** + two-pass smoke); for visual work also
`npm run audit:ux` and eyeball `audit/shots/` (21 shots). Commit in small
slices, gate green each time. **Gotcha reminders:** no inline `style=`
attributes (CSP — use `element.style` via CSSOM; a test enforces this); capture
transient UI with a throwaway Playwright script that does NOT emulate reduced
motion (and set `NODE_PATH` to the project `node_modules`); the window enforces
`minWidth: 980`. **The welcome rite now plays every launch** — any Playwright
script (and the audit) must click `.welcome-enter` before touching the temple.

## Big initiative: Progression & Trophies — COMPLETE, plus all boss/visual polish

**Shipped end to end and pushed.** See **[`docs/PROGRESSION_PLAN.md`](PROGRESSION_PLAN.md)**.
Delivered: the tested v4 spine; content expansion (foundation + 6 pillars +
**capstone now 10** — 93 sections, 372 questions); the **Mastery Test**; the
**Overview page**; **the gate is ON** (unlock requires completed AND mastered)
with soft-lock-free **node re-entry** (a passed-but-unmastered stone launches its
Mastery Test, "prove it" cue); the **Trophy Case** (nine gods; click a god for
bio + fun fact; sealed niches name their trial; **Zeus is a hidden "???"
secret**); the **Herculean boss fight** — a monument arch **entrance** on the
temple (widened viewBox 1260, cx 1150) → full-page **antechamber**
(`herculeanGate.ts`) → a **full-screen Street-Fighter arena** (`#modal-root.arena-mode`,
HP bars + VS + 45-min clock) → Zeus trophy or a weak-area **side-quest**; and a
**reveal portal** (red/black black-hole → the arch materializes) the first time
the temple becomes whole. Combatant portraits: **Augustus** vs a **wrathful
Hercules**. Plus: lit entablature crown, wider lesson cards, the every-launch
welcome, and the **codex opening rite** (cover lifts open → inside leather →
leaves flip → entries appear). `record-mastery-result` / `record-herculean-result`
IPC run the sweep / stash weak areas.

**Only optional item left from the whole plan: character customization** (name +
trophy-unlocked cosmetics) — pure gamification, not required for the loop.

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
