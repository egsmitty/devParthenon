/**
 * The Trophy Case — a hall of the gods you have mastered.
 *
 * One niche per module trophy (plus the Herculean crown), in temple order.
 * Earned = a lit marble statue with its god's name and epithet; still-locked =
 * a darkened silhouette to chase. Reads `progress.trophies` (the store stays
 * generic); presentation comes from the TROPHY roster in statues.ts.
 *
 * Self-contained overlay following the shared `#x-root` + open/close +
 * Esc/backdrop pattern (mirrors flashcards.ts), with a Tab focus trap.
 */
import type { ProgressData } from "../types/schema.js";
import { TROPHY, TROPHY_ORDER } from "./statues.js";
import { escapeHtml } from "./modal.js";
import { playCue } from "./sound.js";

function tcRoot(): HTMLElement {
  return document.getElementById("trophy-case-root")!;
}

export function isTrophyCaseOpen(): boolean {
  return !tcRoot().hasAttribute("hidden");
}

export function openTrophyCase(progress: ProgressData): void {
  const earned = new Set(progress.trophies ?? []);
  const total = TROPHY_ORDER.length;

  const niches = TROPHY_ORDER.map((id) => {
    const def = TROPHY[id];
    if (!def) return "";
    const has = earned.has(id);
    const caption = has
      ? `<span class="niche-name">${escapeHtml(def.god)}</span>` +
        `<span class="niche-epithet">${escapeHtml(def.epithet)}</span>`
      : `<span class="niche-name tc-locked-name">Sealed</span>` +
        `<span class="niche-epithet">Master this trial to reveal its god</span>`;
    return (
      `<figure class="statue-niche tc-niche ${has ? "earned" : "locked"}">` +
      `<div class="niche">${def.art}${has ? "" : '<span class="tc-lock" aria-hidden="true">&#128274;</span>'}</div>` +
      `<figcaption>${caption}</figcaption>` +
      `</figure>`
    );
  }).join("");

  const panel = document.createElement("section");
  panel.className = "tc-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Trophy Case");
  panel.innerHTML = `
    <header class="tc-head">
      <div class="tc-title">
        <h2>Trophy Case</h2>
        <p class="tc-sub">${earned.size} of ${total} gods enshrined &mdash; earned by passing each Mastery Test.</p>
      </div>
      <button class="codex-close tc-return" data-action="close" aria-label="Close the trophy case and return">
        <span class="return-glyph" aria-hidden="true">&#8617;</span> Return
      </button>
    </header>
    <div class="tc-grid">${niches}</div>
  `;

  const backdrop = document.createElement("div");
  backdrop.className = "tc-backdrop";
  backdrop.setAttribute("data-action", "close");

  const root = tcRoot();
  root.replaceChildren(backdrop, panel);
  root.hidden = false;

  panel.querySelector('[data-action="close"]')!.addEventListener("click", closeTrophyCase);
  backdrop.addEventListener("click", closeTrophyCase);

  requestAnimationFrame(() => root.classList.add("open"));
  playCue("open");
  panel.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus();
}

export function closeTrophyCase(): void {
  const root = tcRoot();
  root.classList.remove("open");
  window.setTimeout(() => {
    root.hidden = true;
    root.replaceChildren();
  }, 220);
}

/**
 * Keyboard: Esc closes, Tab is trapped within the panel. Bound once at boot;
 * a no-op while hidden. (Esc is also wired centrally in app.ts.)
 */
document.addEventListener("keydown", (e) => {
  if (!isTrophyCaseOpen()) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeTrophyCase();
  } else if (e.key === "Tab") {
    trapTab(e);
  }
});

function trapTab(e: KeyboardEvent): void {
  const panel = tcRoot().querySelector<HTMLElement>(".tc-panel");
  if (!panel) return;
  const focusables = Array.from(
    panel.querySelectorAll<HTMLElement>("button:not([disabled])")
  ).filter((el) => el.offsetParent !== null);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement as HTMLElement | null;
  const inside = active !== null && panel.contains(active);
  if (e.shiftKey && (!inside || active === first)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || active === last)) {
    e.preventDefault();
    first.focus();
  }
}
