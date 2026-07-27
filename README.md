# Dev Parthenon

A gamified, offline Windows desktop app that takes a developer from web
foundations to interview-ready full-stack mastery — visualized as a Greek
Parthenon temple you build stone by stone.

- **The steps (stylobate)** — Web basics: client/server, HTTP, status codes, DNS, the DOM.
- **Six pillars** — React · Next.js · Node/APIs · Databases/ORMs · Tailwind/CSS · Git/Testing/CI-CD.
- **The pediment** — Capstone portfolio strategy and mock technical interviews. Stays an uncarved outline until all six pillars stand.

Each module feeds at most three short paragraphs before an interactive check.
Every wrong answer explains *why* it's wrong (aimed at real interview traps
like `key={index}`, StrictMode double-invocation, and SSR `window` access),
plus an interview tip. A pillar unlocks only after its prerequisite is passed
with **≥ 85%**. A searchable jargon glossary lives in the sidebar.

**Redemption Round (the fail-safe).** Finish a quiz within 15 points of the
85% line and you get a second chance: each question you missed is re-asked as
a **parallel "Test B" variant** — the same concept and interview trap, but a
different scenario and answer, so you can't pass by memorizing the first
answer. Correcting a variant earns its points back, capped at +15% total.
Land more than 15 points short and the module must be retaken; your best
score is always preserved. Every question also carries a distinct Test B, and
correct-answer positions are evenly distributed across all four options so
"the answer is always B" is never a strategy.

## Stack

Electron + TypeScript, zero runtime dependencies. Progress persists to
`%APPDATA%\DevParthenon\progress.json` (cloned from `data/progress.json` on
first run) with atomic temp-file-and-rename writes.

## Commands

```bash
npm install
npm run dev        # compile + launch Electron
npm test           # build + unit tests (node --test) for the progress store
npm run dist:win   # package a Windows installer + portable exe (release/)
```

`npm run generate-icon` regenerates `assets/icon.ico` (16/32/64/256 layers)
from a dependency-free programmatic renderer.

### Troubleshooting `dist:win`

Without Windows Developer Mode (or admin), electron-builder fails extracting
`winCodeSign-2.6.0.7z` — the archive contains macOS symlinks that Windows
refuses to create unprivileged. Fix: extract it manually into the cache
(symlink errors are safe to ignore) and re-run:

```powershell
$dir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0"
node_modules\7zip-bin\win\x64\7za.exe x winCodeSign-2.6.0.7z -o"$dir" -y
```

A headless launch check is built in:
`PARTHENON_SMOKE=1 npx electron .` (or the packaged exe) loads the app,
round-trips IPC, verifies the temple rendered, and exits non-zero on any
renderer console error.

## Layout

```
data/            progress template, glossary, 8 lesson+quiz modules
src/main/        Electron lifecycle, IPC handlers, persistence store
src/main/preload.ts   contextBridge API (contextIsolation + sandbox on)
src/renderer/    SVG temple, quiz modal, glossary sidebar, custom title bar
src/types/       shared TypeScript contracts
tests/           store + data-integrity tests
```
