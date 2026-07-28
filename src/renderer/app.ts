/**
 * Renderer entry: renders the interactive Parthenon SVG from progress state,
 * drives the glossary sidebar, and wires the custom title bar.
 *
 * Visual language (RPG temple skin): weathered dark stone for locked nodes
 * (with ironwork + shake on click), pulsing gold runes for attemptable ones,
 * polished marble with gold filigree, a seal medallion and sparks for
 * completed ones. Gradients/filters live in <defs>; states are CSS classes.
 */
import type {
  GlossaryEntry,
  ModuleNode,
  NodeStatus,
  ParthenonApi,
  ProgressData,
  QuizModule,
} from "../types/schema.js";
import {
  escapeHtml,
  ModuleMode,
  openModule,
  openReviewDrill,
} from "./modal.js";

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
  { id: "pillar-node", label: "Node" },
  { id: "pillar-databases", label: "Data" },
  { id: "pillar-tailwind", label: "CSS" },
  { id: "pillar-git", label: "Git·CI" },
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

function gradient(
  id: string,
  stops: Array<[number, string]>,
  vertical = true
): SVGLinearGradientElement {
  const g = el("linearGradient", {
    id,
    x1: 0,
    y1: 0,
    x2: vertical ? 0 : 1,
    y2: vertical ? 1 : 0,
  });
  for (const [offset, color] of stops) {
    g.appendChild(el("stop", { offset, "stop-color": color }));
  }
  return g;
}

/** feTurbulence grain overlaid on the shape — stone or marble character. */
function grainFilter(id: string, freq: string, rgba: string): SVGFilterElement {
  const f = el("filter", { id, x: "-5%", y: "-5%", width: "110%", height: "110%" });
  f.appendChild(
    el("feTurbulence", {
      type: "fractalNoise",
      baseFrequency: freq,
      numOctaves: 3,
      stitchTiles: "stitch",
      result: "noise",
    })
  );
  f.appendChild(
    el("feColorMatrix", { in: "noise", type: "matrix", values: rgba, result: "grain" })
  );
  f.appendChild(el("feComposite", { in: "grain", in2: "SourceGraphic", operator: "atop", result: "tinted" }));
  const merge = el("feMerge");
  merge.appendChild(el("feMergeNode", { in: "SourceGraphic" }));
  merge.appendChild(el("feMergeNode", { in: "tinted" }));
  f.appendChild(merge);
  return f;
}

function buildDefs(): SVGDefsElement {
  const defs = el("defs");
  defs.appendChild(gradient("grad-stone", [[0, "#2b313e"], [0.5, "#1d222d"], [1, "#141821"]]));
  defs.appendChild(gradient("grad-stone-dark", [[0, "#1d212b"], [1, "#0d1017"]]));
  defs.appendChild(gradient("grad-stone-warm", [[0, "#2e2a1c"], [0.55, "#211d13"], [1, "#17140c"]]));
  defs.appendChild(gradient("grad-marble", [[0, "#ffffff"], [0.45, "#efece2"], [0.8, "#d9d3c3"], [1, "#c3bba6"]]));
  defs.appendChild(gradient("grad-gold", [[0, "#fde68a"], [0.4, "#f59e0b"], [0.7, "#b45309"], [1, "#fcd34d"]]));
  // Coarse dark grain for weathered stone; long soft veins for marble.
  defs.appendChild(
    grainFilter("tex-stone", "0.55", "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0")
  );
  defs.appendChild(
    grainFilter("tex-marble", "0.012 0.06", "0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.32  0 0 0 0.10 0")
  );
  return defs;
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
      : node.status === "completed"
        ? `${node.title} — mastered. Click to practice (no stakes).`
        : node.title;
  g.appendChild(title);
  const activate = (fn: () => void) => {
    // Keyboard-first: temple stones are real buttons, not just click targets.
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.addEventListener("click", fn);
    g.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    });
  };

  if (isClickable(node)) {
    activate(() => launchModule(node));
  } else if (node.status === "completed") {
    // A mastered stone can be revisited for practice (no stakes).
    g.style.cursor = "pointer";
    activate(() => launchModule(node, "practice"));
  } else if (node.status === "locked") {
    // Locked feedback: brief shake + a toast naming what's still needed.
    g.addEventListener("click", () => {
      g.classList.remove("shake");
      // Force a reflow so re-clicking replays the animation.
      void (g as unknown as HTMLElement).getBoundingClientRect();
      g.classList.add("shake");
      setTimeout(() => g.classList.remove("shake"), 450);
      const missing = node.prerequisites
        .filter((id) => progress.nodes[id]?.status !== "completed")
        .map((id) => progress.nodes[id]?.title ?? id);
      showToast(
        missing.length
          ? `Sealed — first complete: ${missing.join(" · ")}`
          : "Sealed."
      );
    });
  }
  return g;
}

/** Iron padlock + chain links draped over a locked stone. */
function ironwork(cx: number, cy: number, span: number): SVGGElement {
  const g = el("g");
  g.classList.add("ironwork-g");
  // Chain: a row of small links across the span.
  const links = Math.max(3, Math.floor(span / 16));
  for (let i = 0; i < links; i++) {
    const lx = cx - span / 2 + (span / (links - 1)) * i;
    const sag = Math.sin((i / (links - 1)) * Math.PI) * 7;
    g.appendChild(
      el("ellipse", {
        cx: lx, cy: cy - 12 + sag, rx: 4.6, ry: 3.4,
        class: "ironwork", "stroke-width": 1.6, "fill-opacity": 0.25,
      })
    );
  }
  // Padlock body + shackle.
  g.appendChild(el("path", {
    d: `M ${cx - 5.5} ${cy + 1} v -4.5 a 5.5 5.5 0 0 1 11 0 v 4.5`,
    fill: "none", class: "ironwork", "stroke-width": 2.2,
  }));
  g.appendChild(el("rect", {
    x: cx - 8.5, y: cy + 1, width: 17, height: 13, rx: 2,
    class: "ironwork", "stroke-width": 1.4,
  }));
  g.appendChild(el("circle", { cx, cy: cy + 7, r: 2, fill: "#1c202b", stroke: "none" }));
  return g;
}

/** Torch sconce: stone bowl + flickering gold flame flanking the pediment. */
function torch(cx: number, cy: number): SVGGElement {
  const g = el("g");
  g.appendChild(el("rect", {
    x: cx - 6, y: cy, width: 12, height: 7, rx: 2,
    fill: "url(#grad-stone)", stroke: "#39404f", "stroke-width": 1,
  }));
  g.appendChild(el("path", {
    d: `M ${cx} ${cy - 16} C ${cx + 6} ${cy - 9} ${cx + 5} ${cy - 4} ${cx} ${cy + 1} C ${cx - 5} ${cy - 4} ${cx - 6} ${cx > 500 ? cy - 9 : cy - 9} ${cx} ${cy - 16} Z`,
    fill: "url(#grad-gold)", class: "flame",
  }));
  return g;
}

/** Gold completion seal with the score engraved. */
function seal(cx: number, cy: number, score: number | null): SVGGElement {
  const g = el("g");
  g.appendChild(el("circle", { cx, cy, r: 15, class: "seal-disc" }));
  g.appendChild(el("circle", { cx, cy, r: 11.5, class: "seal-ring" }));
  const t = el("text", { x: cx, y: cy + 4, class: "score-badge" });
  t.textContent = score === null ? "" : `${Math.round(score * 100)}`;
  g.appendChild(t);
  // Twinkling sparks around the seal.
  g.appendChild(el("circle", { cx: cx - 20, cy: cy - 14, r: 1.8, class: "spark" }));
  g.appendChild(el("circle", { cx: cx + 19, cy: cy - 6, r: 1.4, class: "spark s2" }));
  g.appendChild(el("circle", { cx: cx + 8, cy: cy + 19, r: 1.6, class: "spark s3" }));
  return g;
}

/* ---------------- Temple construction ---------------- */

function buildTemple(data: ProgressData): SVGSVGElement {
  const svg = el("svg", { viewBox: "0 0 1000 720" });
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Parthenon progress map");
  svg.appendChild(buildDefs());

  /* --- Pediment (capstone) --- */
  const pediment = data.nodes["pediment"];
  const pg = nodeGroup(pediment);
  // Raking cornice: outer triangle + inner tympanum face.
  pg.appendChild(el("polygon", { points: "146,170 854,170 500,38", class: "shape" }));
  pg.appendChild(el("polygon", {
    points: "180,160 820,160 500,58",
    fill: "none", class: "accent-line",
  }));
  // Acroteria: small gold finials at the three corners (completed flourish).
  pg.appendChild(el("path", { d: "M 500 38 l -7 -12 h 14 z", class: "relief" }));
  pg.appendChild(el("path", { d: "M 146 170 l -10 -14 h 16 z", class: "relief" }));
  pg.appendChild(el("path", { d: "M 854 170 l -6 -14 h 16 z", class: "relief" }));
  // Tympanum relief: a meander line carved when complete.
  pg.appendChild(el("path", {
    d: "M 380 150 h 18 v -10 h 12 v 10 h 18 v -10 h 12 v 10 h 18 v -10 h 12 v 10 h 18 v -10 h 12 v 10 h 18 v -10 h 12 v 10 h 18 v -10 h 12 v 10 h 18",
    class: "relief",
  }));
  const pLabel = el("text", { x: 500, y: 128, class: "node-label" });
  pLabel.textContent = "Capstone · Mock Interviews";
  pg.appendChild(pLabel);
  if (pediment.status === "locked") pg.appendChild(ironwork(500, 88, 120));
  else if (pediment.status === "completed") pg.appendChild(seal(500, 95, pediment.score));
  svg.appendChild(pg);

  // Torch sconces flanking the temple front.
  svg.appendChild(torch(116, 160));
  svg.appendChild(torch(884, 160));

  /* --- Entablature: architrave + triglyph frieze (static masonry) --- */
  const ent = el("g");
  ent.appendChild(el("rect", {
    x: 136, y: 172, width: 728, height: 12,
    fill: "url(#grad-stone)", stroke: "#39404f", "stroke-width": 1.2,
  }));
  ent.appendChild(el("rect", {
    x: 136, y: 184, width: 728, height: 18,
    fill: "url(#grad-stone-dark)", stroke: "#39404f", "stroke-width": 1.2,
  }));
  // Triglyphs: paired grooved blocks along the frieze.
  for (let tx = 156; tx <= 830; tx += 52) {
    const block = el("g");
    block.appendChild(el("rect", {
      x: tx, y: 185.5, width: 15, height: 15,
      fill: "url(#grad-stone)", stroke: "#2c3140", "stroke-width": 1,
    }));
    block.appendChild(el("line", { x1: tx + 5, y1: 187, x2: tx + 5, y2: 199, stroke: "#12151d", "stroke-width": 1.6 }));
    block.appendChild(el("line", { x1: tx + 10, y1: 187, x2: tx + 10, y2: 199, stroke: "#12151d", "stroke-width": 1.6 }));
    ent.appendChild(block);
  }
  svg.appendChild(ent);

  /* --- Six pillars --- */
  const left = 170;
  const right = 830;
  const colW = 66;
  const n = PILLAR_ORDER.length;
  const gap = (right - left - n * colW) / (n + 1);

  PILLAR_ORDER.forEach((p, i) => {
    const node = data.nodes[p.id];
    const x = left + gap + i * (colW + gap);
    const cx = x + colW / 2;
    const g = nodeGroup(node);

    // Doric capital: abacus slab + flared echinus.
    g.appendChild(el("rect", { x: x - 11, y: 203, width: colW + 22, height: 9, class: "shape" }));
    g.appendChild(el("path", {
      d: `M ${x - 7} 212 Q ${x - 2} 222 ${x + 3} 224 L ${x + colW - 3} 224 Q ${x + colW + 2} 222 ${x + colW + 7} 212 Z`,
      class: "shape",
    }));
    // Shaft with entasis-suggesting taper.
    g.appendChild(el("path", {
      d: `M ${x + 2} 224 L ${x + colW - 2} 224 L ${x + colW - 5} 512 L ${x + 5} 512 Z`,
      class: "shape",
    }));
    // Base: torus + plinth.
    g.appendChild(el("rect", { x: x - 6, y: 512, width: colW + 12, height: 10, rx: 4, class: "shape" }));
    g.appendChild(el("rect", { x: x - 11, y: 522, width: colW + 22, height: 12, class: "shape" }));

    // Fluting: always present, brightening as the pillar turns to marble.
    for (let f = 1; f <= 4; f++) {
      const fx = x + (colW / 5) * f;
      g.appendChild(el("line", { x1: fx, y1: 228, x2: fx, y2: 508, class: "flute" }));
    }
    g.appendChild(el("line", { x1: x - 11, y1: 208, x2: x + colW + 11, y2: 208, class: "accent-line" }));
    g.appendChild(el("line", { x1: x - 6, y1: 517, x2: x + colW + 6, y2: 517, class: "accent-line" }));

    const label = el("text", { x: cx, y: 258, class: "node-label" });
    label.textContent = p.label;
    g.appendChild(label);

    if (node.status === "locked") g.appendChild(ironwork(cx, 368, colW - 4));
    else if (node.status === "completed") g.appendChild(seal(cx, 380, node.score));
    svg.appendChild(g);
  });

  /* --- Foundation: stylobate + weathered steps --- */
  const foundation = data.nodes["foundation"];
  const fg = nodeGroup(foundation);
  fg.appendChild(el("rect", { x: 150, y: 534, width: 700, height: 40, class: "shape" }));
  fg.appendChild(el("rect", { x: 113, y: 574, width: 774, height: 40, class: "shape" }));
  fg.appendChild(el("rect", { x: 76, y: 614, width: 848, height: 42, class: "shape" }));
  // Masonry joints on the steps.
  for (const [sy, sx, sw, seg] of [[554, 150, 700, 7], [594, 113, 774, 8], [634, 76, 848, 9]] as const) {
    for (let j = 1; j < seg; j++) {
      const jx = sx + (sw / seg) * j;
      fg.appendChild(el("line", { x1: jx, y1: sy - 16, x2: jx, y2: sy + 16, class: "flute" }));
    }
  }
  fg.appendChild(el("line", { x1: 150, y1: 538, x2: 850, y2: 538, class: "accent-line" }));
  fg.appendChild(el("line", { x1: 76, y1: 618, x2: 924, y2: 618, class: "accent-line" }));
  const fLabel = el("text", { x: 500, y: 600, class: "node-label" });
  fLabel.textContent = "Web Foundations — HTTP · DNS · Client/Server · DOM";
  fg.appendChild(fLabel);
  if (foundation.status === "locked") fg.appendChild(ironwork(500, 640, 160));
  else if (foundation.status === "completed") fg.appendChild(seal(500, 638, foundation.score));
  svg.appendChild(fg);

  return svg;
}

/* ---------------- Rendering & state sync ---------------- */

/**
 * Status snapshot from the previous render — the transition detector for
 * one-shot celebration animations. Never fire on boot or plain re-renders.
 */
const lastStatuses = new Map<string, NodeStatus>();
let firstRender = true;

function renderTemple(): void {
  const host = document.getElementById("temple-svg-host")!;
  const svg = buildTemple(progress);

  if (!firstRender) {
    for (const node of Object.values(progress.nodes)) {
      const prev = lastStatuses.get(node.id);
      // Stone set: this node just turned to marble.
      if (prev && prev !== "completed" && node.status === "completed") {
        svg.querySelector(`[data-node-id="${node.id}"]`)?.classList.add("just-completed");
      }
      // The grand moment: all six pillars stood, the pediment opens.
      if (node.id === "pediment" && prev === "locked" && node.status !== "locked") {
        svg.classList.add("grand-unlock");
        const atmo = document.getElementById("atmosphere");
        atmo?.classList.add("grand");
        setTimeout(() => atmo?.classList.remove("grand"), 3600);
      }
    }
  }
  firstRender = false;
  for (const node of Object.values(progress.nodes)) {
    lastStatuses.set(node.id, node.status);
  }

  host.replaceChildren(svg);
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
    `<span class="stat"><b>${done.length}</b>/${nodes.length} stones set</span>` +
    `<span class="stat">Foundation <b>${progress.foundationCompleted ? "laid" : "unlaid"}</b></span>` +
    (avg === null ? "" : `<span class="stat">Mastery <b>${avg}%</b></span>`);
}

/**
 * The pediment's graded attempt is the Capstone Gauntlet: its own mock-
 * interview sections plus two randomly sampled sections from every pillar,
 * shuffled into one timed exam. Practice on a completed pediment replays
 * just the capstone module normally.
 */
async function buildGauntlet(node: ModuleNode): Promise<QuizModule> {
  const capstone = await api.getQuiz(node.quizFile);
  const sections = [...capstone.sections];
  for (const p of PILLAR_ORDER) {
    const pillarQuiz = await api.getQuiz(progress.nodes[p.id].quizFile);
    const pool = [...pillarQuiz.sections];
    for (let k = 0; k < 2 && pool.length > 0; k++) {
      const i = Math.floor(Math.random() * pool.length);
      sections.push(pool.splice(i, 1)[0]);
    }
  }
  for (let i = sections.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sections[i], sections[j]] = [sections[j], sections[i]];
  }
  return {
    id: "gauntlet",
    title: "The Pediment — Capstone Gauntlet",
    passThreshold: capstone.passThreshold,
    sections,
  };
}

async function launchModule(
  node: ModuleNode,
  mode: ModuleMode = "graded"
): Promise<void> {
  const gauntlet = node.id === "pediment" && mode === "graded";
  const quiz = gauntlet ? await buildGauntlet(node) : await api.getQuiz(node.quizFile);
  openModule(
    node,
    quiz,
    api,
    (updated) => {
      progress = updated;
      renderTemple();
    },
    undefined,
    gauntlet ? "gauntlet" : mode
  );
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

/* ---------------- Toast & parallax ---------------- */

let toastTimer: number | undefined;

function showToast(message: string): void {
  const toast = document.getElementById("toast")!;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

/** Subtle pointer parallax on the atmosphere layer (rAF-throttled). */
function wireParallax(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const atmo = document.getElementById("atmosphere")!;
  let raf = 0;
  document.addEventListener("mousemove", (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const dx = (e.clientX / window.innerWidth - 0.5) * 10;
      const dy = (e.clientY / window.innerHeight - 0.5) * 6;
      atmo.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    });
  });
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

function wireReview(): void {
  document.getElementById("btn-review")!.addEventListener("click", async () => {
    const deck = await api.getReviewDeck(8);
    if (deck.length === 0) {
      alert(
        "No concepts to review yet. Answer some checks first — every question " +
          "you face starts tracking that concept for spaced review."
      );
      return;
    }
    openReviewDrill(deck, api, () => {
      // Drilling changes only review scheduling, not scores — but re-read
      // progress so nothing goes stale.
      void api.getProgress().then((p) => {
        progress = p;
        renderTemple();
      });
    });
  });
}

/* ---------------- Resume-in-progress attempts ---------------- */

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

/* ---------------- Boot ---------------- */

async function init(): Promise<void> {
  wireTitlebar();
  wireReset();
  wireReview();
  wireParallax();
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
