/**
 * Settings application + live state (renderer side).
 *
 * The main process owns persistence; this module holds the current settings
 * in memory and reflects them onto the document root so CSS and other modules
 * can react via data-attributes and CSS variables.
 */
import type { ParthenonApi, Settings } from "../types/schema.js";
import { escapeHtml } from "./modal.js";
import { playCue, setSoundEnabled } from "./sound.js";

let current: Settings | null = null;
let apiRef: ParthenonApi;
let onSettingsChange: (() => void) | null = null;

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
  setSoundEnabled(s.sound);
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

/* ---------------- Settings panel UI ---------------- */

function settingsRoot(): HTMLElement {
  return document.getElementById("settings-root")!;
}

function segmented(
  key: keyof Settings,
  options: Array<{ value: string; label: string }>,
  currentValue: string
): string {
  return (
    `<div class="seg" data-key="${key}">` +
    options
      .map(
        (o) =>
          `<button class="seg-btn${o.value === currentValue ? " active" : ""}" ` +
          `data-value="${o.value}">${escapeHtml(o.label)}</button>`
      )
      .join("") +
    `</div>`
  );
}

export function openSettings(onChange: () => void): void {
  onSettingsChange = onChange;
  settingsRoot().hidden = false;
  renderSettingsPanel();
}

export function closeSettings(): void {
  const r = settingsRoot();
  r.hidden = true;
  r.replaceChildren();
  document.getElementById("btn-settings")?.focus();
}

export function isSettingsOpen(): boolean {
  return !settingsRoot().hasAttribute("hidden");
}

function renderSettingsPanel(): void {
  const s = settings();
  const card = document.createElement("div");
  card.className = "modal-card settings-card";
  card.innerHTML = `
    <div class="settings-head">
      <h2>Settings</h2>
      <button class="codex-close" data-action="close" aria-label="Close settings">
        <span class="return-glyph" aria-hidden="true">&#8617;</span> Return
      </button>
    </div>
    <div class="settings-row">
      <div class="settings-label"><h3>Theme</h3><p>The temple by night or by day.</p></div>
      ${segmented("theme", [
        { value: "temple-dark", label: "Temple Night" },
        { value: "parchment", label: "Parchment Day" },
      ], s.theme)}
    </div>
    <div class="settings-row">
      <div class="settings-label"><h3>Answer labels</h3><p>How quiz options are marked.</p></div>
      ${segmented("optionLabels", [
        { value: "letters", label: "A B C D" },
        { value: "numbers", label: "1 2 3 4" },
        { value: "none", label: "None" },
      ], s.optionLabels)}
    </div>
    <div class="settings-row">
      <div class="settings-label"><h3>Text size</h3><p>Scale the whole interface.</p></div>
      <div class="settings-slider">
        <input id="set-fontscale" type="range" min="0.8" max="1.4" step="0.05"
          value="${s.fontScale}" aria-label="Text size" />
        <span id="set-fontscale-val">${Math.round(s.fontScale * 100)}%</span>
      </div>
    </div>
    <div class="settings-row">
      <div class="settings-label"><h3>Reduce motion</h3><p>Calm the animations and glows.</p></div>
      <button class="toggle${s.reducedMotion ? " on" : ""}" id="set-motion"
        role="switch" aria-checked="${s.reducedMotion}" aria-label="Reduce motion">
        <span class="toggle-knob"></span>
      </button>
    </div>
    <div class="settings-row">
      <div class="settings-label"><h3>Sound</h3><p>Soft chimes as you answer and build.</p></div>
      <button class="toggle${s.sound ? " on" : ""}" id="set-sound"
        role="switch" aria-checked="${s.sound}" aria-label="Sound">
        <span class="toggle-knob"></span>
      </button>
    </div>
  `;

  card.querySelector('[data-action="close"]')!.addEventListener("click", closeSettings);

  card.querySelectorAll<HTMLElement>(".seg").forEach((seg) => {
    const key = seg.dataset.key as keyof Settings;
    seg.querySelectorAll<HTMLButtonElement>(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await updateSettings({ [key]: btn.dataset.value } as Partial<Settings>);
        onSettingsChange?.();
        renderSettingsPanel();
      });
    });
  });

  // Slider updates live without re-rendering (would drop the drag).
  const slider = card.querySelector<HTMLInputElement>("#set-fontscale")!;
  slider.addEventListener("input", () => {
    const v = Number(slider.value);
    card.querySelector("#set-fontscale-val")!.textContent = `${Math.round(v * 100)}%`;
    void updateSettings({ fontScale: v });
  });

  card.querySelector("#set-motion")!.addEventListener("click", async () => {
    await updateSettings({ reducedMotion: !settings().reducedMotion });
    onSettingsChange?.();
    renderSettingsPanel();
  });

  card.querySelector("#set-sound")!.addEventListener("click", async () => {
    await updateSettings({ sound: !settings().sound });
    if (settings().sound) playCue("correct"); // a taste of what you enabled
    renderSettingsPanel();
  });

  settingsRoot().replaceChildren(card);
  card.querySelector<HTMLButtonElement>(".seg-btn.active, .seg-btn")?.focus();
}
