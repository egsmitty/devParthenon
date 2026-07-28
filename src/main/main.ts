import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import * as fs from "fs";
import * as path from "path";
import {
  clearAttempt,
  loadAttempt,
  loadProgress,
  loadSettings,
  migrateProgress,
  progressFilePath,
  recordSectionResult,
  resetProgress,
  saveAttempt,
  saveQuizScore,
  saveSettings,
  StorePaths,
  writeProgress,
} from "./store";
import { isDue, orderDeck } from "./review";
import type {
  ActiveAttempt,
  GlossaryEntry,
  QuizModule,
  ReviewDeckEntry,
  Settings,
} from "../types/schema";

const isDev = process.argv.includes("--dev");

// Spec: saves live in %APPDATA%/DevParthenon (no space), so pin the
// user-data path explicitly instead of relying on productName.
// PARTHENON_USERDATA overrides it for tests/audits so harnesses can run
// against a throwaway save without ever touching the learner's real one.
app.setPath(
  "userData",
  process.env.PARTHENON_USERDATA ??
    path.join(app.getPath("appData"), "DevParthenon")
);

// app.getAppPath() resolves to the project root in dev and to the packaged
// app root (inside the asar) in production, so data/ resolves in both.
const appRoot = app.getAppPath();
const dataDir = path.join(appRoot, "data");

const storePaths: StorePaths = {
  userDataDir: app.getPath("userData"),
  templatePath: path.join(dataDir, "progress.json"),
};

let mainWindow: BrowserWindow | null = null;

/* ---------------- Window-state persistence (§5.4) ---------------- */

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const windowStatePath = () =>
  path.join(app.getPath("userData"), "window-state.json");

function loadWindowState(): WindowState {
  const fallback: WindowState = { width: 1280, height: 840 };
  try {
    const s = JSON.parse(
      fs.readFileSync(windowStatePath(), "utf-8")
    ) as WindowState;
    if (typeof s.width !== "number" || typeof s.height !== "number") {
      return fallback;
    }
    // Discard a remembered position that no longer lands on any display
    // (unplugged monitor, changed resolution) — size is kept.
    if (typeof s.x === "number" && typeof s.y === "number") {
      const visible = screen.getAllDisplays().some((d) => {
        const a = d.workArea;
        return (
          s.x! + s.width > a.x + 40 &&
          s.x! < a.x + a.width - 40 &&
          s.y! > a.y - 20 &&
          s.y! < a.y + a.height - 40
        );
      });
      if (!visible) {
        delete s.x;
        delete s.y;
      }
    }
    return s;
  } catch {
    return fallback;
  }
}

let windowStateTimer: NodeJS.Timeout | null = null;

function saveWindowState(win: BrowserWindow, immediate = false): void {
  const write = () => {
    try {
      const isMaximized = win.isMaximized();
      // Remember the normal (restored) bounds so un-maximizing feels right.
      const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
      const state: WindowState = { ...bounds, isMaximized };
      const file = windowStatePath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(state), "utf-8");
      fs.renameSync(tmp, file);
    } catch {
      /* window-state persistence is best-effort */
    }
  };
  if (immediate) {
    if (windowStateTimer) clearTimeout(windowStateTimer);
    write();
    return;
  }
  if (windowStateTimer) clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(write, 400);
}

function createWindow(): void {
  const winState = loadWindowState();
  mainWindow = new BrowserWindow({
    width: winState.width,
    height: winState.height,
    x: winState.x,
    y: winState.y,
    minWidth: 980,
    minHeight: 680,
    frame: false,
    backgroundColor: "#0d1017",
    icon: path.join(appRoot, "assets", "icon.ico"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Lets the sandboxed preload know smoke mode is on (via process.argv)
      // so the renderer suppresses blocking dialogs like the resume prompt.
      additionalArguments:
        process.env.PARTHENON_SMOKE === "1" ? ["--parthenon-smoke"] : [],
    },
  });

  mainWindow.loadFile(path.join(appRoot, "dist", "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Dev mode (--dev): DevTools open, and any change under dist/renderer
  // triggers a debounced reload. Committed progress lives in %APPDATA% and is
  // re-read on every load, so reloading is always safe. The watcher only
  // observes dist/ — it never touches the save files.
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
    const watched = path.join(appRoot, "dist", "renderer");
    let debounce: NodeJS.Timeout | null = null;
    try {
      const watcher = fs.watch(watched, { recursive: true }, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          console.log("[dev] dist/renderer changed — reloading window");
          mainWindow?.webContents.reload();
        }, 200);
      });
      mainWindow.on("closed", () => watcher.close());
    } catch (err) {
      console.warn("[dev] file watcher unavailable:", err);
    }
  }

  // Headless smoke check used by CI / build verification:
  // PARTHENON_SMOKE=1 loads the app, counts renderer console errors,
  // round-trips the IPC bridge, then exits 0 (clean) or 1 (errors).
  if (process.env.PARTHENON_SMOKE === "1") {
    let errors = 0;
    mainWindow.webContents.on("console-message", (_e, level, message) => {
      if (level >= 3) {
        errors++;
        console.error("[smoke] renderer error:", message);
      }
    });
    mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
      errors++;
      console.error("[smoke] did-fail-load:", code, desc);
    });
    // Two passes: verify the fresh load, then reload the window (the dev-loop
    // scenario) and verify again — progress must re-read from disk with zero
    // renderer errors both times.
    let loads = 0;
    mainWindow.webContents.on("did-finish-load", () => {
      loads++;
      const pass = loads;
      setTimeout(async () => {
        try {
          const nodeCount = await mainWindow!.webContents.executeJavaScript(
            "window.parthenon.getProgress().then(p => Object.keys(p.nodes).length)"
          );
          const svgOk = await mainWindow!.webContents.executeJavaScript(
            "!!document.querySelector('#temple-svg-host svg')"
          );
          console.log(
            `[smoke] pass=${pass} ipc nodes=${nodeCount} templeRendered=${svgOk} rendererErrors=${errors}`
          );
          if (nodeCount !== 8 || !svgOk) errors++;
        } catch (err) {
          errors++;
          console.error(`[smoke] pass=${pass} check failed:`, err);
        }
        // Optional visual capture for UI review: PARTHENON_SHOT=<path.png>
        const shot = process.env.PARTHENON_SHOT;
        if (shot && pass === 2 && mainWindow) {
          try {
            const image = await mainWindow.webContents.capturePage();
            fs.writeFileSync(shot, image.toPNG());
            console.log(`[smoke] screenshot -> ${shot}`);
          } catch (err) {
            console.error("[smoke] screenshot failed:", err);
          }
        }
        if (pass === 1) mainWindow?.webContents.reload();
        else app.exit(errors ? 1 : 0);
      }, 2500);
    });
  }

  if (winState.isMaximized) mainWindow.maximize();

  const sendMaxState = () =>
    mainWindow?.webContents.send(
      "window-maximize-changed",
      mainWindow.isMaximized()
    );
  mainWindow.on("maximize", sendMaxState);
  mainWindow.on("unmaximize", sendMaxState);

  const remember = () => mainWindow && saveWindowState(mainWindow);
  mainWindow.on("resize", remember);
  mainWindow.on("move", remember);
  mainWindow.on("maximize", remember);
  mainWindow.on("unmaximize", remember);
  mainWindow.on("close", () => mainWindow && saveWindowState(mainWindow, true));
  mainWindow.on("closed", () => (mainWindow = null));
}

function safeQuizPath(quizFile: string): string {
  // Only bare file names like "react.json" are legal; reject traversal.
  const base = path.basename(quizFile);
  if (base !== quizFile || !base.endsWith(".json")) {
    throw new Error(`Illegal quiz file name: ${quizFile}`);
  }
  return path.join(dataDir, "quizzes", base);
}

function registerIpc(): void {
  ipcMain.handle("get-progress", () => loadProgress(storePaths));

  ipcMain.handle("save-quiz-score", (_event, nodeId: string, score: number) => {
    if (typeof nodeId !== "string" || typeof score !== "number") {
      throw new Error("save-quiz-score expects (nodeId: string, score: number)");
    }
    return saveQuizScore(storePaths, nodeId, score);
  });

  ipcMain.handle("reset-progress", () => {
    clearAttempt(storePaths);
    return resetProgress(storePaths);
  });

  ipcMain.handle("save-attempt", (_event, attempt: ActiveAttempt) => {
    if (
      !attempt ||
      typeof attempt.nodeId !== "string" ||
      typeof attempt.sectionIndex !== "number" ||
      !["lesson", "redeem"].includes(attempt.phase)
    ) {
      throw new Error("save-attempt expects a well-formed ActiveAttempt");
    }
    saveAttempt(storePaths, attempt);
  });

  ipcMain.handle("get-attempt", () => loadAttempt(storePaths));

  ipcMain.handle("clear-attempt", () => clearAttempt(storePaths));

  ipcMain.handle(
    "record-section-result",
    (_event, nodeId: string, sectionIndex: number, correct: boolean) => {
      if (
        typeof nodeId !== "string" ||
        typeof sectionIndex !== "number" ||
        typeof correct !== "boolean"
      ) {
        throw new Error(
          "record-section-result expects (nodeId: string, sectionIndex: number, correct: boolean)"
        );
      }
      recordSectionResult(storePaths, nodeId, sectionIndex, correct);
    }
  );

  ipcMain.handle("export-progress", async () => {
    if (!mainWindow) return false;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Export progress",
      defaultPath: "dev-parthenon-progress.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (canceled || !filePath) return false;
    // Ensure the live save exists, then copy it.
    loadProgress(storePaths);
    fs.copyFileSync(progressFilePath(storePaths), filePath);
    return true;
  });

  ipcMain.handle("import-progress", async () => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Import progress",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (canceled || !filePaths[0]) return null;
    const data = JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
    if (!data || typeof data !== "object" || typeof data.nodes !== "object") {
      throw new Error("That file is not a Dev Parthenon progress file.");
    }
    const migrated = migrateProgress(data);
    writeProgress(storePaths, migrated);
    clearAttempt(storePaths);
    return migrated;
  });

  ipcMain.handle("get-settings", () => loadSettings(storePaths));

  ipcMain.handle("save-settings", (_event, patch: Partial<Settings>) => {
    if (patch === null || typeof patch !== "object") {
      throw new Error("save-settings expects a settings patch object");
    }
    return saveSettings(storePaths, patch);
  });

  ipcMain.handle("get-review-deck", (_event, limit?: number) => {
    const data = loadProgress(storePaths);
    const stats = data.sectionStats ?? {};
    const nowISO = new Date().toISOString();
    const candidates = Object.entries(stats).map(([key, stat]) => ({ key, stat }));
    const quizCache = new Map<string, QuizModule>();
    const entries: ReviewDeckEntry[] = [];
    for (const c of orderDeck(candidates)) {
      const slash = c.key.lastIndexOf("/");
      const nodeId = c.key.slice(0, slash);
      const sectionIndex = Number(c.key.slice(slash + 1));
      const node = data.nodes[nodeId];
      if (!node || Number.isNaN(sectionIndex)) continue;
      let quiz = quizCache.get(node.quizFile);
      if (!quiz) {
        try {
          quiz = JSON.parse(
            fs.readFileSync(safeQuizPath(node.quizFile), "utf-8")
          ) as QuizModule;
          quizCache.set(node.quizFile, quiz);
        } catch {
          continue;
        }
      }
      const section = quiz.sections[sectionIndex];
      if (!section) continue;
      entries.push({
        key: c.key,
        nodeId,
        sectionIndex,
        nodeTitle: node.title,
        heading: section.heading,
        quizFile: node.quizFile,
        due: isDue(c.stat, nowISO),
        missed: c.stat.missed,
        seen: c.stat.seen,
      });
      if (entries.length >= (limit ?? 8)) break;
    }
    return entries;
  });

  ipcMain.handle("get-quiz", (_event, quizFile: string): QuizModule => {
    const raw = fs.readFileSync(safeQuizPath(quizFile), "utf-8");
    return JSON.parse(raw) as QuizModule;
  });

  ipcMain.handle("get-glossary", (): GlossaryEntry[] => {
    const raw = fs.readFileSync(path.join(dataDir, "glossary.json"), "utf-8");
    return JSON.parse(raw) as GlossaryEntry[];
  });

  ipcMain.on("window-control", (_event, action: string) => {
    if (!mainWindow) return;
    switch (action) {
      case "minimize":
        mainWindow.minimize();
        break;
      case "maximize":
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
        break;
      case "close":
        mainWindow.close();
        break;
    }
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
