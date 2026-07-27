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
with **≥ 80%**. A searchable jargon glossary lives in the sidebar.

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

## Layout

```
data/            progress template, glossary, 8 lesson+quiz modules
src/main/        Electron lifecycle, IPC handlers, persistence store
src/main/preload.ts   contextBridge API (contextIsolation + sandbox on)
src/renderer/    SVG temple, quiz modal, glossary sidebar, custom title bar
src/types/       shared TypeScript contracts
tests/           store + data-integrity tests
```
