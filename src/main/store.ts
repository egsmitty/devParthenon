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
} from "../types/schema";

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
    return JSON.parse(raw) as ProgressData;
  } catch {
    // Corrupt save: fall back to the template rather than crashing.
    const raw = fs.readFileSync(paths.templatePath, "utf-8");
    const fresh = JSON.parse(raw) as ProgressData;
    writeProgress(paths, fresh);
    return fresh;
  }
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

  writeProgress(paths, data);
  // A graded score means the attempt reached its end — the snapshot is stale.
  clearAttempt(paths);
  return { progress: data, passed, newlyUnlocked };
}
