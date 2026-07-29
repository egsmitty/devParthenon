# Dev Parthenon — current state & backlog

Authoritative snapshot of what's built and what's next. (The historical build
spec is `MASTER_PROMPT.md`; this file supersedes its status sections.)

## Status: v1 feature-complete, in visual polish

All originally-planned phases shipped and verified (31/31 tests, two-pass
smoke clean, 17 audit screenshots regenerate). Recent work has been iterative
UI/UX refinement on the temple and the Codex.

## Feature inventory

**Learning core**
- Foundation → 6 pillars → pediment capstone, sequential prerequisites; a node
  completes at **≥ 85%**.
- **Redemption Round**: land within 15 points of passing → re-quiz only missed
  sections (with fresh variants), earn back up to +15% capped.
- **Variant banks**: every concept has a 4-question pool (Test A/B/C/D), 164
  questions total. Graded pins Test A; redemption/practice draw fresh variants.
  Correct-answer positions are evenly distributed (anti-rote).
- **Wrong answers** always explain why (per option) + an interview tip.

**Replay & retention**
- **Practice mode**: click a completed (marble) node to re-run it with random
  variants — no score/unlock change; feeds the scheduler.
- **Review deck**: "Review weak spots" pulls an SM-2-lite ordered queue of
  weak/overdue concepts across modules and drills fresh variants.
- **Spaced repetition**: `review.ts`; per-concept stats in `progress.json` v2.

**The pediment gauntlet**
- Graded pediment attempt = a timed, shuffled cross-pillar mock interview
  (5 capstone + 2 sampled per pillar = 17 questions, 40s each, no lessons).

**UX / a11y / resilience**
- Full keyboard path (1–4 answer, Enter advance, Esc close, focus trap, ARIA);
  temple stones are focusable buttons.
- One-shot celebration moments (stone-set on completion, grand pediment
  unlock); torches, marble sheen, hover lift, pointer parallax, page-flip on
  codex open. All `prefers-reduced-motion`-gated.
- Mid-module autosave → resume after reload/crash; honest live-reload dev loop;
  remembered window size/position/maximized.

**The Codex** (glossary)
- A right-edge leather **book-cover tab** (CODEX runs up the spine) opens a
  near-fullscreen **open illuminated book**: two aged-vellum pages (rubric
  headings, drop-caps, tag seals) flanking a gilded spine of Greek statue
  medallions. Opens/closes as a right-hinged fold; "Return" button.
- **Flashcards** button (headband) opens a large flip-card drill over the
  glossary: flip (click / Space) between term and definition (+ tag seals),
  in **either direction** (term-first or definition-first, toggled live);
  Prev/Next walk the deck, Shuffle re-orders, arrows browse, Esc closes.
  Transform-only 3D flip, reduced-motion-aware, focus-trapped. (`flashcards.ts`)

**Personalization & extra screens**
- **Settings panel**: Temple Night / **Parchment Day** (warm sunny) themes,
  answer labels (A B C D / 1 2 3 4 / none), text-size slider, reduce-motion +
  sound toggles — persisted to `settings.json` (atomic), applied live.
- **First-run welcome rite** (crest, title, three steps); replayable from
  Settings.
- **The Chronicle** dashboard: mastery ring, recall accuracy, **day streak**,
  per-module bars, a **recall heatmap** (concepts by module, coloured by how
  reliably recalled), and progress **export/import**.
- **Keys & Controls** help (`?` key or titlebar button).
- **Synthesized sound** cues (Web Audio, no assets): answer/pass/seal/whoosh.

**Learning experience & scene**
- A full-bleed **landscape stage** (`#temple-stage`): sky, sun (day) / moon +
  stars (night), rolling hills fill the whole framed panel behind the temple
  and footer — the temple stands transparent in the scene, not a letterboxed
  box. Sky+hills stretch to fill; the orb is a fixed-aspect layer so it stays
  round. Torch light-pools + a breathing halo add ambient life; hovering a
  pillar washes it in its topic colour. (`buildScene()` in `app.ts`)
- Graded/practice lessons use a **two-column layout** — lesson text (heading,
  paragraphs, "In short", Codex chips) beside a squarish "Your turn" panel
  (question + options + Step away); it stacks to one centered column ≤1080px.
  Redemption + gauntlet stay single-column (no lesson text).
- Every lesson section has a plain-language **"In short"** takeaway; a graded
  pass recaps them ("What you carry forward").
- **"In the Codex"** chips under lessons jump to glossary definitions.
- A header **"Continue/Begin: <module>"** guide points to the next stone.
- Per-pillar topic **gems**; hover **cartouche tooltips**; softer, rounder UI.

## Architecture at a glance

- **IPC channels** (all validated in `main.ts`): `get-progress`,
  `save-quiz-score`, `reset-progress`, `get-quiz`, `get-glossary`,
  `save-attempt`/`get-attempt`/`clear-attempt`, `record-section-result`,
  `get-review-deck`; `window-control` (send) + `window-maximize-changed`.
- **Persistence** in `%APPDATA%/DevParthenon/`: `progress.json` (v2, atomic,
  self-healing), `attempt.json`, `window-state.json`.
- **Env overrides** (tests/audits): `PARTHENON_USERDATA` (throwaway save dir),
  `PARTHENON_SMOKE=1` (two-pass headless check, +`PARTHENON_SHOT=<png>` to
  capture), `--dev` (DevTools + watch reload).
- **Commands**: `npm run dev` (hot reload), `npm run verify` (gate),
  `npm run audit:ux` (screenshots), `npm run launch` / `launch.cmd` (build +
  open), `npm run dist:win` (installer).

## Backlog / ideas for future sessions

Not committed to — a menu. Roughly ordered by value.

**Content**
- More variants per concept (E/F) and/or more sections per module so 85% is a
  smoother threshold, not "perfect-or-redeem-one" on 5-question pillars.
- Expand the glossary; link jargon in lesson text to Codex entries.
- A 7th pillar (TypeScript? System Design? Auth/Security?) if scope grows.

**Features**
- ~~Settings panel (theme, motion, font scale, sound), Chronicle dashboard,
  synthesized sound.~~ **Done.**
- Progress export/import (JSON) and a "share my temple" snapshot image.
- Streaks / daily goal / XP; a per-concept mastery heatmap in the Chronicle.
- Richer statue art / animated illumination in the Codex.
- Per-pillar accent theming; a first-run guided tour beyond the welcome.

**Polish**
- Richer statue art / more figures in the Codex spine; animated illumination.
- Per-pillar theming (each column tinted to its topic).
- A short intro/onboarding the first time the app opens.

**Engineering / quality**
- Add a Playwright *test* (not just the audit) that asserts a full graded pass
  and a gauntlet run, wired into `verify`.
- Content-authoring lint as a standalone `npm run lint:data`.
- Code-sign the Windows build to avoid SmartScreen warnings.
- Auto-update channel (electron-updater) if this ever ships beyond local use.

## How to pick up work here

1. Read `CLAUDE.md` (guardrails + gotchas) and this file.
2. Make the change in a small slice.
3. `npm run verify`; for visual changes, `npm run audit:ux` and eyeball
   `audit/shots/`.
4. Commit with the gate green; push.
