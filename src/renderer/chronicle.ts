/**
 * The Chronicle — a progress dashboard: overall mastery, per-module standing,
 * and spaced-repetition recall stats. Read-only; computed from progress data.
 */
import type { ProgressData } from "../types/schema.js";
import { escapeHtml } from "./modal.js";

const NODE_ORDER = [
  "foundation",
  "pillar-react",
  "pillar-nextjs",
  "pillar-node",
  "pillar-databases",
  "pillar-tailwind",
  "pillar-git",
  "pediment",
];

const STATUS_LABEL: Record<string, string> = {
  locked: "Sealed",
  unlocked: "Open",
  in_progress: "In progress",
  completed: "Mastered",
};

function chronicleRoot(): HTMLElement {
  return document.getElementById("chronicle-root")!;
}

export function isChronicleOpen(): boolean {
  return !chronicleRoot().hasAttribute("hidden");
}

export function closeChronicle(): void {
  const r = chronicleRoot();
  r.hidden = true;
  r.replaceChildren();
  document.getElementById("btn-chronicle")?.focus();
}

export function openChronicle(progress: ProgressData): void {
  const nodes = NODE_ORDER.map((id) => progress.nodes[id]).filter(Boolean);
  const done = nodes.filter((n) => n.status === "completed").length;
  const scored = nodes.filter((n) => n.score !== null);
  const avg = scored.length
    ? Math.round((scored.reduce((s, n) => s + (n.score ?? 0), 0) / scored.length) * 100)
    : 0;

  const stats = progress.sectionStats ?? {};
  const entries = Object.values(stats);
  const seen = entries.reduce((s, e) => s + (e.seen ?? 0), 0);
  const missed = entries.reduce((s, e) => s + (e.missed ?? 0), 0);
  const recall = seen ? Math.round(((seen - missed) / seen) * 100) : null;

  const summary = (label: string, value: string) =>
    `<div class="chron-stat"><span class="chron-stat-value">${value}</span>` +
    `<span class="chron-stat-label">${label}</span></div>`;

  const bars = nodes
    .map((n) => {
      const pct = Math.round((n.score ?? 0) * 100);
      return (
        `<div class="chron-row chron-${n.status}">` +
        `<span class="chron-name">${escapeHtml(n.title)}</span>` +
        `<div class="chron-bar"><div class="chron-fill" style="width:${pct}%"></div></div>` +
        `<span class="chron-score">${n.score === null ? STATUS_LABEL[n.status] : pct + "%"}</span>` +
        `</div>`
      );
    })
    .join("");

  const card = document.createElement("div");
  card.className = "modal-card chronicle-card";
  card.innerHTML = `
    <div class="settings-head">
      <h2>The Chronicle</h2>
      <button class="codex-close" data-action="close" aria-label="Close the chronicle">
        <span class="return-glyph" aria-hidden="true">&#8617;</span> Return
      </button>
    </div>
    <div class="chron-summary">
      <div class="ring" style="--pct:${avg}"><span>${avg}%</span></div>
      <div class="chron-stats">
        ${summary("Stones set", `${done} / ${nodes.length}`)}
        ${summary("Concepts tracked", String(entries.length))}
        ${summary("Recall accuracy", recall === null ? "—" : recall + "%")}
      </div>
    </div>
    <h3 class="chron-heading">Standing of the temple</h3>
    <div class="chron-rows">${bars}</div>
  `;
  card.querySelector('[data-action="close"]')!.addEventListener("click", closeChronicle);
  chronicleRoot().replaceChildren(card);
  chronicleRoot().hidden = false;
  card.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus();
}
