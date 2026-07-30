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

/** Crossed spears behind a bossed hoplite shield — the crest above the sign. */
const CROSSED_ARMS = `<svg class="hg-crest" viewBox="0 0 240 130" aria-hidden="true">
  <defs>
    <radialGradient id="hg-shield" cx="0.42" cy="0.36" r="0.85">
      <stop offset="0" stop-color="#5a4426"/><stop offset="0.65" stop-color="#332512"/><stop offset="1" stop-color="#1a130a"/>
    </radialGradient>
    <linearGradient id="hg-shaft" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9c6a24"/><stop offset="0.5" stop-color="#6b4a1f"/><stop offset="1" stop-color="#4a3212"/>
    </linearGradient>
    <linearGradient id="hg-blade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdf3cf"/><stop offset="0.5" stop-color="#e6c063"/><stop offset="1" stop-color="#b3841f"/>
    </linearGradient>
  </defs>
  <g stroke="url(#hg-shaft)" stroke-width="5.5" stroke-linecap="round">
    <line x1="36" y1="116" x2="196" y2="22"/>
    <line x1="204" y1="116" x2="44" y2="22"/>
  </g>
  <g stroke="#3a2810" stroke-width="1" fill="none" opacity="0.6">
    <line x1="36" y1="116" x2="196" y2="22"/><line x1="204" y1="116" x2="44" y2="22"/>
  </g>
  <path d="M60 96 l 6 3.6 M 72 89 l 6 3.6 M 168 96 l -6 3.6 M 156 89 l -6 3.6" stroke="#c9a24a" stroke-width="2"/>
  <path d="M196 22 C 202 14 212 10 218 9 C 214 17 212 25 206 28 C 203 24 199 23 196 22 Z" fill="url(#hg-blade)" stroke="#8a5a13" stroke-width="1"/>
  <path d="M44 22 C 38 14 28 10 22 9 C 26 17 28 25 34 28 C 37 24 41 23 44 22 Z" fill="url(#hg-blade)" stroke="#8a5a13" stroke-width="1"/>
  <circle cx="36" cy="116" r="4" fill="#8a5a13"/><circle cx="204" cy="116" r="4" fill="#8a5a13"/>
  <circle cx="120" cy="72" r="36" fill="url(#hg-shield)" stroke="#e6c063" stroke-width="3.4"/>
  <circle cx="120" cy="72" r="29" fill="none" stroke="#8a5a13" stroke-width="1.6" opacity="0.9"/>
  <path d="M99 72 h5 v-5 h5 v10 h5 v-10 h5 v10 h5 v-10 h5 v10 h5 v-10 h5 v5 h2"
    fill="none" stroke="#c9a24a" stroke-width="1.6" opacity="0.85"/>
  <circle cx="120" cy="72" r="10" fill="url(#hg-blade)" stroke="#8a5a13" stroke-width="1.4"/>
  <path d="M117 65 l 7 6 l -5 0 l 6 8 l -9 -6 l 5 0 z" fill="#4a2c0a"/>
  <path d="M96 52 A 32 32 0 0 1 132 42" fill="none" stroke="#fdf3cf" stroke-width="2" opacity="0.28"/>
</svg>`;

/** A bronze tripod brazier, coals glowing, with a layered living flame. */
const BRAZIER = `<svg class="hg-brazier" viewBox="0 0 70 150" aria-hidden="true">
  <defs>
    <linearGradient id="hg-flame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fde68a"/><stop offset="0.55" stop-color="#f59e0b"/><stop offset="1" stop-color="#c0432a"/>
    </linearGradient>
    <linearGradient id="hg-flame-core" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#fbbf24"/>
    </linearGradient>
    <linearGradient id="hg-bronze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8a6a2e"/><stop offset="0.5" stop-color="#5c451c"/><stop offset="1" stop-color="#3a2c12"/>
    </linearGradient>
  </defs>
  <ellipse cx="35" cy="60" rx="30" ry="34" fill="#f59e0b" opacity="0.13"/>
  <g class="hg-fire">
    <path d="M35 14 C 47 30 48 42 40 52 C 52 48 54 34 49 26 C 60 38 58 58 38 64 L 32 64 C 12 58 10 38 21 26 C 16 34 18 48 30 52 C 22 42 23 30 35 14 Z" fill="url(#hg-flame)"/>
    <path d="M35 34 C 41 43 41 51 35 57 C 29 51 29 43 35 34 Z" fill="url(#hg-flame-core)"/>
  </g>
  <ellipse cx="35" cy="66" rx="17" ry="4.5" fill="#c0432a"/>
  <circle cx="28" cy="65" r="2" fill="#fbbf24"/><circle cx="36" cy="67" r="1.7" fill="#fde68a"/><circle cx="43" cy="65" r="1.9" fill="#f59e0b"/>
  <path d="M13 66 L 57 66 L 51 82 L 19 82 Z" fill="url(#hg-bronze)" stroke="#2b1f0c" stroke-width="1.6"/>
  <path d="M17 71 h 36" stroke="#c9a24a" stroke-width="1.4" opacity="0.7"/>
  <path d="M22 75 h 4 v-3 h 4 v3 h 4 v-3 h 4 v3 h 4 v-3 h 4 v3 h 2" fill="none" stroke="#c9a24a" stroke-width="1.1" opacity="0.55"/>
  <g stroke="url(#hg-bronze)" stroke-width="5" stroke-linecap="round" fill="none">
    <path d="M24 82 C 20 100 16 116 13 132"/>
    <path d="M35 82 L 35 134"/>
    <path d="M46 82 C 50 100 54 116 57 132"/>
  </g>
  <path d="M20 108 h 30" stroke="url(#hg-bronze)" stroke-width="3.4"/>
  <ellipse cx="35" cy="138" rx="27" ry="6" fill="#241a0c" stroke="#3a2c12" stroke-width="1.6"/>
  <circle cx="13" cy="132" r="3.4" fill="#8a6a2e"/><circle cx="35" cy="134" r="3.4" fill="#8a6a2e"/><circle cx="57" cy="132" r="3.4" fill="#8a6a2e"/>
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
