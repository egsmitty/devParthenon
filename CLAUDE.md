# Dev Parthenon — working guide for Claude

Offline **Electron + TypeScript** desktop app that teaches web dev from
foundations to interview-readiness, visualized as a Greek temple you build
stone by stone. Zero runtime dependencies. Windows-first.

This file is auto-loaded every session. Read it before making changes.
**Picking up open work? Read [`docs/TODO.md`](docs/TODO.md) first** — it holds
the in-progress tasks and the next steps.
Deeper docs: [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) (current feature
inventory + backlog), [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md)
(original build spec + design brief), [`docs/RUNNING.md`](docs/RUNNING.md)
(how to launch/see changes).

## Orientation (where things live)

- `src/main/` — Electron main process. `main.ts` (window, IPC handlers, dev
  loop, smoke hooks, window-state), `store.ts` (progress + attempt persistence
  + progression rules — **Electron-free, unit-tested**), `review.ts` (spaced-
  repetition scheduler — also Electron-free/tested), `preload.ts` (contextBridge).
- `src/renderer/` — `app.ts` (temple SVG, codex, wiring), `modal.ts` (quiz/
  redemption/practice/gauntlet/review flows + keyboard + answer badges),
  `variants.ts` (variant-pool selection — pure/tested), `settings.ts`
  (settings state + panel), `welcome.ts`, `chronicle.ts`, `help.ts`,
  `sound.ts` (Web-Audio cues), `styles.css`, `fonts.css` + `fonts/` (bundled
  Cinzel), `index.html`. Overlays follow one pattern: an `#x-root` div, an
  open/close pair, backdrop+Esc close, focus management.
- `src/types/schema.ts` — the shared contracts. Start here to understand data.
- `data/` — `progress.json` (v2 template), `glossary.json`, `quizzes/*.json`
  (8 modules, 41 sections, 4 variants each = 164 questions).
- `tests/store.test.js` — 31 node:test unit tests. `scripts/` — build/dev/
  icon/audit/verify tooling.

## Invariants — do NOT break these

1. **Renderer stays sandboxed.** `contextIsolation:true`, `sandbox:true`,
   `nodeIntegration:false`. All privileged work goes through existing IPC with
   validated args. No fs/node in the renderer.
2. **`store.ts` and `review.ts` stay Electron-free** and the single source of
   truth for unlock/schedule state. They must remain unit-testable with plain
   Node.
3. **All persisted writes are atomic** (temp file + rename): `progress.json`,
   `attempt.json`, `window-state.json`. Never naive-write the live file.
4. **CSP is self-only.** `default-src 'self'; font-src 'self'; img-src 'self'
   data:`. No CDNs, remote fonts/images, or network calls — bundle/inline/
   data-URI everything. New assets go in `src/renderer/` and copy via
   `scripts/copy-assets.js`.
5. **Animate only `transform`/`opacity`/`filter`** (60fps on integrated GPUs).
   Never animate layout properties. Every ambient/keyframe animation is gated
   by `@media (prefers-reduced-motion: reduce)` with a usable static end-state.
6. **`progress.json` migrations are additive + versioned.** Bump `version`,
   default new fields, never break an existing save. Currently v2.
7. **Anti-overwhelm law:** ≤3 teaching paragraphs before an interactive check.
8. **Quiz data rule:** every variant has exactly 4 options, 4 aligned
   `optionExplanations`, and `correctAnswerIndex` points at the option whose
   explanation starts "Correct —". The integrity test enforces this.

## The gate — run before every commit

```
npm run verify      # build + 31 unit tests + two-pass headless smoke
```
Exit 0 = safe to commit. For any **visual** change also run `npm run audit:ux`
and look at `audit/shots/` (17 states across the app). Commit in small,
themed slices; keep the gate green at each one. End commit messages with a
`Co-Authored-By:` trailer for the assisting model (follow your harness's
instruction for the exact name).

## Gotchas (hard-won — save yourself the round-trip)

- **Rebuild before you screenshot.** Screenshots/smoke run against `dist/`.
  Always `npm run build` (or `npm run audit:ux`, which builds) after editing,
  or you'll verify stale output.
- **Test the real artifact, not an equivalent command.** e.g. the `launch.cmd`
  path bug passed when the raw electron command was tested in isolation but
  failed in the actual `.cmd`. Run the thing the user runs.
- **The app does not auto-update.** A running/installed app is a compiled
  snapshot. `npm run dev` hot-reloads the renderer; the Desktop shortcut →
  `launch.cmd` rebuilds then launches. See `docs/RUNNING.md`.
- **Shell:** this is Windows. Use the **Bash tool** for heredocs/multi-line
  commit messages (PowerShell has no heredoc and mangles quotes). LF→CRLF
  git warnings are harmless.
- **CSS support:** `writing-mode: sideways-lr` silently falls back to
  horizontal in this Chromium — use `transform: rotate()` for rotated text.
- **Packaging:** `npm run dist:win` may fail extracting `winCodeSign` (symlink
  privilege) — pre-extract it into the electron-builder cache; see the README.
  Packaging is intentionally NOT chained into `build` (it's minutes long).
- **Verifying transient animations:** a throwaway Playwright script that opens
  the UI *without* reduced motion and screenshots mid-animation works well
  (the audit emulates reduced-motion, so it can't capture motion).

## Working style here

The user iterates on feel and visuals; expect frequent small UI tweaks. When
they describe a visual change, verify it with a screenshot before claiming
it's done, and be ready to revert cleanly if they preferred the prior version.
Don't over-engineer or expand scope beyond what's asked.
