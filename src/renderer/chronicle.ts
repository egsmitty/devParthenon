/**
 * The Chronicle — a progress dashboard: overall mastery, per-module standing,
 * and spaced-repetition recall stats. Read-only; computed from progress data.
 */
import type { ParthenonApi, ProgressData } from "../types/schema.js";
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

export function openChronicle(
  progress: ProgressData,
  api: ParthenonApi,
  onImported: (updated: ProgressData) => void
): void {
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
        `<div class="chron-bar"><div class="chron-fill" data-pct="${pct}"></div></div>` +
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
      <div class="ring"><span>${avg}%</span></div>
      <div class="chron-stats">
        ${summary("Stones set", `${done} / ${nodes.length}`)}
        ${summary("Concepts tracked", String(entries.length))}
        ${summary("Recall accuracy", recall === null ? "—" : recall + "%")}
        ${summary("Day streak", `${progress.activity?.streak ?? 0}`)}
      </div>
    </div>
    <h3 class="chron-heading">Standing of the temple</h3>
    <div class="chron-rows">${bars}</div>
    <h3 class="chron-heading">Recall heatmap</h3>
    <div class="heatmap" id="chron-heatmap"><p class="chron-hint">Answer a few checks to start tracking concepts here.</p></div>
    <div class="chron-actions">
      <button class="ghost-btn" id="chron-export">Export progress</button>
      <button class="ghost-btn" id="chron-import">Import progress</button>
    </div>
  `;
  card.querySelector('[data-action="close"]')!.addEventListener("click", closeChronicle);

  // Recall heatmap — one cell per tracked concept, grouped by module and
  // coloured by how reliably it's recalled. Fetched from the review deck
  // (which resolves concept headings). Filled in after the card mounts.
  void api.getReviewDeck(200).then((deck) => {
    if (deck.length === 0) return;
    const byNode = new Map<string, typeof deck>();
    for (const e of deck) {
      const arr = byNode.get(e.nodeTitle) ?? [];
      arr.push(e);
      byNode.set(e.nodeTitle, arr);
    }
    const level = (e: { seen: number; missed: number }) => {
      const r = e.seen ? (e.seen - e.missed) / e.seen : 0;
      return r >= 0.8 ? "strong" : r >= 0.5 ? "mid" : "weak";
    };
    const rows = [...byNode.entries()]
      .map(([title, list]) => {
        const cells = list
          .map(
            (e) =>
              `<span class="heat-cell heat-${level(e)}" title="${escapeHtml(
                e.heading
              )} — seen ${e.seen}, missed ${e.missed}"></span>`
          )
          .join("");
        return `<div class="heat-row"><span class="heat-label">${escapeHtml(
          title
        )}</span><div class="heat-cells">${cells}</div></div>`;
      })
      .join("");
    const legend =
      `<div class="heat-legend">` +
      `<span><i class="heat-cell heat-strong"></i>Strong</span>` +
      `<span><i class="heat-cell heat-mid"></i>Shaky</span>` +
      `<span><i class="heat-cell heat-weak"></i>Weak</span>` +
      `</div>`;
    const host = card.querySelector("#chron-heatmap");
    if (host) host.innerHTML = rows + legend;
  });

  // Dynamic styles via CSSOM (inline style attributes violate the CSP).
  card.querySelector<HTMLElement>(".ring")?.style.setProperty("--pct", String(avg));
  card.querySelectorAll<HTMLElement>(".chron-fill").forEach((f) => {
    f.style.width = `${f.dataset.pct}%`;
  });

  card.querySelector("#chron-export")!.addEventListener("click", async () => {
    try {
      await api.exportProgress();
    } catch (err) {
      console.error("export failed:", err);
    }
  });
  card.querySelector("#chron-import")!.addEventListener("click", async () => {
    try {
      const imported = await api.importProgress();
      if (imported) {
        onImported(imported);
        closeChronicle();
      }
    } catch (err) {
      alert("Import failed: " + (err instanceof Error ? err.message : String(err)));
    }
  });
  chronicleRoot().replaceChildren(card);
  chronicleRoot().hidden = false;
  card.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus();
}
