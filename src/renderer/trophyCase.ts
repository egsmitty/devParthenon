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

let earnedRef = new Set<string>();

export function openTrophyCase(progress: ProgressData): void {
  earnedRef = new Set(progress.trophies ?? []);
  const total = TROPHY_ORDER.length;

  const panel = document.createElement("section");
  panel.className = "tc-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Trophy Case");
  panel.innerHTML = `
    <header class="tc-head">
      <div class="tc-title">
        <h2>Trophy Case</h2>
        <p class="tc-sub">${earnedRef.size} of ${total} gods enshrined &mdash; earned by passing each trial.</p>
      </div>
      <button class="codex-close tc-return" data-action="close" aria-label="Close the trophy case and return">
        <span class="return-glyph" aria-hidden="true">&#8617;</span> Return
      </button>
    </header>
    <div class="tc-body"></div>
  `;

  const backdrop = document.createElement("div");
  backdrop.className = "tc-backdrop";
  backdrop.setAttribute("data-action", "close");

  const root = tcRoot();
  root.replaceChildren(backdrop, panel);
  root.hidden = false;

  panel.querySelector('[data-action="close"]')!.addEventListener("click", closeTrophyCase);
  backdrop.addEventListener("click", closeTrophyCase);

  renderGrid();
  requestAnimationFrame(() => root.classList.add("open"));
  playCue("open");
  panel.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus();
}

function tcBody(): HTMLElement | null {
  return tcRoot().querySelector<HTMLElement>(".tc-body");
}

/** The grid of niches. Earned ones are buttons that open the god's page. */
function renderGrid(): void {
  const body = tcBody();
  if (!body) return;
  body.innerHTML =
    `<div class="tc-grid">` +
    TROPHY_ORDER.map((id) => {
      const def = TROPHY[id];
      if (!def) return "";
      const has = earnedRef.has(id);
      if (has) {
        return (
          `<button class="statue-niche tc-niche earned" data-trophy="${escapeHtml(id)}" ` +
          `aria-label="${escapeHtml(def.god)} — read the bio">` +
          `<div class="niche">${def.art}</div>` +
          `<figcaption><span class="niche-name">${escapeHtml(def.god)}</span>` +
          `<span class="niche-epithet">${escapeHtml(def.epithet)}</span></figcaption>` +
          `</button>`
        );
      }
      return (
        `<figure class="statue-niche tc-niche locked">` +
        `<div class="niche">${def.art}<span class="tc-lock" aria-hidden="true">&#128274;</span></div>` +
        `<figcaption><span class="niche-name tc-locked-name">Sealed</span>` +
        `<span class="niche-epithet">Master this trial to reveal its god</span></figcaption>` +
        `</figure>`
      );
    }).join("") +
    `</div>`;
  body.querySelectorAll<HTMLButtonElement>(".tc-niche.earned").forEach((btn) =>
    btn.addEventListener("click", () => renderDetail(btn.dataset.trophy ?? ""))
  );
}

/** A single god's page: big statue, bio, the realm, and a fun fact. */
function renderDetail(id: string): void {
  const body = tcBody();
  const def = TROPHY[id];
  if (!body || !def) return;
  playCue("tick");
  body.innerHTML = `
    <div class="tc-detail">
      <div class="tc-detail-statue"><div class="niche">${def.art}</div></div>
      <div class="tc-detail-text">
        <button class="ghost-btn tc-back" data-action="back">&larr; All trophies</button>
        <h3 class="tc-detail-name">${escapeHtml(def.god)}</h3>
        <p class="tc-detail-epithet">${escapeHtml(def.epithet)}</p>
        <p class="tc-detail-realm"><span>Earned from</span> ${escapeHtml(def.realm)}</p>
        <p class="tc-detail-bio">${escapeHtml(def.bio)}</p>
        <div class="tc-fact"><span class="tc-fact-label">&#9733; Did you know?</span>${escapeHtml(def.fact)}</div>
      </div>
    </div>
  `;
  const back = body.querySelector<HTMLButtonElement>('[data-action="back"]');
  back?.addEventListener("click", renderGrid);
  back?.focus();
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
