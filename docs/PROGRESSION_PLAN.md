# Dev Parthenon — Progression & Trophies plan

A staged plan for the new end-of-path systems: **section-recap Overview →
Mastery Test (trophy) → Trophy Case**, and the parallel **Herculean Test** with
weak-area side-quests. Written so work can split cleanly across **Opus** (core
logic/architecture/review), **Sonnet 5** (UI build), and **Fable** (content &
art). The tested data/logic **spine already exists** (schema v4 + `store.ts`);
this doc is the map for the rest.

> Status: **COMPLETE — Phases A, B, and C all shipped.** 🏛️
> - v4 store spine (trophies/mastery/herculean, migration, tests). ✅
> - **Content expanded**: foundation + all 6 pillars to ~10 sections; **capstone
>   now 10** (5→10, mock-interview depth). 93 sections, 372 questions. ✅
> - **Mastery Test (Phase A)**: graded pass → 10-question, 80%-to-pass trophy
>   exam; awards/persists the trophy; unlimited retries. ✅
> - **Overview page**: "what you now know" recap on the graded-pass screen
>   (headings + summaries + Codex terms). ✅
> - **The gate is ON**: unlocking a node now requires the prerequisite to be
>   *completed AND mastered*. Node re-entry (a passed-but-unmastered stone
>   launches its Mastery Test, with a "prove it" cue) keeps it soft-lock-free. ✅
> - **Trophy Case (Phase B)**: `#trophy-case-root` hall of the nine gods —
>   earned = lit statue, sealed = silhouette. Footer entry. ✅
> - **Herculean Test (Phase C)**: a thunderbolt marker beside the pediment; a
>   25-question timed trial (seen + new bank), ≥85%; pass → Zeus trophy, fail →
>   weak-area side-quest (Review drill over the missed keys). ✅
> - **Gauntlet**: `buildGauntlet` caps capstone sampling to 5, so it stays 17 Qs
>   as the capstone grows. ✅
> - **Boss fight (Phase D)**: the Herculean is now a VS duel — a torch-lit
>   temple *gateway* → a full-page antechamber (`herculeanGate.ts`) → an arena
>   with two HP bars (correct answers strike Hercules, wrong ones strike you;
>   HP is a skin over the same ≥85% scoring), win/lose screens, 45-min timer. ✅
> - **Lit crown**: the entablature/frieze lights to marble once the pediment is
>   set. **Trophy Case bios**: click a god for its story + a fun fact. ✅
>
> Only remaining optional polish: **character customization** (name + cosmetics
> unlocked by trophies). The core loop and the boss fight are complete.

---

## ⇢ Start here (handoff for Fable + Sonnet)

Read `CLAUDE.md` first (invariants + the gate). **Every commit must pass
`npm run verify`; every data change must also pass `npm run lint:data`.** All art
is inline SVG only (CSP is self-only); set styles via `element.style` (CSSOM),
never inline `style=`; gate any animation behind `prefers-reduced-motion`.

Do these in order:

1. ✅ **Fable — 6 trophy statues.** DONE — `STATUE_HERMES/APOLLO/HEPHAESTUS/
   APHRODITE/CHRONOS/ZEUS` live next to `STATUE_ATHENA` in `src/renderer/app.ts`
   (same marble idiom; epithets are in each statue's doc comment).
2. ✅ **Fable — Herculean bank.** DONE — `data/quizzes/herculean.json` (12
   cross-topic sections × 4 variants = 48 synthesis questions, full integrity
   contract incl. option-length balance). `lint:data` now sweeps quiz files not
   referenced by a progress node, so the bank is gated before its node exists.
3. **Sonnet — Trophy Case.** New `#trophy-case-root` overlay following the shared
   `#x-root` open/close + Esc/backdrop pattern (copy `flashcards.ts`). Read
   `progress.trophies`; map `nodeId → {god, epithet, art}` (+ `"herculean" → Zeus`).
   Reuse `.statue-niche` CSS; earned = lit statue, locked = silhouette. Add an
   entry button (footer or titlebar).
4. **Sonnet — Overview page.** A recap overlay shown from the graded-pass screen
   (before the Mastery CTA): each section's `heading` + `summary` + its Codex
   terms/definitions (all already in the quiz data + glossary).
5. **Sonnet — node re-entry + "mastery-pending" state.** A module whose lessons
   passed (marble) but whose Mastery Test isn't passed (`!progress.mastery[id]?.passed`)
   should be clickable to launch its Mastery Test — call `launchModule(node,
   "mastery")` (already wired). Add a visual cue on the stone. This UNBLOCKS the gate.
6. **Opus — enable the gate + tests.** Only after 3+5 exist: make `prerequisitesMet`
   also require `data.mastery[prereqId]?.passed`, and have the
   `record-mastery-result` IPC run the unlock sweep + return `newlyUnlocked`
   (mirror `saveQuizScore`). Add unit tests. This is the "must pass to advance" rule.
7. **Then**: Herculean node + exam + side-quest (Phase C), and capstone expansion
   (first cap `buildGauntlet`'s capstone sampling so the gauntlet stays ~17 Qs).

Contract already shipped for you to build on: `progress.trophies[]`,
`progress.mastery{}`, `progress.herculean{}`; store fns `recordMasteryResult`,
`herculeanUnlocked`, `recordHerculeanResult`, `herculeanOnCooldown`; renderer
`configureMastery`, `buildMasteryQuiz`, the `"mastery"` `ModuleMode`, and the
`record-mastery-result` IPC.

## The player journey (target)

1. **Learn a module** — the existing lesson path (per-section teaching + checks),
   unchanged. A ≥85% graded pass still sets the stone and unlocks the next
   pillar (progression is untouched).
2. **Overview page** — on finishing a module's lesson path, a recap screen: every
   major topic with its one-line definition and a short overview, pulled from the
   section summaries + linked Codex terms. A calm "here's what you now know" beat.
3. **Mastery Test** — 10 questions drawn at random from that module's bank
   (~20–30 pool), **≥80% to pass, infinite retries**. Passing awards the module's
   **trophy** (a Greek/Roman figure) and marks it *mastered*.
4. **Trophy Case** — a display of every trophy earned; locked ones show as
   silhouettes to chase.
5. **The Herculean Test** — once the foundation + all six pillars stand, a
   **parallel** node appears beside the pediment (never blocking the roof). 25
   questions: ~half previously-seen, ~half new/general. **≥85% to pass.** A fail
   stashes your missed topics as **weak areas** and sends you to a **side-quest**
   (a focused review drill) before you retry. Passing awards the **ultimate
   trophy**.

Optional, later (see §Stretch): a boss-fight framing for the Herculean, and a
customizable character.

---

## Design decisions (recommended)

- **The Mastery Test GATES progression** (decided). A module is only truly
  *mastered* — and the next pillar only unlocks — once you pass its Mastery Test
  (≥80%). The 85% graded pass still sets the stone visually and opens the
  Mastery Test, but you can't "ease your way through" the temple without proving
  mastery on each topic. **Sequencing matters:** the gate can only switch on
  *after* the Mastery Test UI ships (else a learner is stuck with no test to
  take). Build order: expand banks → build the Mastery Test + Overview →
  **then** flip the unlock rule to require `mastery[nodeId].passed`.
- **Question banks feed the Mastery Test's random draw.** The Mastery Test pulls
  10 at random from a module's pooled variants, so a bigger pool = more variety
  and replayability. See the Content Expansion section — we're growing both the
  number of sections and the variants per section.
- **Overview is auto-generated v1.** Build it from data we already have: section
  `heading` + `summary` ("In short") + the related Codex terms and their
  glossary definitions. Fable can later author richer per-module overview prose.
- **Side-quest reuses the Review drill.** A failed Herculean's `weakAreas` (missed
  `nodeId/sectionIndex` keys) map straight onto the existing spaced-repetition
  review drill — drill those concepts, then the retry unlocks. Minimal new code.
- **Herculean is parallel, not sequential.** It unlocks with the pediment (all
  pillars built) and sits beside it; beating the pediment gauntlet and beating
  the Herculean are independent. `herculeanUnlocked()` already encodes this.

---

## Content expansion (teaching depth + bank size)

Feedback: lessons feel rushed; teaching should roughly double, and banks want
more variety. Targets:

- **~10–12 sections per module** (from 5–6). More sections = more topic chunks =
  genuinely deeper coverage, while respecting the ≤3-paragraph anti-overwhelm
  law. New sections cover important sub-topics each module currently skips
  (e.g. Foundation: HTTPS/TLS, caching, cookies vs sessions, REST basics, the
  browser render pipeline, CORS).
- **Fuller teaching within each section.** Existing sections' `paragraphs` get
  enriched to be substantive (still ≤3), so each chunk actually teaches.
- **+10–15 variants per bank** for replayability and a deeper Mastery-Test draw.
  New sections bring 4 variants each; add Test E/F to thinner sections as needed.

**Hard rule when enriching existing sections:** you may improve `paragraphs` and
`summary`, but do NOT touch existing `options`, `correctAnswerIndex`,
`optionExplanations`, `id`, or `question` — that preserves the answer-length
balancing and the integrity contract we already fixed. New variants must follow
the full contract (4 balanced-length options, aligned "Correct —" explanation,
unique ids, variants 0/1 differ on correct index) and pass `npm run lint:data`.

**Approach: pilot then fan out.** Expand ONE module (Foundation) first as the
quality template, review it, lock the bar, then run one agent per remaining
module against that template. This keeps technical accuracy high and avoids
mass-generating content that needs rework.

## The trophy roster (gods)

One per module + the ultimate. Reuse the three Codex statues we already have;
Fable authors the six new ones (same `viewBox="0 0 140 262"` marble style as the
existing `STATUE_*` SVGs in `app.ts`).

| Module | Trophy | Why | Art |
|---|---|---|---|
| Foundation (HTTP/DNS) | **Hermes** | messenger — requests/responses, protocols | new |
| React (UI) | **Apollo** | light, art, harmony — the interface | new |
| Next.js (framework) | **Hephaestus** | the master builder/forge | new |
| Node (backend) | **Poseidon** | the deep engine under the surface | reuse ✓ |
| Databases | **Mnemosyne** | memory & persistence | reuse ✓ |
| Tailwind/CSS | **Aphrodite** | beauty & form | new |
| Git · CI | **Chronos** | time, history, versioning | new |
| Capstone (interviews) | **Athena** | wisdom under pressure | reuse ✓ |
| **Herculean (ultimate)** | **Zeus** | the apex; king of the pantheon | new |

Trophy ids in `progress.trophies` are the module `nodeId` (e.g. `"pillar-react"`)
plus `"herculean"`. A renderer-side map (`TROPHY[nodeId] = {god, epithet, art}`)
supplies presentation — the store stays generic.

---

## Data model (shipped)

`ProgressData` (v4) now carries:

```ts
trophies?: string[];                         // earned ids: nodeIds + "herculean"
mastery?: Record<string, MasteryRecord>;     // { passed, bestScore, attempts, lastAttemptISO }
herculean?: HerculeanState;                  // { passed, bestScore, attempts, weakAreas[], cooldownUntil? }
```

Store API (Electron-free, tested):
`recordMasteryResult(data, nodeId, score, nowISO)` · `herculeanUnlocked(data)` ·
`recordHerculeanResult(data, score, missedKeys, nowISO, cooldownMs?)` ·
`herculeanOnCooldown(h, nowMs)`. Constants: `MASTERY_PASS_THRESHOLD=0.8`,
`HERCULEAN_PASS_THRESHOLD=0.85`, `HERCULEAN_TROPHY`.

Still to add when the UI lands: IPC channels (`record-mastery-result`,
`record-herculean-result`, `get-progress` already returns the new fields) + the
matching `ParthenonApi` methods + preload wiring. Keep the same validated-args
pattern as existing handlers; `store.ts`/`review.ts` stay Electron-free.

---

## Build roadmap (phased)

**Phase A — Mastery core (highest value, low risk).**
- Renderer: a Mastery-Test mode in `modal.ts` (reuse `wireAnswer`/`optionsMarkup`;
  draw 10 random questions from the module's pooled variants; ≥80%; retry button;
  on pass call `recordMasteryResult` via new IPC).
- Overview page: a pre-test recap overlay (auto-generated from summaries/glossary).
- Trigger: offered after a module's graded pass, and re-runnable from a completed
  (marble) stone.
- IPC + preload + `ParthenonApi` for `record-mastery-result`.

**Phase B — Trophy Case.**
- New `#trophy-case-root` overlay (follow the shared open/close + Esc/backdrop
  pattern). Grid of niches; earned = lit statue + module name, locked =
  silhouette. Entry button in the footer or titlebar. Reuse `.statue-niche` CSS.

**Phase C — Herculean Test + side-quests.**
- Temple: render a parallel Herculean node beside the pediment when
  `herculeanUnlocked(progress)` (and not blocking it). Themed marker (a club /
  Nemean lion / Zeus bolt).
- Modal: 25-question exam (seen + new bank), ≥85%, timed like the gauntlet.
- Fail flow: stash `weakAreas`, route into a Review drill built from those keys,
  gate the retry on completing it (and/or `cooldownUntil`).
- Pass: award `"herculean"`, celebrate, unlock the Zeus trophy in the case.

**Phase D — Stretch / gamification (optional).**
- Boss-fight skin for the Herculean: two HP bars, correct answers damage Hercules,
  wrong answers damage you; lose = fail. Pure presentation over the same scoring.
- Customizable character (name, laurel/armor cosmetics unlocked by trophies)
  threaded through the welcome + a small avatar in the header.

---

## Workload split

**Opus (core / architecture / review)** — *me.*
- ✅ v4 schema + store logic + migration + tests (done).
- Progression rules, IPC contract, edge-cases, and reviewing Sonnet's/Fable's PRs
  against the invariants (sandbox, atomic writes, CSP-self, reduced-motion,
  additive migrations, ≤3 lesson paragraphs, quiz-integrity).
- Phase C fail/side-quest gating logic (the fiddly bit).

**Sonnet 5 (UI build)** — implement against the shipped contract.
- Phase A Mastery-Test modal + Overview overlay; Phase B Trophy Case; Phase C
  temple node + exam modal + boss-fight skin. Follow existing patterns
  (`#x-root` overlays, `modal.ts` card helpers, CSSOM-not-inline-style, keep the
  gate green, `npm run audit:ux` for visuals).

**Fable (content & art)** — creative generation.
- The six new trophy statues (marble SVGs in the `STATUE_*` style).
- The Herculean "new/general" question bank (~40–60 broad cross-topic questions
  in the existing variant JSON shape — see instructions below).
- Optional: expanded Mastery banks (Test E/F) and richer per-module Overview
  prose; short flavor text for each trophy/god.

---

## Fable — content instructions

**Task 1 — Herculean question bank.** Create `data/quizzes/herculean.json` shaped
exactly like the other quiz modules (`{ id, title, passThreshold: 0.85, sections: [...] }`),
but these are broad, cross-cutting questions that span the *whole* curriculum
(web foundations, React, Next.js, Node, databases, CSS/Tailwind, Git/CI). Author
**~12 sections, 4 variants each (~48 questions)**. Each variant MUST follow the
integrity contract (the `lint:data` + test gate enforces it):
- exactly 4 `options`; `correctAnswerIndex` valid; 4 aligned `optionExplanations`
  where the correct one starts `"Correct — …"`; non-empty `rationale` and
  `interviewTip`; variants 0 and 1 must not share the correct index.
- **Balance option lengths** — the correct answer must NOT be the longest; keep all
  four within ~15–20% length (we just fixed this tell across the app, don't
  reintroduce it).
- Prefer *synthesis* questions (connect two areas, e.g. "SSR + caching + DB
  round-trips") over single-fact recall — this is the final boss.

**Task 2 — Trophy statues.** Add six `STATUE_*` SVG constants (Hermes, Apollo,
Hephaestus, Aphrodite, Chronos, Zeus) in the same marble idiom as the existing
`STATUE_ATHENA` / `STATUE_MUSE` / `STATUE_POSEIDON` in `src/renderer/app.ts`
(`viewBox="0 0 140 262"`, `url(#mb)` marble fill, gold accents `#e6c063`). Give
each a recognizable attribute (Hermes: winged cap + caduceus; Apollo: lyre + sun;
Hephaestus: hammer + anvil; Aphrodite: shell; Chronos: hourglass/scythe; Zeus:
thunderbolt + beard). Keep them self-contained (no external assets — CSP).

**Task 3 (optional) — flavor + bank expansion.** One-line epithet per trophy;
optional Test E/F variants for any module's Mastery pool.

**All content is data/SVG only — no logic.** Validate with `npm run lint:data`
(banks) before handing back.

---

## Decisions (settled)

1. **Mastery gates progression** — ✅ decided (must pass to unlock the next
   pillar; enable after the test UI ships).
2. **Content:** ~10–12 sections/module + fuller paragraphs + bigger banks — ✅
   decided (pilot Foundation, then fan out).
3. **Boss fight:** ship the plain Herculean exam first, add the Hercules HP-bar
   skin as a follow-up. ✅
4. **Character customization:** deferred until Phases A–C land. ✅

Still open (minor): Herculean retry gating — side-quest only, timed cooldown, or
both? The spine supports both; defaulting to **side-quest gate** unless told
otherwise.

---

## My honest take

Phases A–C are very achievable and high-value, and most of it **reuses systems we
already have** (variant banks → Mastery, summaries/glossary → Overview, review
drill → side-quests, Codex statues → Trophy Case). That keeps new content small
(mainly Fable's Herculean bank + six statues) and the risk low. The boss fight and
character customization are genuinely cool but are *polish/expansion* — I'd land
the core loop first, see how the trophies feel, then decide how far to take the
game layer. Start with **Phase A** — it's the satisfying core and unblocks the
rest.
