/**
 * Progress persistence + progression rules.
 *
 * Deliberately free of any Electron imports so it can be unit-tested with
 * plain Node (`node --test`). The main process passes in the paths.
 */
import * as fs from "fs";
import * as path from "path";
import type {
  ActiveAttempt,
  ModuleNode,
  ProgressData,
  SaveScoreResult,
  Settings,
} from "../types/schema";
import { recordResult } from "./review";

export const PROGRESS_VERSION = 3;

export const PASS_THRESHOLD = 0.85;

export interface StorePaths {
  /** Directory holding the live save file (e.g. %APPDATA%/DevParthenon). */
  userDataDir: string;
  /** Path to the pristine template save file (data/progress.json). */
  templatePath: string;
}

export function progressFilePath(paths: StorePaths): string {
  return path.join(paths.userDataDir, "progress.json");
}

/**
 * Load the user's progress. If no save exists yet, clone the initial
 * template into the user-data directory first.
 */
export function loadProgress(paths: StorePaths): ProgressData {
  const file = progressFilePath(paths);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(paths.userDataDir, { recursive: true });
    fs.copyFileSync(paths.templatePath, file);
  }
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return migrateProgress(JSON.parse(raw) as ProgressData, paths);
  } catch {
    // Corrupt save: fall back to the template rather than crashing.
    const raw = fs.readFileSync(paths.templatePath, "utf-8");
    const fresh = migrateProgress(JSON.parse(raw) as ProgressData, paths);
    writeProgress(paths, fresh);
    return fresh;
  }
}

/**
 * Idempotent save-file upgrade. v1 -> v2 adds the sectionStats map for the
 * spaced-repetition review deck. Old fields are never removed or reshaped,
 * so existing scores and unlock state always survive.
 */
export function migrateProgress(
  data: ProgressData,
  paths?: StorePaths
): ProgressData {
  let changed = false;
  if (!data.version || data.version < PROGRESS_VERSION) {
    data.version = PROGRESS_VERSION;
    changed = true;
  }
  if (!data.sectionStats) {
    data.sectionStats = {};
    changed = true;
  }
  if (!data.activity) {
    data.activity = { streak: 0, lastActiveDay: "" };
    changed = true;
  }
  if (changed && paths) writeProgress(paths, data);
  return data;
}

/**
 * Bump the consecutive-day streak: +1 if the last active day was yesterday,
 * unchanged if already today, reset to 1 otherwise. `today` is YYYY-MM-DD.
 */
export function touchActivity(data: ProgressData, today: string): void {
  const a = data.activity ?? (data.activity = { streak: 0, lastActiveDay: "" });
  if (a.lastActiveDay === today) return;
  const yesterday = new Date(Date.parse(today) - 86400000)
    .toISOString()
    .slice(0, 10);
  a.streak = a.lastActiveDay === yesterday ? a.streak + 1 : 1;
  a.lastActiveDay = today;
}

/**
 * Atomic write: write to a temp file in the same directory, then rename over
 * the target. Rename on the same volume is atomic on Windows/NTFS, so a
 * crash mid-write can never leave a half-written progress.json behind.
 */
export function writeProgress(paths: StorePaths, data: ProgressData): void {
  fs.mkdirSync(paths.userDataDir, { recursive: true });
  const file = progressFilePath(paths);
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

export function resetProgress(paths: StorePaths): ProgressData {
  const raw = fs.readFileSync(paths.templatePath, "utf-8");
  const fresh = JSON.parse(raw) as ProgressData;
  writeProgress(paths, fresh);
  return fresh;
}

/* ---------------- User settings (settings.json) ---------------- */

export const DEFAULT_SETTINGS: Settings = {
  theme: "temple-dark",
  reducedMotion: false,
  fontScale: 1,
  optionLabels: "letters",
  sound: true,
  introSeen: false,
};

export function settingsFilePath(paths: StorePaths): string {
  return path.join(paths.userDataDir, "settings.json");
}

/** Load settings merged over defaults (tolerates missing/corrupt file). */
export function loadSettings(paths: StorePaths): Settings {
  try {
    const raw = fs.readFileSync(settingsFilePath(paths), "utf-8");
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function sanitizeSettings(s: Settings): Settings {
  const themes = ["temple-dark", "parchment"];
  const labels = ["letters", "numbers", "none"];
  return {
    theme: themes.includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
    reducedMotion: Boolean(s.reducedMotion),
    fontScale: Math.max(0.8, Math.min(1.4, Number(s.fontScale) || 1)),
    optionLabels: labels.includes(s.optionLabels)
      ? s.optionLabels
      : DEFAULT_SETTINGS.optionLabels,
    sound: s.sound === undefined ? DEFAULT_SETTINGS.sound : Boolean(s.sound),
    introSeen: Boolean(s.introSeen),
  };
}

/** Merge a patch over current settings and persist atomically. */
export function saveSettings(paths: StorePaths, patch: Partial<Settings>): Settings {
  const merged = sanitizeSettings({ ...loadSettings(paths), ...patch });
  fs.mkdirSync(paths.userDataDir, { recursive: true });
  const file = settingsFilePath(paths);
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), "utf-8");
  fs.renameSync(tmp, file);
  return merged;
}

/* ---------------- In-flight attempt persistence (§3.6) ---------------- */

export function attemptFilePath(paths: StorePaths): string {
  return path.join(paths.userDataDir, "attempt.json");
}

/** Persist a mid-module attempt snapshot. Same atomic discipline as progress. */
export function saveAttempt(paths: StorePaths, attempt: ActiveAttempt): void {
  if (typeof attempt.nodeId !== "string" || !attempt.nodeId) {
    throw new Error("saveAttempt requires a nodeId");
  }
  fs.mkdirSync(paths.userDataDir, { recursive: true });
  const file = attemptFilePath(paths);
  const tmp = file + ".tmp";
  const stamped: ActiveAttempt = {
    ...attempt,
    savedAtISO: new Date().toISOString(),
  };
  fs.writeFileSync(tmp, JSON.stringify(stamped, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

/** Load the saved attempt, or null if none / unreadable (corrupt = discard). */
export function loadAttempt(paths: StorePaths): ActiveAttempt | null {
  const file = attemptFilePath(paths);
  if (!fs.existsSync(file)) return null;
  try {
    const attempt = JSON.parse(fs.readFileSync(file, "utf-8")) as ActiveAttempt;
    if (typeof attempt.nodeId !== "string" || !attempt.nodeId) return null;
    return attempt;
  } catch {
    clearAttempt(paths);
    return null;
  }
}

export function clearAttempt(paths: StorePaths): void {
  const file = attemptFilePath(paths);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

/**
 * Record one answered check for the review scheduler. Fires on every graded
 * and practice answer; the key is "<nodeId>/<sectionIndex>".
 */
export function recordSectionResult(
  paths: StorePaths,
  nodeId: string,
  sectionIndex: number,
  correct: boolean
): void {
  const data = loadProgress(paths);
  if (!data.nodes[nodeId]) throw new Error(`Unknown module node: ${nodeId}`);
  const key = `${nodeId}/${sectionIndex}`;
  const stats = data.sectionStats ?? (data.sectionStats = {});
  stats[key] = recordResult(stats[key], correct, new Date().toISOString());
  touchActivity(data, new Date().toISOString().slice(0, 10));
  writeProgress(paths, data);
}

function prerequisitesMet(node: ModuleNode, data: ProgressData): boolean {
  return node.prerequisites.every(
    (id) => data.nodes[id] && data.nodes[id].status === "completed"
  );
}

/**
 * Record a quiz score for a node, apply the Pillar Progression Rule, unlock
 * any nodes whose prerequisites are now satisfied, and persist to disk.
 */
export function saveQuizScore(
  paths: StorePaths,
  nodeId: string,
  score: number
): SaveScoreResult {
  const data = loadProgress(paths);
  const node = data.nodes[nodeId];
  if (!node) {
    throw new Error(`Unknown module node: ${nodeId}`);
  }
  if (node.status === "locked") {
    throw new Error(
      `Module "${nodeId}" is locked; complete its prerequisites first.`
    );
  }
  const clamped = Math.max(0, Math.min(1, score));
  node.score = node.score === null ? clamped : Math.max(node.score, clamped);
  const passed = clamped >= PASS_THRESHOLD;
  // Once a stone is set it stays set: a weak replay never downgrades it.
  node.status =
    passed || node.status === "completed" ? "completed" : "in_progress";

  if (node.id === "foundation" && passed) {
    data.foundationCompleted = true;
  }

  const newlyUnlocked: string[] = [];
  if (passed) {
    for (const other of Object.values(data.nodes)) {
      if (other.status === "locked" && prerequisitesMet(other, data)) {
        other.status = "unlocked";
        newlyUnlocked.push(other.id);
        if (
          other.category === "pillar" &&
          !data.unlockedPillars.includes(other.id)
        ) {
          data.unlockedPillars.push(other.id);
        }
      }
    }
  }

  touchActivity(data, new Date().toISOString().slice(0, 10));
  writeProgress(paths, data);
  // A graded score means the attempt reached its end — the snapshot is stale.
  clearAttempt(paths);
  return { progress: data, passed, newlyUnlocked };
}
