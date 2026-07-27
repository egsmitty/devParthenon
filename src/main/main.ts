import { app, BrowserWindow, ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import {
  loadProgress,
  resetProgress,
  saveQuizScore,
  StorePaths,
} from "./store";
import type { GlossaryEntry, QuizModule } from "../types/schema";

// Spec: saves live in %APPDATA%/DevParthenon (no space), so pin the
// user-data path explicitly instead of relying on productName.
app.setPath("userData", path.join(app.getPath("appData"), "DevParthenon"));

// app.getAppPath() resolves to the project root in dev and to the packaged
// app root (inside the asar) in production, so data/ resolves in both.
const appRoot = app.getAppPath();
const dataDir = path.join(appRoot, "data");

const storePaths: StorePaths = {
  userDataDir: app.getPath("userData"),
  templatePath: path.join(dataDir, "progress.json"),
};

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
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
    },
  });

  mainWindow.loadFile(path.join(appRoot, "dist", "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow?.show());

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
    mainWindow.webContents.on("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const nodeCount = await mainWindow!.webContents.executeJavaScript(
            "window.parthenon.getProgress().then(p => Object.keys(p.nodes).length)"
          );
          const svgOk = await mainWindow!.webContents.executeJavaScript(
            "!!document.querySelector('#temple-svg-host svg')"
          );
          console.log(
            `[smoke] ipc nodes=${nodeCount} templeRendered=${svgOk} rendererErrors=${errors}`
          );
          if (nodeCount !== 8 || !svgOk) errors++;
        } catch (err) {
          errors++;
          console.error("[smoke] ipc check failed:", err);
        }
        app.exit(errors ? 1 : 0);
      }, 2500);
    });
  }

  const sendMaxState = () =>
    mainWindow?.webContents.send(
      "window-maximize-changed",
      mainWindow.isMaximized()
    );
  mainWindow.on("maximize", sendMaxState);
  mainWindow.on("unmaximize", sendMaxState);
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

  ipcMain.handle("reset-progress", () => resetProgress(storePaths));

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
