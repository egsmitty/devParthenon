/**
 * First-run welcome rite — a ceremonial overlay introducing the temple.
 * Shown once (until introSeen), or on demand from Settings → Replay welcome.
 */
import type { ParthenonApi } from "../types/schema.js";
import { updateSettings } from "./settings.js";

let apiRef: ParthenonApi;

export function initWelcome(api: ParthenonApi): void {
  apiRef = api;
}

function welcomeRoot(): HTMLElement {
  return document.getElementById("welcome-root")!;
}

const CREST = `<svg viewBox="0 0 220 140" class="welcome-crest" aria-hidden="true">
  <defs><linearGradient id="wc-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fde68a"/><stop offset="0.55" stop-color="#f59e0b"/>
    <stop offset="1" stop-color="#b45309"/></linearGradient></defs>
  <polygon points="110,6 205,62 15,62" fill="none" stroke="url(#wc-gold)" stroke-width="3"/>
  <polygon points="110,20 190,68 30,68" fill="none" stroke="url(#wc-gold)" stroke-width="1" opacity="0.5"/>
  <rect x="20" y="64" width="180" height="8" fill="url(#wc-gold)" opacity="0.55"/>
  ${[0, 1, 2, 3, 4, 5]
    .map(
      // 6 columns of width 13 at pitch 27 → centered on the 110 axis (start 36).
      (i) =>
        `<rect x="${36 + i * 27}" y="76" width="13" height="48" fill="none" stroke="url(#wc-gold)" stroke-width="2.4"/>`
    )
    .join("")}
  <rect x="14" y="124" width="192" height="7" fill="url(#wc-gold)" opacity="0.65"/>
</svg>`;

export function openWelcome(): void {
  const root = welcomeRoot();
  root.hidden = false;
  root.innerHTML = `
    <div class="welcome-card">
      ${CREST}
      <h1 class="welcome-title">Dev Parthenon</h1>
      <p class="welcome-tag">From first principles to interview-ready — one temple, raised stone by stone.</p>
      <div class="welcome-steps">
        <div class="welcome-step">
          <span class="ws-num">I</span>
          <div><h3>Lay the Foundation</h3><p>Client/server, HTTP, DNS, and the DOM — the ground every pillar stands on.</p></div>
        </div>
        <div class="welcome-step">
          <span class="ws-num">II</span>
          <div><h3>Raise Six Pillars</h3><p>React, Next.js, Node, Databases, CSS, and Git/Testing — each mastered to 85%.</p></div>
        </div>
        <div class="welcome-step">
          <span class="ws-num">III</span>
          <div><h3>Carve the Pediment</h3><p>A timed, cross-pillar mock interview crowns the finished temple.</p></div>
        </div>
      </div>
      <button class="primary-btn welcome-enter">Enter the Temple</button>
    </div>
  `;
  root.querySelector(".welcome-enter")!.addEventListener("click", () => closeWelcome());
  requestAnimationFrame(() => root.classList.add("open"));
  root.querySelector<HTMLButtonElement>(".welcome-enter")?.focus();
}

function closeWelcome(): void {
  const root = welcomeRoot();
  void updateSettings({ introSeen: true });
  root.classList.remove("open");
  window.setTimeout(() => {
    root.hidden = true;
    root.replaceChildren();
  }, 420);
}
