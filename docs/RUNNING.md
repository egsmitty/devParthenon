# Running & updating Dev Parthenon

**Key fact:** a running/installed app is a *compiled snapshot*. Editing source
does **not** change an app that's already open, and never touches the installed
build. Something only reflects new changes if you launch it a way that rebuilds
or watches.

## The launch options

| Command / action | Shows latest source? | Auto-reloads while editing? | Use when |
|---|---|---|---|
| **Desktop shortcut** → `launch.cmd` | ✅ yes (rebuilds first) | no | Just want to use the app, always current |
| `npm run launch` | ✅ yes (rebuilds first) | no | Same as the shortcut, from a terminal |
| `npm run dev` | ✅ yes | ✅ **yes** — renderer hot-reloads | Actively editing the UI |
| `npm start` | uses whatever `dist/` holds now | no | You just built and want a plain launch |
| Old packaged exe in `release/win-unpacked` | ❌ frozen at package time | no | Only via `npm run dist:win` |

### The "least work" path
The **Desktop shortcut** points at `launch.cmd`, which runs `npm run build`
and then launches Electron detached. So one double-click is **always up to
date** — no manual build step. A brief build console appears, then the app
opens and the console closes.

### While developing with an assistant
Use `npm run dev`. It builds, opens the app with DevTools, and hot-reloads the
window whenever a renderer file changes — the "it just updates" experience.
(Main-process changes — anything in `src/main/` — still need you to close and
re-run it; Electron can't hot-swap its main process.)

## Why packaging is NOT part of every build
`npm run dist:win` runs electron-builder (NSIS installer + portable exe): it's
minutes long and downloads toolchains. Chaining it into `npm run build` would
cripple `npm test` and `npm run dev`, which both build. So:

- **Daily use / seeing changes:** `launch.cmd` (the shortcut) or `npm run dev`.
- **Making a distributable installer:** `npm run dist:win`, on purpose, when you
  actually want to ship a `.exe`. (First-run note: if it fails extracting
  `winCodeSign`, see the winCodeSign workaround in the main `README.md`.)

The Desktop shortcut targets `launch.cmd`, **not** the packaged exe, precisely
so it never goes stale.
