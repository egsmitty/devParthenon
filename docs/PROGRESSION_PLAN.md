# Dev Parthenon — Progression & Trophies plan

A staged plan for the new end-of-path systems: **section-recap Overview →
Mastery Test (trophy) → Trophy Case**, and the parallel **Herculean Test** with
weak-area side-quests. Written so work can split cleanly across **Opus** (core
logic/architecture/review), **Sonnet 5** (UI build), and **Fable** (content &
art). The tested data/logic **spine already exists** (schema v4 + `store.ts`);
this doc is the map for the rest.

> Status: spine shipped (v4 schema, `recordMasteryResult`, `herculeanUnlocked`,
> `recordHerculeanResult`, migration, 6 unit tests). UI + content are next.

---

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

- **Mastery Test does NOT change unlock progression.** Pillars still unlock on the
  existing 85% graded pass. The Mastery Test is the *trophy* layer — an
  achievement, not a gate. (Rationale: keeps the proven progression intact,
  matches "trophies to show off," lets learners chase mastery without softening
  or hardening the path. Alternative — mastery gates the stone — is possible but
  riskier; flagged in Open Decisions.)
- **Reuse existing question banks for Mastery v1.** Each module already has ~20–24
  variants (Test A/B/C/D across its sections). Draw 10 at random from that pooled
  set → an instant 20–30-question bank with **zero new content** to ship v1.
  Fable can *expand* banks (Test E/F) afterward for more variety.
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

## Open decisions (need your call)

1. **Does the Mastery Test gate the stone, or is it trophy-only?** Recommended:
   trophy-only (progression unchanged). Say the word to make it a gate instead.
2. **Herculean retry gating:** side-quest only, timed cooldown, or both? The spine
   supports both (`weakAreas` + optional `cooldownUntil`).
3. **Boss fight (Phase D):** ship the plain exam first and add the Hercules HP-bar
   skin as a follow-up? (Recommended — decouples a big polish item from the core.)
4. **Character customization:** in or out of scope for now? (My take: fun but it's
   a separate feature; I'd defer until Phases A–C land.)

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
