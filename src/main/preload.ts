import { contextBridge, ipcRenderer } from "electron";
import type { ParthenonApi } from "../types/schema";

const api: ParthenonApi = {
  getProgress: () => ipcRenderer.invoke("get-progress"),
  saveQuizScore: (nodeId, score) =>
    ipcRenderer.invoke("save-quiz-score", nodeId, score),
  resetProgress: () => ipcRenderer.invoke("reset-progress"),
  getQuiz: (quizFile) => ipcRenderer.invoke("get-quiz", quizFile),
  getGlossary: () => ipcRenderer.invoke("get-glossary"),
  saveAttempt: (attempt) => ipcRenderer.invoke("save-attempt", attempt),
  getAttempt: () => ipcRenderer.invoke("get-attempt"),
  clearAttempt: () => ipcRenderer.invoke("clear-attempt"),
  recordSectionResult: (nodeId, sectionIndex, correct) =>
    ipcRenderer.invoke("record-section-result", nodeId, sectionIndex, correct),
  getReviewDeck: (limit) => ipcRenderer.invoke("get-review-deck", limit),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (patch) => ipcRenderer.invoke("save-settings", patch),
  exportProgress: () => ipcRenderer.invoke("export-progress"),
  importProgress: () => ipcRenderer.invoke("import-progress"),
  windowControl: (action) => ipcRenderer.send("window-control", action),
  isSmoke: process.argv.includes("--parthenon-smoke"),
  onMaximizeChange: (cb) =>
    ipcRenderer.on("window-maximize-changed", (_e, isMax: boolean) =>
      cb(isMax)
    ),
};

contextBridge.exposeInMainWorld("parthenon", api);
