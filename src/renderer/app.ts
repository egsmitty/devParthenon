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
  LessonSection,
  ModuleNode,
  NodeStatus,
  ParthenonApi,
  ProgressData,
  QuizModule,
  QuizQuestion,
  ReviewDeckEntry,
} from "../types/schema.js";
import {
  configureHerculean,
  configureLessonLinks,
  configureMastery,
  configureOverview,
  escapeHtml,
  HERCULEAN_PASS,
  HERCULEAN_QUESTION_COUNT,
  MASTERY_QUESTION_COUNT,
  ModuleMode,
  openModule,
  openReviewDrill,
} from "./modal.js";
import { openOverview } from "./overview.js";
import { openHerculeanGate } from "./herculeanGate.js";
import {
  closeSettings,
  initSettings,
  isSettingsOpen,
  motionReduced,
  openSettings,
  settings,
} from "./settings.js";
import { initWelcome, openWelcome } from "./welcome.js";
import { closeChronicle, isChronicleOpen, openChronicle } from "./chronicle.js";
import { closeHelp, isHelpOpen, openHelp } from "./help.js";
import { isFlashcardsOpen, openFlashcards } from "./flashcards.js";
import { closeTrophyCase, isTrophyCaseOpen, openTrophyCase } from "./trophyCase.js";
import { STATUE_ATHENA, STATUE_MUSE } from "./statues.js";
import { playCue } from "./sound.js";

declare global {
  interface Window {
    parthenon: ParthenonApi;
  }
}

const api = window.parthenon;

const SVG_NS = "http://www.w3.org/2000/svg";

/** Short labels shown on the temple; full titles live in progress.json. */
const PILLAR_ORDER = [
  { id: "pillar-react", label: "React", tint: "#61dafb" },
  { id: "pillar-nextjs", label: "Next.js", tint: "#d8dde6" },
  { id: "pillar-node", label: "Node", tint: "#6cc24a" },
  { id: "pillar-databases", label: "Data", tint: "#c77dff" },
  { id: "pillar-tailwind", label: "CSS", tint: "#38bdf8" },
  { id: "pillar-git", label: "Git·CI", tint: "#f0552f" },
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

function radial(
  id: string,
  stops: Array<[number, string, number?]>
): SVGRadialGradientElement {
  const g = el("radialGradient", { id });
  for (const [offset, color, opacity] of stops) {
    const stop = el("stop", { offset, "stop-color": color });
    if (opacity !== undefined) stop.setAttribute("stop-opacity", String(opacity));
    g.appendChild(stop);
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
  const parchment = document.documentElement.dataset.theme === "parchment";
  // Sun-bleached limestone in daylight vs weathered granite at night.
  const stone: Array<[number, string]> = parchment
    ? [[0, "#f4e6c4"], [0.5, "#e8d4aa"], [1, "#d8c194"]]
    : [[0, "#2b313e"], [0.5, "#1d222d"], [1, "#141821"]];
  const stoneDark: Array<[number, string]> = parchment
    ? [[0, "#e6d1a6"], [1, "#d0b985"]]
    : [[0, "#1d212b"], [1, "#0d1017"]];
  const stoneWarm: Array<[number, string]> = parchment
    ? [[0, "#faeecc"], [0.55, "#f0e0b8"], [1, "#e2cd9c"]]
    : [[0, "#2e2a1c"], [0.55, "#211d13"], [1, "#17140c"]];
  defs.appendChild(gradient("grad-stone", stone));
  defs.appendChild(gradient("grad-stone-dark", stoneDark));
  defs.appendChild(gradient("grad-stone-warm", stoneWarm));
  defs.appendChild(gradient("grad-marble", [[0, "#ffffff"], [0.45, "#efece2"], [0.8, "#d9d3c3"], [1, "#c3bba6"]]));
  defs.appendChild(gradient("grad-gold", [[0, "#fde68a"], [0.4, "#f59e0b"], [0.7, "#b45309"], [1, "#fcd34d"]]));

  // Warm light-pool cast by each torch flame.
  defs.appendChild(
    radial("grad-torch-glow", [[0, "#ffd27a", 0.6], [0.5, "#f59e0b", 0.16], [1, "#f59e0b", 0]])
  );

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

/**
 * A stone whose lessons are passed (marble) but whose Mastery Test isn't yet —
 * the trophy is still to be earned. Clicking it launches the Mastery Test
 * rather than practice, and it wears a "prove it" cue. The pediment has no
 * Mastery Test (its graded attempt is the gauntlet), so it's never pending.
 */
function masteryPending(node: ModuleNode): boolean {
  return (
    node.status === "completed" &&
    node.category !== "pediment" &&
    !(progress.mastery?.[node.id]?.passed ?? false)
  );
}

/* ---------------- Node hover cartouche ---------------- */

function tooltipFor(node: ModuleNode): string {
  const pct = node.score === null ? null : Math.round(node.score * 100);
  switch (node.status) {
    case "locked": {
      const need = node.prerequisites
        .map((id) => progress.nodes[id]?.title ?? id)
        .join(" · ");
      return `Sealed — first complete ${need || "its prerequisites"}.`;
    }
    case "completed":
      return masteryPending(node)
        ? `Passed at ${pct}%. Click to take the Mastery Test and earn its trophy.`
        : `Mastered at ${pct}%. Click to practice (no stakes).`;
    case "in_progress":
      return `In progress${pct === null ? "" : ` — best ${pct}%`}. Click to continue.`;
    default:
      return "Ready. Click to begin.";
  }
}

function nodeTip(): HTMLElement {
  return document.getElementById("temple-tip")!;
}

function showNodeTipAt(node: ModuleNode, x: number, y: number): void {
  const tip = nodeTip();
  tip.innerHTML =
    `<strong>${escapeHtml(node.title)}</strong>` +
    `<span>${escapeHtml(tooltipFor(node))}</span>`;
  tip.hidden = false;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function showNodeTip(node: ModuleNode, e: MouseEvent): void {
  showNodeTipAt(node, e.clientX, e.clientY);
}
function moveNodeTip(e: MouseEvent): void {
  const tip = nodeTip();
  if (tip.hidden) return;
  tip.style.left = `${e.clientX}px`;
  tip.style.top = `${e.clientY}px`;
}
function hideNodeTip(): void {
  nodeTip().hidden = true;
}

/** Cartouche for non-progress markers (e.g. the Herculean node). */
function showRawTip(title: string, desc: string, x: number, y: number): void {
  const tip = nodeTip();
  tip.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc)}</span>`;
  tip.hidden = false;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function nodeGroup(node: ModuleNode): SVGGElement {
  const g = el("g");
  g.classList.add("node", node.status);
  g.setAttribute("data-node-id", node.id);
  // Accessible name via aria-label (no <title>, so no native tooltip competes
  // with the custom cartouche below).
  const tipText = tooltipFor(node);
  g.setAttribute("aria-label", `${node.title}. ${tipText}`);
  g.addEventListener("mouseenter", (e) => showNodeTip(node, e as MouseEvent));
  g.addEventListener("mousemove", (e) => moveNodeTip(e as MouseEvent));
  g.addEventListener("mouseleave", hideNodeTip);
  g.addEventListener("focus", () => {
    const r = (g as unknown as SVGGraphicsElement).getBoundingClientRect();
    showNodeTipAt(node, r.left + r.width / 2, r.top);
  });
  g.addEventListener("blur", hideNodeTip);
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
    // Passed-but-not-mastered stones launch their Mastery Test; fully mastered
    // stones re-open for stakes-free practice.
    const pending = masteryPending(node);
    g.style.cursor = "pointer";
    if (pending) g.classList.add("mastery-pending");
    activate(() => launchModule(node, pending ? "mastery" : "practice"));
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
  // Soft warm light-pool the flame throws onto the surrounding stone.
  g.appendChild(el("circle", { cx, cy: cy - 6, r: 40, fill: "url(#grad-torch-glow)", class: "torch-glow" }));
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

/** Gold completion seal with the score engraved; `pending` adds the "Mastery
 * Test awaits" crown cue for a passed-but-not-yet-mastered stone. */
function seal(cx: number, cy: number, score: number | null, pending = false): SVGGElement {
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
  if (pending) {
    // A pulsing gold ring + crown glyph: "the trophy is still to be won here."
    g.appendChild(el("circle", { cx, cy, r: 20, class: "mastery-halo", fill: "none" }));
    const crown = el("text", { x: cx, y: cy - 23, class: "mastery-crown" });
    crown.textContent = "♛"; // ♛ — the trophy to earn
    g.appendChild(crown);
  }
  return g;
}

/**
 * The Herculean gateway — a small arena-temple façade standing in the open
 * ground to the right of the temple once the final trial unlocks: a pediment
 * with a thunderbolt tympanum over a carved HERACLES frieze, two columns
 * flanking an arched mouth, crossed spears above the roof, red war banners,
 * column-mounted torches, and firelight spilling onto the steps. Clicking (or
 * Enter/Space) opens the full-page antechamber. Laurel-draped once conquered.
 */
function buildHerculeanGate(): SVGGElement {
  const passed = herculeanPassed();
  // Its own ground in the widened canvas, well clear of the temple.
  const cx = 1150;
  const baseY = 566;
  const g = el("g");
  g.classList.add("herc-gate");
  if (passed) g.classList.add("conquered");
  g.setAttribute("tabindex", "0");
  g.setAttribute("role", "button");
  const desc = passed
    ? "Conquered — the ultimate trophy is yours. Enter to face Hercules again."
    : "The final trial: face Hercules in a timed, 25-labor duel across the whole craft.";
  g.setAttribute("aria-label", `The Herculean Trial — an arena gateway. ${desc}`);

  // A mounted torch: bowl + big flame + warm light-pool.
  const torch = (px: number, py: number, s: number) => {
    g.appendChild(el("circle", { cx: px, cy: py - 6 * s, r: 20 * s, fill: "url(#grad-torch-glow)", class: "herc-gate-glow" }));
    g.appendChild(el("ellipse", { cx: px, cy: py + 4 * s, rx: 7 * s, ry: 3.4 * s, class: "herc-brazier-bowl" }));
    g.appendChild(el("path", {
      d: `M ${px} ${py - 20 * s} C ${px + 9 * s} ${py - 9 * s} ${px + 7 * s} ${py - 1 * s} ${px} ${py + 4 * s} C ${px - 7 * s} ${py - 1 * s} ${px - 9 * s} ${py - 9 * s} ${px} ${py - 20 * s} Z`,
      fill: "url(#grad-gold)", class: "flame",
    }));
  };

  // Firelight from the mouth + a glow pool washing the steps.
  g.appendChild(el("ellipse", { cx, cy: 490, rx: 44, ry: 96, fill: "url(#grad-torch-glow)", class: "herc-gate-glow" }));
  g.appendChild(el("ellipse", { cx, cy: baseY + 14, rx: 78, ry: 18, class: "herc-ground-glow" }));

  // Crossed spears rising behind the pediment.
  g.appendChild(el("line", { x1: cx - 52, y1: 338, x2: cx + 46, y2: 288, class: "herc-spear" }));
  g.appendChild(el("line", { x1: cx + 52, y1: 338, x2: cx - 46, y2: 288, class: "herc-spear" }));
  g.appendChild(el("path", { d: `M ${cx + 46} 288 l 11 -6 l -4 13 z`, class: "herc-spear-tip" }));
  g.appendChild(el("path", { d: `M ${cx - 46} 288 l -11 -6 l 4 13 z`, class: "herc-spear-tip" }));

  // Wall panel between the columns, holding the arched mouth.
  g.appendChild(el("rect", { x: cx - 46, y: 396, width: 92, height: baseY - 396, class: "herc-stone" }));
  g.appendChild(el("path", {
    d: `M ${cx - 30} ${baseY} L ${cx - 30} 470 A 30 30 0 0 1 ${cx + 30} 470 L ${cx + 30} ${baseY} Z`,
    class: "herc-doorway",
  }));
  // Voussoir ring around the mouth + masonry joints on the wall.
  const vou: string[] = [];
  for (const a of [-66, -40, -14, 14, 40, 66]) {
    const rad = (a * Math.PI) / 180;
    vou.push(
      `M ${(cx + 30 * Math.sin(rad)).toFixed(1)} ${(470 - 30 * Math.cos(rad)).toFixed(1)} L ${(cx + 40 * Math.sin(rad)).toFixed(1)} ${(470 - 40 * Math.cos(rad)).toFixed(1)}`
    );
  }
  for (const jy of [420, 500, 532]) vou.push(`M ${cx - 46} ${jy} h 14 M ${cx + 32} ${jy} h 14`);
  g.appendChild(el("path", { d: vou.join(" "), class: "herc-voussoir", fill: "none" }));

  // Flanking Doric columns: capital, fluted shaft, base ring.
  for (const px of [cx - 58, cx + 58]) {
    g.appendChild(el("rect", { x: px - 12, y: 388, width: 24, height: 8, class: "herc-stone" }));
    g.appendChild(el("path", { d: `M ${px - 9} 396 Q ${px - 6} 402 ${px - 7} 404 L ${px + 7} 404 Q ${px + 6} 402 ${px + 9} 396 Z`, class: "herc-stone" }));
    g.appendChild(el("path", { d: `M ${px - 8} 404 L ${px + 8} 404 L ${px + 6.5} 552 L ${px - 6.5} 552 Z`, class: "herc-stone" }));
    g.appendChild(el("line", { x1: px - 2.5, y1: 408, x2: px - 2.2, y2: 548, class: "herc-voussoir" }));
    g.appendChild(el("line", { x1: px + 2.5, y1: 408, x2: px + 2.2, y2: 548, class: "herc-voussoir" }));
    g.appendChild(el("rect", { x: px - 11, y: 552, width: 22, height: 8, rx: 3, class: "herc-stone" }));
  }

  // Entablature: architrave + the carved HERACLES frieze.
  g.appendChild(el("rect", { x: cx - 76, y: 372, width: 152, height: 10, class: "herc-stone" }));
  g.appendChild(el("rect", { x: cx - 72, y: 350, width: 144, height: 22, class: "herc-sign" }));
  const sign = el("text", { x: cx, y: 366, class: "herc-sign-text" });
  sign.textContent = "HERACLES";
  g.appendChild(sign);

  // Pediment: raking cornice + a gold thunderbolt in the tympanum + acroteria.
  g.appendChild(el("polygon", { points: `${cx - 82},350 ${cx + 82},350 ${cx},306`, class: "herc-stone herc-pediment" }));
  g.appendChild(el("polygon", { points: `${cx - 68},346 ${cx + 68},346 ${cx},310`, fill: "none", class: "herc-ped-line" }));
  g.appendChild(el("path", {
    d: `M ${cx - 4} 316 L ${cx + 5} 328 L ${cx - 1} 327 L ${cx + 6} 342 L ${cx - 6} 331 L ${cx - 1} 332 Z`,
    class: "herc-bolt-tym",
  }));
  g.appendChild(el("path", { d: `M ${cx} 306 l -6 -10 h 12 z`, class: "herc-acro" }));
  g.appendChild(el("path", { d: `M ${cx - 82} 350 l -8 -11 h 13 z`, class: "herc-acro" }));
  g.appendChild(el("path", { d: `M ${cx + 82} 350 l 8 -11 h -13 z`, class: "herc-acro" }));

  // Red war banners hanging from the entablature ends.
  for (const bx of [cx - 66, cx + 66]) {
    g.appendChild(el("path", {
      d: `M ${bx - 9} 382 h 18 L ${bx + 9} 436 L ${bx} 424 L ${bx - 9} 436 Z`,
      class: "herc-banner",
    }));
    g.appendChild(el("line", { x1: bx - 9, y1: 386, x2: bx + 9, y2: 386, class: "herc-banner-trim" }));
    g.appendChild(el("path", { d: `M ${bx - 1.6} 398 l 4.5 6.5 l -3.6 -0.6 l 4 8 l -6 -6 l 3 0.4 z`, class: "herc-banner-bolt" }));
  }

  // Torches on the columns; shields hung beneath them.
  torch(cx - 58, 436, 1.35);
  torch(cx + 58, 436, 1.35);
  for (const px of [cx - 58, cx + 58]) {
    g.appendChild(el("circle", { cx: px, cy: 502, r: 8, class: "herc-shield" }));
    g.appendChild(el("circle", { cx: px, cy: 502, r: 3, class: "herc-shield-boss" }));
  }
  // Ground braziers flanking the steps.
  torch(cx - 92, 560, 0.95);
  torch(cx + 92, 560, 0.95);

  // Three stepped slabs grounding the whole façade.
  g.appendChild(el("rect", { x: cx - 78, y: baseY, width: 156, height: 9, class: "herc-stone" }));
  g.appendChild(el("rect", { x: cx - 88, y: baseY + 9, width: 176, height: 10, class: "herc-stone" }));
  g.appendChild(el("rect", { x: cx - 98, y: baseY + 19, width: 196, height: 11, class: "herc-stone" }));

  if (passed) {
    g.appendChild(el("path", { d: `M ${cx - 76} 344 C ${cx - 60} 322 ${cx - 34} 310 ${cx - 6} 308`, class: "herc-laurel", fill: "none" }));
    g.appendChild(el("path", { d: `M ${cx + 76} 344 C ${cx + 60} 322 ${cx + 34} 310 ${cx + 6} 308`, class: "herc-laurel", fill: "none" }));
  }
  const label = el("text", { x: cx, y: 614, class: "node-label herc-label" });
  label.textContent = passed ? "· CONQUERED ·" : "THE TRIAL AWAITS";
  g.appendChild(label);

  g.addEventListener("mouseenter", (e) => {
    const me = e as MouseEvent;
    showRawTip("The Herculean Trial", desc, me.clientX, me.clientY);
  });
  g.addEventListener("mousemove", (e) => moveNodeTip(e as MouseEvent));
  g.addEventListener("mouseleave", hideNodeTip);
  g.addEventListener("focus", () => {
    const r = (g as unknown as SVGGraphicsElement).getBoundingClientRect();
    showRawTip("The Herculean Trial", desc, r.left + r.width / 2, r.top);
  });
  g.addEventListener("blur", hideNodeTip);
  const go = () => openHerculeanGate(herculeanPassed(), () => void launchHerculean());
  g.addEventListener("click", go);
  g.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  });
  return g;
}

/* ---------------- Temple construction ---------------- */

/**
 * The landscape the temple stands in — a full-bleed scene behind the whole
 * stage (sky, sun/moon, distant hills). Rendered into #temple-scene as two
 * layers: a stretch-to-fill sky+hills SVG (aspect-free via
 * preserveAspectRatio="none", so it always covers the stage with no
 * letterboxing) and a fixed-aspect orb pinned upper-right so the sun/moon
 * stays round at any window shape. Theme-aware (day/night).
 */
function buildScene(): DocumentFragment {
  const parchment = document.documentElement.dataset.theme === "parchment";
  const frag = document.createDocumentFragment();

  // Sky + hills stretch freely to fill the stage (no letterbox, no crop).
  const sky = el("svg", {
    class: "scene-sky",
    viewBox: "0 0 1000 1000",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });
  const defs = el("defs");
  defs.appendChild(
    gradient(
      "scene-sky-grad",
      parchment
        ? [[0, "#7fb6e4"], [0.42, "#addaef"], [0.72, "#f0e0bf"], [1, "#f6e7c6"]]
        : [[0, "#070b16"], [0.5, "#101a2d"], [0.78, "#1b2742"], [1, "#243152"]]
    )
  );
  defs.appendChild(
    gradient("scene-hill-far", parchment ? [[0, "#cdd3a2"], [1, "#bcc48c"]] : [[0, "#152039"], [1, "#0d1626"]])
  );
  defs.appendChild(
    gradient("scene-hill-near", parchment ? [[0, "#b7bd80"], [1, "#9ba766"]] : [[0, "#0e1728"], [1, "#080f1c"]])
  );
  sky.appendChild(defs);
  sky.appendChild(el("rect", { x: 0, y: 0, width: 1000, height: 1000, fill: "url(#scene-sky-grad)" }));
  // A scatter of faint stars across the night sky's upper band.
  if (!parchment) {
    for (const [sx, sy, sr] of [
      [120, 120, 1.6], [230, 200, 1.1], [360, 90, 1.4], [640, 150, 1.2],
      [880, 340, 1.5], [180, 300, 1], [500, 80, 1.3], [720, 250, 1.2], [430, 260, 1.0],
    ] as const) {
      sky.appendChild(el("circle", { cx: sx, cy: sy, r: sr, fill: "#cdd6ec", class: "sky-star" }));
    }
  }
  // Distant hills rolling behind the temple; the near band is the ground.
  sky.appendChild(el("path", {
    d: "M0 720 Q 240 640 500 700 Q 760 758 1000 690 V 1000 H 0 Z",
    fill: "url(#scene-hill-far)", opacity: 0.9,
  }));
  sky.appendChild(el("path", {
    d: "M0 824 Q 320 748 640 806 Q 852 840 1000 802 V 1000 H 0 Z",
    fill: "url(#scene-hill-near)",
  }));
  frag.appendChild(sky);

  // The sun (day) / moon (night): fixed-aspect, pinned upper-right so it never
  // squashes into an ellipse when the stage is wide.
  const orb = el("svg", { class: "scene-orb", viewBox: "0 0 200 200", "aria-hidden": "true" });
  const odefs = el("defs");
  odefs.appendChild(
    radial(
      "scene-orb-halo",
      parchment
        ? [[0, "#fff7d8"], [0.32, "#ffd275"], [1, "#ffd275", 0]]
        : [[0, "#eef2fb"], [0.5, "#c9d3e6"], [1, "#c9d3e6", 0]]
    )
  );
  orb.appendChild(odefs);
  orb.appendChild(el("circle", { cx: 100, cy: 100, r: 100, fill: "url(#scene-orb-halo)", class: "sky-orb" }));
  orb.appendChild(el("circle", {
    cx: 100, cy: 100, r: 42,
    fill: parchment ? "#fff2c8" : "#dfe6f2",
    class: "sky-orb-core",
  }));
  frag.appendChild(orb);

  return frag;
}

/** Paint the full-bleed scene layer behind the stage (rebuilt on theme change). */
function renderScene(): void {
  const host = document.getElementById("temple-scene");
  if (host) host.replaceChildren(buildScene());
}

function buildTemple(data: ProgressData): SVGSVGElement {
  // Extra canvas on the right gives the Herculean gateway its own ground,
  // clear of the temple (which stays in its original 0–1000 coordinates).
  const svg = el("svg", { viewBox: "0 0 1260 720" });
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
  const pLabel = el("text", { x: 500, y: 128, class: "node-label pediment-label" });
  pLabel.textContent = "Capstone · Mock Interviews";
  pg.appendChild(pLabel);
  if (pediment.status === "locked") pg.appendChild(ironwork(500, 88, 120));
  else if (pediment.status === "completed") pg.appendChild(seal(500, 95, pediment.score));
  svg.appendChild(pg);

  // Torch sconces flanking the temple front.
  svg.appendChild(torch(116, 160));
  svg.appendChild(torch(884, 160));

  /* --- Entablature: architrave + triglyph frieze. Static masonry that lights
     to marble once the temple is crowned (the pediment is set). --- */
  const crownLit = pediment.status === "completed";
  const ent = el("g");
  ent.classList.add("entablature");
  if (crownLit) ent.classList.add("lit");
  ent.appendChild(el("rect", {
    x: 136, y: 172, width: 728, height: 12, class: "frieze-band",
    fill: "url(#grad-stone)", stroke: "#39404f", "stroke-width": 1.2,
  }));
  ent.appendChild(el("rect", {
    x: 136, y: 184, width: 728, height: 18, class: "frieze-band",
    fill: "url(#grad-stone-dark)", stroke: "#39404f", "stroke-width": 1.2,
  }));
  // Triglyphs: paired grooved blocks along the frieze.
  for (let tx = 156; tx <= 830; tx += 52) {
    const block = el("g");
    block.appendChild(el("rect", {
      x: tx, y: 185.5, width: 15, height: 15, class: "triglyph",
      fill: "url(#grad-stone)", stroke: "#2c3140", "stroke-width": 1,
    }));
    block.appendChild(el("line", { x1: tx + 5, y1: 187, x2: tx + 5, y2: 199, class: "triglyph-groove", stroke: "#12151d", "stroke-width": 1.6 }));
    block.appendChild(el("line", { x1: tx + 10, y1: 187, x2: tx + 10, y2: 199, class: "triglyph-groove", stroke: "#12151d", "stroke-width": 1.6 }));
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
    // Per-pillar topic tint, read by the CSS hover glow (CSSOM — the self-only
    // CSP forbids inline style attributes).
    g.style.setProperty("--pillar-tint", p.tint);

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

    // A topic gemstone set in the shaft — a quiet per-pillar identity.
    // Glow set via CSSOM (inline style attributes violate the self-only CSP).
    const gem = el("circle", { cx, cy: 274, r: 5.5, fill: p.tint, class: "pillar-gem" });
    gem.style.filter = `drop-shadow(0 0 5px ${p.tint})`;
    g.appendChild(gem);

    if (node.status === "locked") g.appendChild(ironwork(cx, 368, colW - 4));
    else if (node.status === "completed") g.appendChild(seal(cx, 380, node.score, masteryPending(node)));
    svg.appendChild(g);
  });

  /* --- Foundation: stylobate + weathered steps --- */
  const foundation = data.nodes["foundation"];
  const fg = nodeGroup(foundation);
  // Steps carry the stone/marble fill but opt OUT of the traveling rune dashes.
  fg.appendChild(el("rect", { x: 150, y: 534, width: 700, height: 40, class: "shape foundation-step" }));
  fg.appendChild(el("rect", { x: 113, y: 574, width: 774, height: 40, class: "shape foundation-step" }));
  fg.appendChild(el("rect", { x: 76, y: 614, width: 848, height: 42, class: "shape foundation-step" }));
  // A single glow traces the outer stepped silhouette — around the outside,
  // never horizontally across the individual steps.
  fg.appendChild(el("path", {
    d: "M 150 534 H 850 V 574 H 887 V 614 H 924 V 656 H 76 V 614 H 113 V 574 H 150 Z",
    class: "rune-outline",
  }));
  // Masonry joints on the steps.
  for (const [sy, sx, sw, seg] of [[554, 150, 700, 7], [594, 113, 774, 8], [634, 76, 848, 9]] as const) {
    for (let j = 1; j < seg; j++) {
      const jx = sx + (sw / seg) * j;
      fg.appendChild(el("line", { x1: jx, y1: sy - 16, x2: jx, y2: sy + 16, class: "flute" }));
    }
  }
  fg.appendChild(el("line", { x1: 150, y1: 538, x2: 850, y2: 538, class: "accent-line" }));
  fg.appendChild(el("line", { x1: 76, y1: 618, x2: 924, y2: 618, class: "accent-line" }));
  const fLabel = el("text", { x: 500, y: 600, class: "node-label foundation-label" });
  fLabel.textContent = "Web Foundations — HTTP · DNS · Client/Server · DOM";
  fg.appendChild(fLabel);
  if (foundation.status === "locked") fg.appendChild(ironwork(500, 640, 160));
  else if (foundation.status === "completed") fg.appendChild(seal(500, 638, foundation.score, masteryPending(foundation)));
  svg.appendChild(fg);

  // The Herculean trial: a parallel gateway beside the temple once every stone
  // stands. Drawn last so it sits above the steps; never gates the roof.
  if (herculeanUnlocked()) svg.appendChild(buildHerculeanGate());

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
  renderScene();
  const host = document.getElementById("temple-svg-host")!;
  const svg = buildTemple(progress);

  if (!firstRender) {
    for (const node of Object.values(progress.nodes)) {
      const prev = lastStatuses.get(node.id);
      // Stone set: this node just turned to marble.
      if (prev && prev !== "completed" && node.status === "completed") {
        svg.querySelector(`[data-node-id="${node.id}"]`)?.classList.add("just-completed");
        playCue("seal");
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
  renderGuide();
}

/** A clear "what next" call to action in the header. */
function renderGuide(): void {
  const host = document.getElementById("temple-next")!;
  const order = ["foundation", ...PILLAR_ORDER.map((p) => p.id), "pediment"];
  const nodes = order.map((id) => progress.nodes[id]).filter(Boolean);
  // Priority: finish a started module, then clear a due Mastery Test (which
  // unlocks the next stone under the gate), then begin the next open module.
  const inProgress = nodes.find((n) => n.status === "in_progress");
  const pending = nodes.find((n) => masteryPending(n));
  const next = inProgress ?? pending ?? nodes.find((n) => n.status === "unlocked");
  if (!next) {
    // Everything mastered — celebrate rather than nag.
    host.innerHTML = `<span class="guide-done">The temple stands complete. Practice any stone to keep it sharp.</span>`;
    return;
  }
  const asMastery = next === pending && next !== inProgress;
  const verb = asMastery ? "Prove" : next.status === "in_progress" ? "Continue" : "Begin";
  const suffix = asMastery ? " (Mastery Test)" : "";
  host.innerHTML = `<button id="guide-btn" class="guide-btn">${verb}: ${escapeHtml(next.title)}${suffix} &rarr;</button>`;
  host
    .querySelector("#guide-btn")!
    .addEventListener("click", () => launchModule(next, asMastery ? "mastery" : "graded"));
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
  const cell = (label: string, value: string) =>
    `<div class="stat"><span class="stat-label">${label}</span>` +
    `<span class="stat-value">${value}</span></div>`;
  stats.innerHTML =
    cell("Stones Set", `${done.length} / ${nodes.length}`) +
    cell("Foundation", progress.foundationCompleted ? "Laid" : "Unlaid") +
    (avg === null ? "" : cell("Mastery", `${avg}%`));
}

/**
 * The pediment's graded attempt is the Capstone Gauntlet: its own mock-
 * interview sections plus two randomly sampled sections from every pillar,
 * shuffled into one timed exam. Practice on a completed pediment replays
 * just the capstone module normally.
 */
/** How many capstone sections the gauntlet samples, so it stays ~17 questions
 *  (5 capstone + 6×2 pillar) even as the capstone bank grows past 5. */
const GAUNTLET_CAPSTONE_SAMPLE = 5;

async function buildGauntlet(node: ModuleNode): Promise<QuizModule> {
  const capstone = await api.getQuiz(node.quizFile);
  // Sample a fixed slice of capstone sections rather than all of them.
  const sections = shuffle([...capstone.sections]).slice(0, GAUNTLET_CAPSTONE_SAMPLE);
  for (const p of PILLAR_ORDER) {
    const pillarQuiz = await api.getQuiz(progress.nodes[p.id].quizFile);
    const pool = [...pillarQuiz.sections];
    for (let k = 0; k < 2 && pool.length > 0; k++) {
      const i = Math.floor(Math.random() * pool.length);
      sections.push(pool.splice(i, 1)[0]);
    }
  }
  shuffle(sections);
  return {
    id: "gauntlet",
    title: "The Pediment — Capstone Gauntlet",
    passThreshold: capstone.passThreshold,
    sections,
  };
}

/**
 * A module's Mastery Test: MASTERY_QUESTION_COUNT questions drawn at random
 * from the module's whole variant bank (across all its sections), each shown
 * as a bare exam question. A bigger bank = more variety per draw.
 */
async function buildMasteryQuiz(node: ModuleNode): Promise<QuizModule> {
  const module = await api.getQuiz(node.quizFile);
  const bank: QuizQuestion[] = [];
  for (const s of module.sections) {
    const pool = s.variants ?? [s.question, s.altQuestion].filter(Boolean) as QuizQuestion[];
    bank.push(...pool);
  }
  for (let i = bank.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bank[i], bank[j]] = [bank[j], bank[i]];
  }
  const chosen = bank.slice(0, Math.min(MASTERY_QUESTION_COUNT, bank.length));
  const sections: LessonSection[] = chosen.map((q, i) => ({
    heading: `Mastery ${i + 1}`,
    paragraphs: [],
    variants: [q],
  }));
  return { id: `${module.id}-mastery`, title: module.title, passThreshold: 0.8, sections };
}

/* ---------------- The Herculean final ---------------- */

/** A synthetic node for the parallel Herculean trial (not in progress.nodes). */
const HERCULEAN_NODE: ModuleNode = {
  id: "herculean",
  category: "pediment",
  title: "The Herculean Trial",
  description: "The final trial — 25 questions across the whole craft.",
  status: "unlocked",
  score: null,
  prerequisites: [],
  quizFile: "herculean.json",
};

/** Fisher–Yates shuffle in place. */
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The Herculean unlocks (mirrors store.herculeanUnlocked, which is Electron-
 * bound and can't be imported here) once the foundation and every pillar is
 * built — it sits parallel to the pediment, never gating the roof.
 */
function herculeanUnlocked(): boolean {
  return Object.values(progress.nodes)
    .filter((n) => n.id !== "pediment")
    .every((n) => n.status === "completed");
}

function herculeanPassed(): boolean {
  return progress.herculean?.passed ?? (progress.trophies ?? []).includes("herculean");
}

/**
 * Assemble the Herculean exam: ~half new cross-topic questions (herculean.json)
 * and ~half previously-seen canonical questions drawn from every module bank,
 * shuffled into HERCULEAN_QUESTION_COUNT single-question sections. Each carries
 * its origin key ("nodeId/sectionIndex", or null for the new bank) so a miss
 * can seed the side-quest.
 */
async function buildHerculeanExam(): Promise<{ quiz: QuizModule; origins: (string | null)[] }> {
  const bank = await api.getQuiz("herculean.json");
  const fresh: { q: QuizQuestion; origin: string | null }[] = [];
  for (const s of bank.sections) for (const q of s.variants ?? []) fresh.push({ q, origin: null });

  const seen: { q: QuizQuestion; origin: string | null }[] = [];
  const ids = ["foundation", ...PILLAR_ORDER.map((p) => p.id), "pediment"];
  for (const id of ids) {
    const node = progress.nodes[id];
    if (!node) continue;
    const quiz = await api.getQuiz(node.quizFile);
    quiz.sections.forEach((s, i) => {
      const v = (s.variants ?? ([s.question, s.altQuestion].filter(Boolean) as QuizQuestion[]))[0];
      if (v) seen.push({ q: v, origin: `${id}/${i}` });
    });
  }

  shuffle(fresh);
  shuffle(seen);
  const freshCount = Math.min(Math.floor(HERCULEAN_QUESTION_COUNT / 2), fresh.length);
  const picked = [
    ...fresh.slice(0, freshCount),
    ...seen.slice(0, HERCULEAN_QUESTION_COUNT - freshCount),
  ];
  shuffle(picked);
  const chosen = picked.slice(0, HERCULEAN_QUESTION_COUNT);

  const sections: LessonSection[] = chosen.map((c, i) => ({
    heading: `Trial ${i + 1}`,
    paragraphs: [],
    variants: [c.q],
  }));
  return {
    quiz: {
      id: "herculean-exam",
      title: "The Herculean Trial",
      passThreshold: HERCULEAN_PASS,
      sections,
    },
    origins: chosen.map((c) => c.origin),
  };
}

async function launchHerculean(): Promise<void> {
  const { quiz, origins } = await buildHerculeanExam();
  openModule(
    HERCULEAN_NODE,
    quiz,
    api,
    (updated) => {
      progress = updated;
      renderTemple();
    },
    undefined,
    "herculean",
    () => void launchHerculean(),
    origins
  );
}

/** Resolve weak-area keys ("nodeId/sectionIndex") to a review deck. */
async function deckFromKeys(keys: string[]): Promise<ReviewDeckEntry[]> {
  const out: ReviewDeckEntry[] = [];
  const cache = new Map<string, QuizModule>();
  for (const key of keys) {
    const slash = key.lastIndexOf("/");
    const nodeId = key.slice(0, slash);
    const sectionIndex = Number(key.slice(slash + 1));
    const node = progress.nodes[nodeId];
    if (!node || Number.isNaN(sectionIndex)) continue;
    let quiz = cache.get(node.quizFile);
    if (!quiz) {
      quiz = await api.getQuiz(node.quizFile);
      cache.set(node.quizFile, quiz);
    }
    const section = quiz.sections[sectionIndex];
    if (!section) continue;
    out.push({
      key,
      nodeId,
      sectionIndex,
      nodeTitle: node.title,
      heading: section.heading,
      quizFile: node.quizFile,
      due: true,
      missed: 1,
      seen: 1,
    });
  }
  return out;
}

/** The failed-Herculean side-quest: drill the exact concepts missed. */
async function openHerculeanSideQuest(keys: string[]): Promise<void> {
  const refresh = () =>
    void api.getProgress().then((p) => {
      progress = p;
      renderTemple();
    });
  const deck = await deckFromKeys(keys);
  if (deck.length === 0) {
    refresh();
    return;
  }
  openReviewDrill(deck, api, refresh);
}

async function launchModule(
  node: ModuleNode,
  mode: ModuleMode = "graded"
): Promise<void> {
  const onDone = (updated: ProgressData) => {
    progress = updated;
    renderTemple();
  };
  if (mode === "mastery") {
    const quiz = await buildMasteryQuiz(node);
    // The retry callback redraws a fresh set for unlimited attempts.
    openModule(node, quiz, api, onDone, undefined, "mastery", () =>
      void launchModule(node, "mastery")
    );
    return;
  }
  const gauntlet = node.id === "pediment" && mode === "graded";
  const quiz = gauntlet ? await buildGauntlet(node) : await api.getQuiz(node.quizFile);
  openModule(node, quiz, api, onDone, undefined, gauntlet ? "gauntlet" : mode);
}

/* ---------------- Codex of Jargon (slide-out lexicon) ---------------- */

// The spine holds exactly two goddesses stacked, fixed in place (the pages
// scroll beside them, the spine does not). Statue art lives in statues.ts.
const GALLERY = [
  { art: STATUE_ATHENA, name: "Athena", epithet: "Wisdom & Craft" },
  { art: STATUE_MUSE, name: "Mnemosyne", epithet: "Memory" },
];

function renderStatues(): void {
  const spine = document.getElementById("codex-statues")!;
  spine.innerHTML =
    `<div class="spine-rule"></div>` +
    GALLERY.map(
      (s) => `
    <figure class="statue-niche">
      <div class="niche">${s.art}</div>
      <figcaption><span class="niche-name">${s.name}</span><span class="niche-epithet">${s.epithet}</span></figcaption>
    </figure>`
    ).join("") +
    `<div class="spine-rule"></div>`;
}

function renderCodex(filter: string): void {
  const left = document.getElementById("codex-left")!;
  const right = document.getElementById("codex-right")!;
  const q = filter.trim().toLowerCase();
  const matches = glossary.filter(
    (e) =>
      !q ||
      e.term.toLowerCase().includes(q) ||
      e.definition.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q))
  );

  const cardFor = (e: GlossaryEntry) => {
    const seals = e.tags
      .map((t) => `<span class="term-seal">${escapeHtml(t)}</span>`)
      .join("");
    return (
      `<article class="codex-entry">` +
      `<h3 class="term">${escapeHtml(e.term)}</h3>` +
      `<p class="definition">${escapeHtml(e.definition)}</p>` +
      (seals ? `<div class="term-seals">${seals}</div>` : "") +
      `<div class="entry-flourish" aria-hidden="true">&#10087;</div>` +
      `</article>`
    );
  };

  if (matches.length === 0) {
    left.innerHTML = `<div class="codex-empty">No entry in the lexicon matches &ldquo;${escapeHtml(filter)}&rdquo;.</div>`;
    right.innerHTML = "";
    return;
  }
  // A single hit — e.g. jumping to a term like "DNS" from a lesson chip —
  // lands on the RIGHT page: that's the leaf the book-opening flip turns to,
  // so the animation reveals the entry instead of it sitting behind on the left.
  if (matches.length === 1) {
    left.innerHTML = "";
    right.innerHTML = cardFor(matches[0]);
    return;
  }
  // Fill the left page first, then the right — like reading a real spread.
  const half = Math.ceil(matches.length / 2);
  left.innerHTML = matches.slice(0, half).map(cardFor).join("");
  right.innerHTML = matches.slice(half).map(cardFor).join("");
}

function openCodex(): void {
  const codex = document.getElementById("codex")!;
  const tab = document.getElementById("codex-tab")!;
  codex.hidden = false;
  tab.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => codex.classList.add("open"));
  playCue("open");
  playBookFlip();
  (document.getElementById("codex-search") as HTMLInputElement).focus();
}

/** The book-opening page-flip flourish (skipped when motion is reduced).
 * The layer lives on the page spread so the leaves hinge on the actual
 * binding — matching its height and vertical position, not the whole book.
 * While the blank leaves turn, the real pages hold blank (the `flipping`
 * class); the written entries fade in as the last leaf settles. */
let flipTimer: number | undefined;

function playBookFlip(): void {
  if (motionReduced()) return;
  const book = document.querySelector(".codex-book");
  const spread = book?.querySelector(".book-spread");
  if (!book || !spread) return;
  spread.querySelector(".flip-layer")?.remove();
  const layer = document.createElement("div");
  layer.className = "flip-layer";
  layer.setAttribute("aria-hidden", "true");
  // The full rite: the tooled leather cover swings open first, then the blank
  // leaves turn, then the written entries appear (the `flipping` reveal).
  layer.innerHTML =
    '<div class="book-cover"><span class="cover-rule"></span><span class="cover-title">Codex of Jargon</span><span class="cover-rule"></span></div>' +
    '<div class="flip-page"></div><div class="flip-page"></div><div class="flip-page"></div>';
  spread.appendChild(layer);
  book.classList.add("flipping");
  // Cover lifts open (~0.9s), then the leaves turn (last ≈ 1.35 + 1.0 ≈ 2.35s)
  // over the parchment spread; reveal the entries as the last leaf lands.
  // (Shared timer so a quick re-open can't reveal early.)
  window.clearTimeout(flipTimer);
  flipTimer = window.setTimeout(() => {
    layer.remove();
    book.classList.remove("flipping");
  }, 2400);
}

/** Open the Codex focused on a specific term (from a lesson chip). */
function openCodexWithTerm(term: string): void {
  openCodex();
  const search = document.getElementById("codex-search") as HTMLInputElement;
  search.value = term;
  renderCodex(term);
}

function closeCodex(): void {
  const codex = document.getElementById("codex")!;
  const tab = document.getElementById("codex-tab")!;
  codex.classList.remove("open");
  tab.setAttribute("aria-expanded", "false");
  // Wait out the book-close swing before hiding.
  window.setTimeout(() => (codex.hidden = true), 560);
  tab.focus();
}

function wireCodex(): void {
  renderStatues();
  renderCodex("");
  document.getElementById("codex-tab")!.addEventListener("click", openCodex);
  document.querySelectorAll('#codex [data-action="close"]').forEach((el) =>
    el.addEventListener("click", closeCodex)
  );
  const search = document.getElementById("codex-search") as HTMLInputElement;
  search.addEventListener("input", () => renderCodex(search.value));
  // Flashcards drill launches over the open book; closing it returns here.
  document
    .getElementById("codex-flashcards")!
    .addEventListener("click", () => openFlashcards(glossary));
  document.addEventListener("keydown", (e) => {
    const codex = document.getElementById("codex")!;
    // Codex Esc only when it's the topmost overlay (the modal and the
    // flashcards drill both sit above it and claim Esc first).
    if (e.key === "Escape" && !codex.hidden && root_modal_hidden() && !isFlashcardsOpen() && !isTrophyCaseOpen()) {
      e.preventDefault();
      closeCodex();
    }
  });
}

function root_modal_hidden(): boolean {
  return document.getElementById("modal-root")?.hasAttribute("hidden") ?? true;
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
  if (motionReduced()) return;
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

function wireSettings(): void {
  document.getElementById("btn-settings")!.addEventListener("click", () =>
    openSettings(() => renderTemple())
  );
  const root = document.getElementById("settings-root")!;
  // Click the backdrop (outside the card) to close.
  root.addEventListener("click", (e) => {
    if (e.target === root) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isSettingsOpen()) {
      e.preventDefault();
      closeSettings();
    }
  });
}

function wireTrophyCase(): void {
  document
    .getElementById("btn-trophies")!
    .addEventListener("click", () => openTrophyCase(progress));
  const root = document.getElementById("trophy-case-root")!;
  root.addEventListener("click", (e) => {
    if (e.target === root) closeTrophyCase();
  });
}

function anyOverlayOpen(): boolean {
  return ["modal-root", "settings-root", "welcome-root", "chronicle-root", "help-root", "flashcards-root", "trophy-case-root", "overview-root", "herculean-gate-root", "codex"].some(
    (id) => {
      const el = document.getElementById(id);
      return el && !el.hasAttribute("hidden");
    }
  );
}

function wireHelp(): void {
  document.getElementById("btn-help")!.addEventListener("click", openHelp);
  const root = document.getElementById("help-root")!;
  root.addEventListener("click", (e) => {
    if (e.target === root) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (isHelpOpen() && e.key === "Escape") {
      e.preventDefault();
      closeHelp();
      return;
    }
    // "?" opens help when nothing else is focused/open.
    const typing =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement;
    if (e.key === "?" && !typing && !anyOverlayOpen()) {
      e.preventDefault();
      openHelp();
    }
  });
}

function wireChronicle(): void {
  document.getElementById("btn-chronicle")!.addEventListener("click", () =>
    openChronicle(progress, api, (updated) => {
      progress = updated;
      renderTemple();
    })
  );
  const root = document.getElementById("chronicle-root")!;
  root.addEventListener("click", (e) => {
    if (e.target === root) closeChronicle();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isChronicleOpen()) {
      e.preventDefault();
      closeChronicle();
    }
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
  await initSettings(api);
  initWelcome(api);
  wireTitlebar();
  wireReset();
  wireReview();
  wireSettings();
  wireChronicle();
  wireHelp();
  wireTrophyCase();
  wireParallax();
  [progress, glossary] = await Promise.all([api.getProgress(), api.getGlossary()]);
  renderTemple();
  wireCodex();
  configureLessonLinks(glossary.map((g) => g.term), openCodexWithTerm);
  configureMastery((node) => void launchModule(node, "mastery"));
  configureOverview((quiz) => openOverview(quiz, glossary));
  configureHerculean((keys) => void openHerculeanSideQuest(keys));
  if (!api.isSmoke) {
    // The welcome rite plays on every launch; a mid-module resume (if any) is
    // offered once the learner enters the temple.
    openWelcome(() => void offerResume());
  }
}

init().catch((err) => {
  console.error("Failed to initialise Dev Parthenon:", err);
});
