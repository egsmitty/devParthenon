/**
 * Settings application + live state (renderer side).
 *
 * The main process owns persistence; this module holds the current settings
 * in memory and reflects them onto the document root so CSS and other modules
 * can react via data-attributes and CSS variables.
 */
import type { ParthenonApi, Settings } from "../types/schema.js";

let current: Settings | null = null;
let apiRef: ParthenonApi;

export function settings(): Settings {
  if (!current) throw new Error("settings not initialised");
  return current;
}

/** True when motion should be suppressed (user setting OR OS preference). */
export function motionReduced(): boolean {
  return (
    document.documentElement.dataset.motion === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Reflect settings onto <html> so CSS/JS can respond. */
export function applySettings(s: Settings): void {
  current = s;
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.motion = s.reducedMotion ? "reduce" : "full";
  root.dataset.optionLabels = s.optionLabels;
  root.style.setProperty("--user-font-scale", String(s.fontScale));
}

export async function initSettings(api: ParthenonApi): Promise<Settings> {
  apiRef = api;
  const s = await api.getSettings();
  applySettings(s);
  return s;
}

/** Patch, persist, and re-apply. Returns the merged settings. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const merged = await apiRef.saveSettings(patch);
  applySettings(merged);
  return merged;
}
