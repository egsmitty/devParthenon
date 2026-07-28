/**
 * Codex Flashcards — a flip-card drill over the glossary.
 *
 * Term on the front, flip to reveal the definition (and its tag seals).
 * Next/Prev walk the deck; Shuffle re-orders it. Self-contained overlay
 * following the shared `#x-root` + open/close + Esc/backdrop pattern.
 *
 * The flip is a 3D `transform: rotateY` (transform-only, GPU-friendly); under
 * `prefers-reduced-motion` it snaps with no rotation via a CSS override.
 */
import type { GlossaryEntry } from "../types/schema.js";
import { escapeHtml } from "./modal.js";
import { playCue } from "./sound.js";

interface DeckState {
  cards: GlossaryEntry[];
  /** A permutation of card indices — the current draw order. */
  order: number[];
  pos: number;
  flipped: boolean;
}

let deck: DeckState | null = null;

function fcRoot(): HTMLElement {
  return document.getElementById("flashcards-root")!;
}

export function isFlashcardsOpen(): boolean {
  return !fcRoot().hasAttribute("hidden");
}

/** Fisher–Yates order over [0, n). */
function shuffledOrder(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function openFlashcards(entries: GlossaryEntry[]): void {
  if (entries.length === 0) return;
  deck = {
    cards: entries,
    order: shuffledOrder(entries.length),
    pos: 0,
    flipped: false,
  };

  const root = fcRoot();
  const panel = document.createElement("section");
  panel.className = "fc-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Codex flashcards");
  panel.innerHTML = `
    <header class="fc-head">
      <div class="fc-title">
        <h2>Flashcards</h2>
        <p class="fc-sub">Recall the term, then flip to check yourself.</p>
      </div>
      <span class="fc-progress" aria-hidden="true"></span>
      <button class="codex-close" data-action="close" aria-label="Close flashcards and return">
        <span class="return-glyph" aria-hidden="true">&#8617;</span> Return
      </button>
    </header>
    <div class="fc-stage">
      <button class="fc-card" data-action="flip" aria-label="Flip card">
        <div class="fc-inner">
          <div class="fc-face fc-front">
            <span class="fc-hint">Term</span>
            <span class="fc-term"></span>
            <span class="fc-flip-hint">click, or press Space, to flip</span>
          </div>
          <div class="fc-face fc-back">
            <span class="fc-hint">Definition</span>
            <span class="fc-def"></span>
            <div class="fc-tags"></div>
          </div>
        </div>
      </button>
    </div>
    <div class="fc-controls">
      <button class="ghost-btn" data-action="prev" aria-label="Previous card">&larr; Prev</button>
      <button class="primary-btn" data-action="flip">Flip</button>
      <button class="ghost-btn" data-action="next" aria-label="Next card">Next &rarr;</button>
      <button class="ghost-btn fc-shuffle" data-action="shuffle">&#10561; Shuffle</button>
    </div>
  `;

  const backdrop = document.createElement("div");
  backdrop.className = "fc-backdrop";
  backdrop.setAttribute("data-action", "close");

  root.replaceChildren(backdrop, panel);
  root.hidden = false;

  panel.querySelector('[data-action="close"]')!.addEventListener("click", closeFlashcards);
  backdrop.addEventListener("click", closeFlashcards);
  panel.querySelectorAll<HTMLButtonElement>('[data-action="flip"]').forEach((b) =>
    b.addEventListener("click", flip)
  );
  panel.querySelector('[data-action="prev"]')!.addEventListener("click", () => go(-1));
  panel.querySelector('[data-action="next"]')!.addEventListener("click", () => go(1));
  panel.querySelector('[data-action="shuffle"]')!.addEventListener("click", reshuffle);

  update();
  requestAnimationFrame(() => root.classList.add("open"));
  playCue("open");
  panel.querySelector<HTMLButtonElement>(".fc-card")?.focus();
}

export function closeFlashcards(): void {
  const root = fcRoot();
  root.classList.remove("open");
  deck = null;
  // Wait out the fade before hiding so the exit reads as intentional.
  window.setTimeout(() => {
    root.hidden = true;
    root.replaceChildren();
  }, 220);
}

/** Repaint the visible card from deck state (no re-mount, so the flip animates). */
function update(): void {
  if (!deck) return;
  const root = fcRoot();
  const entry = deck.cards[deck.order[deck.pos]];
  root.querySelector<HTMLElement>(".fc-term")!.textContent = entry.term;
  root.querySelector<HTMLElement>(".fc-def")!.textContent = entry.definition;
  root.querySelector<HTMLElement>(".fc-tags")!.innerHTML = entry.tags
    .map((t) => `<span class="term-seal">${escapeHtml(t)}</span>`)
    .join("");
  root.querySelector<HTMLElement>(".fc-progress")!.textContent =
    `${deck.pos + 1} / ${deck.order.length}`;
  root.querySelector<HTMLElement>(".fc-card")!.classList.toggle("flipped", deck.flipped);
}

function flip(): void {
  if (!deck) return;
  deck.flipped = !deck.flipped;
  playCue("tick");
  update();
}

/** Walk the deck; a new card always lands face-up (term first). */
function go(delta: number): void {
  if (!deck) return;
  deck.pos = (deck.pos + delta + deck.order.length) % deck.order.length;
  deck.flipped = false;
  playCue("tick");
  update();
}

function reshuffle(): void {
  if (!deck) return;
  deck.order = shuffledOrder(deck.cards.length);
  deck.pos = 0;
  deck.flipped = false;
  playCue("open");
  update();
}

/**
 * Keyboard within the deck: Space/Enter flip, arrows navigate, Esc closes.
 * Bound once at boot; a no-op while the overlay is hidden. (Esc is also wired
 * centrally in app.ts, but handling it here keeps the module self-contained.)
 */
document.addEventListener("keydown", (e) => {
  if (!isFlashcardsOpen()) return;
  switch (e.key) {
    case "Escape":
      e.preventDefault();
      closeFlashcards();
      break;
    case " ":
    case "Enter":
      // Let the focused button handle its own activation; only intercept
      // when focus isn't already on one of our controls.
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      flip();
      break;
    case "ArrowRight":
      e.preventDefault();
      go(1);
      break;
    case "ArrowLeft":
      e.preventDefault();
      go(-1);
      break;
    case "Tab":
      trapTab(e);
      break;
  }
});

/** Keep Tab focus inside the panel — it sits over the still-open Codex. */
function trapTab(e: KeyboardEvent): void {
  const panel = fcRoot().querySelector<HTMLElement>(".fc-panel");
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
