# Dev Parthenon — current state & backlog

Authoritative snapshot of what's built and what's next. (The historical build
spec is `MASTER_PROMPT.md`; this file supersedes its status sections.)

## Status: feature-complete + Progression & Trophies shipped

All originally-planned phases plus the full **Progression & Trophies**
initiative (Mastery Tests → the gate → Trophy Case → the Herculean final) are
shipped and verified: **48/48 unit tests**, two-pass smoke clean, all **21
audit screenshots** regenerate, `npm run lint:data` clean (**93 sections, 372
questions**). Save schema is **v4**.

## Feature inventory

**Learning core**
- Foundation → 6 pillars → pediment capstone, sequential prerequisites; a node
  completes at **≥ 85%**.
- **Redemption Round**: land within 15 points of passing → re-quiz only missed
  sections (with fresh variants), earn back up to +15% capped.
- **Variant banks**: every concept has a 4-question pool (Test A/B/C/D), **372
  questions across 93 sections** (foundation + 6 pillars + capstone all ~10
  sections, plus the Herculean cross-topic bank). Graded pins Test A;
  redemption/practice draw fresh variants. Correct-answer positions are evenly
  distributed and length-balanced (anti-rote, no length tell).
- **Wrong answers** always explain why (per option) + an interview tip.

**Progression & Trophies** (the end-game loop)
- **Mastery Test**: a graded pass offers a 10-question, 80%-to-pass exam drawn
  at random from the module's bank; passing awards that module's **trophy**
  (a Greek god) and marks it mastered. Unlimited retries, fresh draw each time.
- **The mastery GATE**: a node unlocks only when every prerequisite is both
  *completed* (85% stone) **and mastered** (Mastery Test passed). `store.ts`
  `prerequisitesMet` + `unlockNewlyAvailable`; a mastery pass runs the unlock
  sweep via `recordMasteryOutcome`.
- **Node re-entry**: a passed-but-unmastered stone is clickable to launch its
  Mastery Test (a pulsing crown/halo cue marks it) — so the gate never
  soft-locks. The header guide surfaces a due Mastery Test as the next step.
- **Overview page** (`overview.ts`): a "what you now know" recap offered on the
  graded-pass screen — section headings + "In short" summaries + Codex terms.
- **Trophy Case** (`trophyCase.ts`): a nine-niche hall — earned = lit statue +
  god/epithet, sealed = silhouette. Footer entry; roster + all statue SVGs in
  `statues.ts`.
- **The Herculean final** (Phase C): a thunderbolt marker beside the pediment,
  shown once every stone stands (parallel to the roof, never gating it). A
  25-question **timed** trial (half fresh cross-topic from `herculean.json`,
  half canonical questions from every bank), ≥85% to pass. Pass → the ultimate
  **Zeus** trophy; fail → the missed concepts become a **weak-area side-quest**
  (a Review drill over exactly those keys) before the retry.

**Replay & retention**
- **Practice mode**: click a completed (marble) node to re-run it with random
  variants — no score/unlock change; feeds the scheduler.
- **Review deck**: "Review weak spots" pulls an SM-2-lite ordered queue of
  weak/overdue concepts across modules and drills fresh variants.
- **Spaced repetition**: `review.ts`; per-concept stats in `progress.json` v2.

**The pediment gauntlet**
- Graded pediment attempt = a timed, shuffled cross-pillar mock interview
  (5 sampled capstone + 2 sampled per pillar = 17 questions, 40s each, no
  lessons). `buildGauntlet` caps capstone sampling at 5 (`GAUNTLET_CAPSTONE_SAMPLE`)
  so it stays 17 as the capstone bank grows.

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
- A per-section **"Learn more"** button (top-left of the lesson) opens a web
  search for that topic in the default browser — going deeper than the lesson.
  Routed through a validated `open-external` IPC (http(s) only) via
  `shell.openExternal`; the app itself stays offline/self-contained.
- A header **"Continue/Begin: <module>"** guide points to the next stone.
- Per-pillar topic **gems**; hover **cartouche tooltips**; softer, rounder UI.

## Architecture at a glance

- **IPC channels** (all validated in `main.ts`): `get-progress`,
  `save-quiz-score`, `reset-progress`, `get-quiz`, `get-glossary`,
  `save-attempt`/`get-attempt`/`clear-attempt`, `record-section-result`,
  `get-review-deck`, `record-mastery-result`, `record-herculean-result`,
  `open-external`; `window-control` (send) + `window-maximize-changed`.
- **Persistence** in `%APPDATA%/DevParthenon/`: `progress.json` (**v4**, atomic,
  self-healing; carries `trophies`/`mastery`/`herculean` + additive migration),
  `attempt.json`, `settings.json`, `window-state.json`.
- **Env overrides** (tests/audits): `PARTHENON_USERDATA` (throwaway save dir),
  `PARTHENON_SMOKE=1` (two-pass headless check, +`PARTHENON_SHOT=<png>` to
  capture), `--dev` (DevTools + watch reload).
- **Commands**: `npm run dev` (hot reload), `npm run verify` (gate),
  `npm run audit:ux` (screenshots), `npm run launch` / `launch.cmd` (build +
  open), `npm run dist:win` (installer).

## Backlog / ideas for future sessions

Not committed to — a menu. Roughly ordered by value. The big **Progression &
Trophies** initiative is fully shipped (see above); only optional Phase D
gamification polish remains from it.

**Progression polish (Phase D, optional)**
- **Hercules HP-bar boss skin** over the Herculean exam: two health bars,
  correct answers damage Hercules, wrong ones damage you — pure presentation
  over the same scoring.
- **Character customization**: name + laurel/armor cosmetics unlocked by
  trophies, threaded through the welcome + a small header avatar.
- Herculean retry gating is currently a strong nudge (fail screen leads with
  the side-quest) — the store also supports a `cooldownUntil` if a harder gate
  is ever wanted.

**Content**
- More variants per concept (E/F) for a deeper Mastery/Herculean draw.
- Expand the glossary; link more jargon in lesson text to Codex entries.
- A 7th pillar (TypeScript? System Design? Auth/Security?) if scope grows.

**Features**
- A "share my temple" snapshot image (progress export/import already ships).
- Daily goal / XP layered on the existing day-streak.
- Per-pillar accent theming (tint each whole column, not just the hover glow).

**Engineering / quality**
- Add a Playwright *test* (not just the audit) that asserts a full graded pass,
  a Mastery pass unlocking the next stone, and a gauntlet run — wired into
  `verify` so it blocks the gate (the audit exercises these but doesn't gate).
- ~~Content-authoring lint as a standalone `npm run lint:data`.~~ **Done** (also
  sweeps quiz files not referenced by a progress node).
- Code-sign the Windows build to avoid SmartScreen warnings.
- Auto-update channel (electron-updater) if this ever ships beyond local use.

## How to pick up work here

1. Read `CLAUDE.md` (guardrails + gotchas) and this file.
2. Make the change in a small slice.
3. `npm run verify`; for visual changes, `npm run audit:ux` and eyeball
   `audit/shots/`.
4. Commit with the gate green; push.
