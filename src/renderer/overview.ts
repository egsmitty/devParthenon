/**
 * The Overview — a calm "here's what you now know" recap of a module.
 *
 * Shown from a module's graded-pass screen (before the Mastery-Test CTA): every
 * section's heading and one-line "In short" summary, with the Codex terms it
 * touched and their definitions. Auto-generated from data we already have —
 * section summaries + the glossary — so it needs no bespoke content.
 *
 * Self-contained overlay following the shared `#x-root` + open/close +
 * Esc/backdrop pattern, with a Tab focus trap. Sits above the module modal it
 * launches from, so closing it returns to the pass screen.
 */
import type { GlossaryEntry, QuizModule } from "../types/schema.js";
import { escapeHtml } from "./modal.js";
import { playCue } from "./sound.js";

function ovRoot(): HTMLElement {
  return document.getElementById("overview-root")!;
}

export function isOverviewOpen(): boolean {
  return !ovRoot().hasAttribute("hidden");
}

/** Whole-word glossary terms mentioned in a section's paragraphs. */
function termsIn(paragraphs: string[], glossary: GlossaryEntry[]): GlossaryEntry[] {
  const text = " " + paragraphs.join("  ").toLowerCase() + " ";
  return glossary
    .filter((e) => {
      const esc = e.term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(text);
    })
    .slice(0, 5);
}

export function openOverview(quiz: QuizModule, glossary: GlossaryEntry[]): void {
  const rows = quiz.sections
    .filter((s) => s.heading)
    .map((s) => {
      const terms = termsIn(s.paragraphs ?? [], glossary);
      const termsHtml = terms.length
        ? `<dl class="ov-terms">` +
          terms
            .map(
              (t) =>
                `<div class="ov-term"><dt>${escapeHtml(t.term)}</dt>` +
                `<dd>${escapeHtml(t.definition)}</dd></div>`
            )
            .join("") +
          `</dl>`
        : "";
      return (
        `<section class="ov-row">` +
        `<h3 class="ov-heading">${escapeHtml(s.heading)}</h3>` +
        (s.summary ? `<p class="ov-summary">${escapeHtml(s.summary)}</p>` : "") +
        termsHtml +
        `</section>`
      );
    })
    .join("");

  const panel = document.createElement("section");
  panel.className = "ov-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Module overview");
  panel.innerHTML = `
    <header class="ov-head">
      <div class="ov-title">
        <h2>What You Now Know</h2>
        <p class="ov-sub">${escapeHtml(quiz.title)} &mdash; every topic, in one look.</p>
      </div>
      <button class="codex-close ov-return" data-action="close" aria-label="Close the overview and return">
        <span class="return-glyph" aria-hidden="true">&#8617;</span> Return
      </button>
    </header>
    <div class="ov-scroll">${rows}</div>
  `;

  const backdrop = document.createElement("div");
  backdrop.className = "ov-backdrop";
  backdrop.setAttribute("data-action", "close");

  const root = ovRoot();
  root.replaceChildren(backdrop, panel);
  root.hidden = false;

  panel.querySelector('[data-action="close"]')!.addEventListener("click", closeOverview);
  backdrop.addEventListener("click", closeOverview);

  requestAnimationFrame(() => root.classList.add("open"));
  playCue("open");
  panel.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus();
}

export function closeOverview(): void {
  const root = ovRoot();
  root.classList.remove("open");
  window.setTimeout(() => {
    root.hidden = true;
    root.replaceChildren();
  }, 220);
}

/** Esc closes, Tab is trapped within the panel. Bound once at boot. */
document.addEventListener("keydown", (e) => {
  if (!isOverviewOpen()) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeOverview();
  } else if (e.key === "Tab") {
    trapTab(e);
  }
});

function trapTab(e: KeyboardEvent): void {
  const panel = ovRoot().querySelector<HTMLElement>(".ov-panel");
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
