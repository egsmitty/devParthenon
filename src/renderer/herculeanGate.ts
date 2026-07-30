/**
 * The Herculean antechamber — a full-page entrance to the final trial.
 *
 * Reached by clicking the temple's torch-lit gateway. A dramatic hall (its own
 * page, like the Codex): crossed spears and fiery braziers over a carved sign,
 * the VS reveal (You vs Hercules), the rules, and the doors into the arena.
 * "Enter the Arena" hands off to the boss fight; "Return" closes.
 *
 * Self-contained overlay: shared open/close + Esc/backdrop + Tab-trap pattern.
 */
import { HERCULES_PORTRAIT, HERO_PORTRAIT } from "./statues.js";
import { playCue } from "./sound.js";

function gateRoot(): HTMLElement {
  return document.getElementById("herculean-gate-root")!;
}

export function isHerculeanGateOpen(): boolean {
  return !gateRoot().hasAttribute("hidden");
}

/** Crossed spears over a round shield — the martial crest above the sign. */
const CROSSED_ARMS = `<svg class="hg-crest" viewBox="0 0 240 120" aria-hidden="true">
  <line x1="30" y1="112" x2="196" y2="14" stroke="#8a5a13" stroke-width="5"/>
  <line x1="210" y1="112" x2="44" y2="14" stroke="#8a5a13" stroke-width="5"/>
  <path d="M196 14 l 12 -6 l -4 13 z" fill="#e6c063"/>
  <path d="M44 14 l -12 -6 l 4 13 z" fill="#e6c063"/>
  <circle cx="120" cy="70" r="30" fill="url(#hg-shield)" stroke="#e6c063" stroke-width="3"/>
  <circle cx="120" cy="70" r="20" fill="none" stroke="#8a5a13" stroke-width="2"/>
  <circle cx="120" cy="70" r="6" fill="#e6c063"/>
  <defs><radialGradient id="hg-shield"><stop offset="0" stop-color="#3a2f1c"/><stop offset="1" stop-color="#1a130a"/></radialGradient></defs>
</svg>`;

/** A stone brazier with a live flame, flanking the arena doors. */
const BRAZIER = `<svg class="hg-brazier" viewBox="0 0 60 130" aria-hidden="true">
  <rect x="24" y="46" width="12" height="70" fill="#241c10" stroke="#4a3a1c" stroke-width="2"/>
  <rect x="14" y="112" width="32" height="10" rx="2" fill="#2c2212" stroke="#4a3a1c" stroke-width="2"/>
  <path d="M14 46 L46 46 L40 34 L20 34 Z" fill="#2c2212" stroke="#4a3a1c" stroke-width="2"/>
  <path d="M30 6 C 40 18 40 26 34 34 C 44 30 44 20 40 14 C 48 24 46 40 30 44 C 14 40 12 24 20 14 C 16 20 16 30 26 34 C 20 26 20 18 30 6 Z" fill="url(#hg-flame)" class="hg-fire"/>
  <defs><linearGradient id="hg-flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="0.5" stop-color="#f59e0b"/><stop offset="1" stop-color="#c0432a"/></linearGradient></defs>
</svg>`;

export function openHerculeanGate(conquered: boolean, onEnter: () => void): void {
  const panel = document.createElement("section");
  panel.className = "hg-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "The Herculean antechamber");
  panel.innerHTML = `
    <button class="codex-close hg-return" data-action="close" aria-label="Leave the antechamber and return">
      <span class="return-glyph" aria-hidden="true">&#8617;</span> Return
    </button>
    <div class="hg-sign">
      ${CROSSED_ARMS}
      <h2>The Herculean Trial</h2>
      <p class="hg-subtitle">Labors of Heracles</p>
    </div>
    <div class="hg-arena">
      ${BRAZIER}
      <div class="hg-vs">
        <div class="boss-fighter you"><div class="boss-portrait big">${HERO_PORTRAIT}</div><div class="boss-name">You</div></div>
        <div class="boss-vs-mark">VS</div>
        <div class="boss-fighter foe"><div class="boss-portrait big">${HERCULES_PORTRAIT}</div><div class="boss-name">Hercules</div></div>
      </div>
      ${BRAZIER}
    </div>
    <p class="hg-lore">
      Twenty-five labors spanning the whole craft await beyond these doors. Every
      right answer lands a blow on Hercules; every wrong one, he lands on you.
      Fell the demigod before he fells you &mdash; you have <strong>45 minutes</strong>.
      ${conquered ? "You have bested him before; enter to prove it was no fluke." : "No one has yet passed. Will you be the first?"}
    </p>
    <div class="hg-doors">
      <button class="primary-btn hg-enter" data-action="enter">Enter the Arena &rarr;</button>
    </div>
  `;

  const backdrop = document.createElement("div");
  backdrop.className = "hg-backdrop";
  backdrop.setAttribute("data-action", "close");

  const root = gateRoot();
  root.replaceChildren(backdrop, panel);
  root.hidden = false;

  panel.querySelector('[data-action="close"]')!.addEventListener("click", closeHerculeanGate);
  backdrop.addEventListener("click", closeHerculeanGate);
  panel.querySelector('[data-action="enter"]')!.addEventListener("click", () => {
    closeHerculeanGate();
    onEnter();
  });

  requestAnimationFrame(() => root.classList.add("open"));
  playCue("open");
  panel.querySelector<HTMLButtonElement>('[data-action="enter"]')?.focus();
}

export function closeHerculeanGate(): void {
  const root = gateRoot();
  root.classList.remove("open");
  window.setTimeout(() => {
    root.hidden = true;
    root.replaceChildren();
  }, 220);
}

document.addEventListener("keydown", (e) => {
  if (!isHerculeanGateOpen()) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeHerculeanGate();
  } else if (e.key === "Tab") {
    trapTab(e);
  }
});

function trapTab(e: KeyboardEvent): void {
  const panel = gateRoot().querySelector<HTMLElement>(".hg-panel");
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
