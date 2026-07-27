/**
 * Renderer entry: renders the interactive Parthenon SVG from progress state,
 * drives the glossary sidebar, and wires the custom title bar.
 */
import type {
  GlossaryEntry,
  ModuleNode,
  ParthenonApi,
  ProgressData,
} from "../types/schema.js";
import { escapeHtml, openModule } from "./modal.js";

declare global {
  interface Window {
    parthenon: ParthenonApi;
  }
}

const api = window.parthenon;

const SVG_NS = "http://www.w3.org/2000/svg";

/** Short labels shown on the temple; full titles live in progress.json. */
const PILLAR_ORDER = [
  { id: "pillar-react", label: "React" },
  { id: "pillar-nextjs", label: "Next.js" },
  { id: "pillar-node", label: "Node APIs" },
  { id: "pillar-databases", label: "Databases" },
  { id: "pillar-tailwind", label: "CSS" },
  { id: "pillar-git", label: "Git · CI" },
];

let progress: ProgressData;
let glossary: GlossaryEntry[] = [];

/* ---------------- SVG helpers ---------------- */

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function isClickable(node: ModuleNode): boolean {
  return node.status === "unlocked" || node.status === "in_progress";
}

function nodeGroup(node: ModuleNode): SVGGElement {
  const g = el("g");
  g.classList.add("node", node.status);
  g.setAttribute("data-node-id", node.id);
  const title = el("title");
  title.textContent =
    node.status === "locked"
      ? `${node.title} — locked. Complete: ${node.prerequisites.join(", ")}`
      : node.title;
  g.appendChild(title);
  if (isClickable(node)) {
    g.addEventListener("click", () => launchModule(node));
  }
  return g;
}

function lockBadge(cx: number, cy: number): SVGGElement {
  const g = el("g");
  g.appendChild(
    el("rect", {
      x: cx - 7, y: cy - 3, width: 14, height: 11, rx: 2,
      class: "lock-badge", stroke: "none",
    })
  );
  g.appendChild(
    el("path", {
      d: `M ${cx - 4} ${cy - 3} v -3 a 4 4 0 0 1 8 0 v 3`,
      fill: "none", stroke: "#55607a", "stroke-width": 2,
    })
  );
  return g;
}

function scoreBadge(cx: number, cy: number, score: number | null): SVGTextElement {
  const t = el("text", { x: cx, y: cy, class: "score-badge" });
  t.textContent = score === null ? "" : `${Math.round(score * 100)}%`;
  return t;
}

/* ---------------- Temple construction ---------------- */

function buildTemple(data: ProgressData): SVGSVGElement {
  const svg = el("svg", { viewBox: "0 0 1000 720" });
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Parthenon progress map");

  /* --- Pediment (capstone) --- */
  const pediment = data.nodes["pediment"];
  const pg = nodeGroup(pediment);
  pg.appendChild(
    el("polygon", {
      points: "150,168 850,168 500,42",
      class: "shape",
    })
  );
  // Gold accent lines, visible once completed ("carved").
  pg.appendChild(el("polygon", {
    points: "185,158 815,158 500,62",
    fill: "none", class: "accent-line",
  }));
  const pLabel = el("text", { x: 500, y: 135, class: "node-label" });
  pLabel.textContent = "Capstone Projects · Mock Interviews";
  pg.appendChild(pLabel);
  if (pediment.status === "locked") pg.appendChild(lockBadge(500, 95));
  else if (pediment.status === "completed") pg.appendChild(scoreBadge(500, 112, pediment.score));
  svg.appendChild(pg);

  /* --- Entablature (static beam between pediment and columns) --- */
  svg.appendChild(
    el("rect", {
      x: 140, y: 172, width: 720, height: 26,
      fill: "#171c29", stroke: "#333d54", "stroke-width": 1.5,
    })
  );

  /* --- Six pillars --- */
  const left = 170;
  const right = 830;
  const colW = 68;
  const n = PILLAR_ORDER.length;
  const gap = (right - left - n * colW) / (n + 1);

  PILLAR_ORDER.forEach((p, i) => {
    const node = data.nodes[p.id];
    const x = left + gap + i * (colW + gap);
    const cx = x + colW / 2;
    const g = nodeGroup(node);

    g.appendChild(el("rect", { x: x - 9, y: 200, width: colW + 18, height: 16, class: "shape" })); // capital
    g.appendChild(el("rect", { x, y: 216, width: colW, height: 302, class: "shape" }));            // shaft
    g.appendChild(el("rect", { x: x - 9, y: 518, width: colW + 18, height: 16, class: "shape" })); // base

    // Fluting: appears when the pillar turns to marble.
    for (let f = 1; f <= 3; f++) {
      const fx = x + (colW / 4) * f;
      g.appendChild(el("line", { x1: fx, y1: 224, x2: fx, y2: 510, class: "flute" }));
    }
    g.appendChild(el("line", { x1: x - 9, y1: 213, x2: x + colW + 9, y2: 213, class: "accent-line" }));
    g.appendChild(el("line", { x1: x - 9, y1: 521, x2: x + colW + 9, y2: 521, class: "accent-line" }));

    const label = el("text", { x: cx, y: 250, class: "node-label" });
    label.textContent = p.label;
    g.appendChild(label);

    if (node.status === "locked") g.appendChild(lockBadge(cx, 370));
    else if (node.status === "completed") g.appendChild(scoreBadge(cx, 380, node.score));
    svg.appendChild(g);
  });

  /* --- Foundation: stylobate + steps --- */
  const foundation = data.nodes["foundation"];
  const fg = nodeGroup(foundation);
  fg.appendChild(el("rect", { x: 150, y: 540, width: 700, height: 40, class: "shape" }));
  fg.appendChild(el("rect", { x: 115, y: 580, width: 770, height: 40, class: "shape" }));
  fg.appendChild(el("rect", { x: 80, y: 620, width: 840, height: 40, class: "shape" }));
  fg.appendChild(el("line", { x1: 150, y1: 544, x2: 850, y2: 544, class: "accent-line" }));
  const fLabel = el("text", { x: 500, y: 605, class: "node-label" });
  fLabel.textContent = "Web Foundations — HTTP · DNS · Client/Server · DOM";
  fg.appendChild(fLabel);
  if (foundation.status === "locked") fg.appendChild(lockBadge(500, 645));
  else if (foundation.status === "completed") fg.appendChild(scoreBadge(500, 650, foundation.score));
  svg.appendChild(fg);

  return svg;
}

/* ---------------- Rendering & state sync ---------------- */

function renderTemple(): void {
  const host = document.getElementById("temple-svg-host")!;
  host.replaceChildren(buildTemple(progress));
  renderStats();
}

function renderStats(): void {
  const nodes = Object.values(progress.nodes);
  const done = nodes.filter((m) => m.status === "completed");
  const scored = nodes.filter((m) => m.score !== null);
  const avg = scored.length
    ? Math.round(
        (scored.reduce((s, m) => s + (m.score ?? 0), 0) / scored.length) * 100
      )
    : null;
  const stats = document.getElementById("temple-stats")!;
  stats.innerHTML =
    `<span class="stat"><b>${done.length}</b>/${nodes.length} modules complete</span>` +
    `<span class="stat">Foundation: <b>${progress.foundationCompleted ? "laid" : "not laid"}</b></span>` +
    (avg === null ? "" : `<span class="stat">Average score: <b>${avg}%</b></span>`);
}

async function launchModule(node: ModuleNode): Promise<void> {
  const quiz = await api.getQuiz(node.quizFile);
  openModule(node, quiz, api, (updated) => {
    progress = updated;
    renderTemple();
  });
}

/* ---------------- Glossary sidebar ---------------- */

function renderGlossary(filter: string): void {
  const list = document.getElementById("glossary-list")!;
  const q = filter.trim().toLowerCase();
  const matches = glossary.filter(
    (e) =>
      !q ||
      e.term.toLowerCase().includes(q) ||
      e.definition.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q))
  );
  if (matches.length === 0) {
    list.innerHTML = `<div class="glossary-empty">No terms match &ldquo;${escapeHtml(filter)}&rdquo;.</div>`;
    return;
  }
  list.innerHTML = matches
    .map(
      (e) =>
        `<div class="glossary-entry"><div class="term">${escapeHtml(e.term)}</div>` +
        `<div class="definition">${escapeHtml(e.definition)}</div></div>`
    )
    .join("");
}

/* ---------------- Chrome wiring ---------------- */

function wireTitlebar(): void {
  document.getElementById("btn-min")!.addEventListener("click", () => api.windowControl("minimize"));
  document.getElementById("btn-max")!.addEventListener("click", () => api.windowControl("maximize"));
  document.getElementById("btn-close")!.addEventListener("click", () => api.windowControl("close"));
  api.onMaximizeChange((isMax) => {
    const btn = document.getElementById("btn-max")!;
    btn.title = isMax ? "Restore" : "Maximize";
  });
}

function wireReset(): void {
  document.getElementById("btn-reset")!.addEventListener("click", async () => {
    const sure = confirm(
      "Reset all progress? Every pillar returns to locked and scores are erased."
    );
    if (!sure) return;
    progress = await api.resetProgress();
    renderTemple();
  });
}

/* ---------------- Boot ---------------- */

/**
 * If a mid-module attempt survived a reload/crash, offer to resume it.
 * Declining (or an attempt for a node that is no longer attemptable)
 * discards the snapshot.
 */
async function offerResume(): Promise<void> {
  const attempt = await api.getAttempt();
  if (!attempt) return;
  const node = progress.nodes[attempt.nodeId];
  if (!node || !isClickable(node)) {
    await api.clearAttempt();
    return;
  }
  const where =
    attempt.phase === "redeem"
      ? "in its Redemption Round"
      : `at section ${attempt.sectionIndex + 1}`;
  const resume = confirm(
    `You left "${node.title}" ${where}. Resume where you left off?\n\n` +
      `(Cancel starts the module fresh next time you open it.)`
  );
  if (!resume) {
    await api.clearAttempt();
    return;
  }
  const quiz = await api.getQuiz(node.quizFile);
  openModule(node, quiz, api, (updated) => {
    progress = updated;
    renderTemple();
  }, attempt);
}

async function init(): Promise<void> {
  wireTitlebar();
  wireReset();
  [progress, glossary] = await Promise.all([api.getProgress(), api.getGlossary()]);
  renderTemple();
  renderGlossary("");
  const search = document.getElementById("glossary-search") as HTMLInputElement;
  search.addEventListener("input", () => renderGlossary(search.value));
  if (!api.isSmoke) await offerResume();
}

init().catch((err) => {
  console.error("Failed to initialise Dev Parthenon:", err);
});
