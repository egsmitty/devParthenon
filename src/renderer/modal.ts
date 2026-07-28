/**
 * Quiz overlay, module reader & redemption engine.
 *
 * Anti-overwhelm laws: each section shows at most 3 short paragraphs, then
 * requires an interactive check. Wrong answers always explain *why* they are
 * wrong plus an interview tip.
 *
 * Scoring & the fail-safe:
 *   - Pass threshold is per-module (0.85).
 *   - Base score = fraction correct on the first pass.
 *   - If the base score falls within REDEMPTION_CAP (15 points) of passing,
 *     the learner gets a Redemption Round: re-answer ONLY the missed
 *     questions. Each one corrected earns back its point value, capped at
 *     REDEMPTION_CAP total. Final = min(1, base + earnedBack).
 *   - Land more than 15 points short and redemption can't rescue you — the
 *     module must be retaken. The cap is what makes the fail-safe a near-miss
 *     safety net rather than a way to grind a 40% into a pass.
 *
 * The main process stays the single source of truth for unlock state: it
 * only ever receives the final numeric score and compares it to the
 * threshold. Redemption is purely a renderer-side score-improvement pass.
 */
import type {
  ActiveAttempt,
  ModuleNode,
  ParthenonApi,
  ProgressData,
  QuizModule,
  QuizQuestion,
  ReviewDeckEntry,
} from "../types/schema.js";
import { pickVariant, sectionVariants } from "./variants.js";
import { playCue } from "./sound.js";

/** Maximum score (as a fraction) recoverable in a Redemption Round. */
export const REDEMPTION_CAP = 0.15;

/**
 * "graded" is the real, unlock-affecting attempt. "practice" re-runs a
 * completed module with random variants for drilling — it feeds the
 * spaced-repetition scheduler but never touches score or unlock state.
 * "gauntlet" is the pediment's mock interview: graded stakes, shuffled
 * random variants, a countdown, no lesson paragraphs, not resumable.
 */
export type ModuleMode = "graded" | "practice" | "gauntlet";

/** Mock-interview pacing: seconds allotted per gauntlet question. */
export const GAUNTLET_SECONDS_PER_QUESTION = 40;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape, then render `backtick spans` as inline code. */
function rich(s: string): string {
  return escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>");
}

interface ModalState {
  node: ModuleNode;
  quiz: QuizModule;
  mode: ModuleMode;
  sectionIndex: number;
  correct: number;
  /** Section indices answered wrong on the first pass. */
  missed: number[];
  /** Missed indices still to be re-attempted in the redemption round. */
  redeemQueue: number[];
  /** Uncapped points earned back so far in redemption. */
  redeemPoints: number;
  /** Variant id actually shown per section (redemption must avoid repeats). */
  shownIds: Record<number, string>;
  /** Gauntlet countdown state. */
  deadline?: number;
  timerId?: number;
}

let state: ModalState | null = null;
let apiRef: ParthenonApi;
let onDoneRef: (updated: ProgressData) => void;

function root(): HTMLElement {
  return document.getElementById("modal-root")!;
}

/** Record one answered check for the spaced-repetition scheduler. */
function recordResult(sectionIndex: number, correct: boolean): void {
  if (!state) return;
  // Gauntlet sections are sampled across modules, so indices don't map to
  // the pediment's own sections — an exam, not tracked drilling. Skip.
  if (state.mode === "gauntlet") return;
  void apiRef
    .recordSectionResult(state.node.id, sectionIndex, correct)
    .catch((err) => console.warn("section-stat record failed:", err));
}

export function openModule(
  node: ModuleNode,
  quiz: QuizModule,
  api: ParthenonApi,
  onDone: (updated: ProgressData) => void,
  resumeFrom?: ActiveAttempt,
  mode: ModuleMode = "graded"
): void {
  state = {
    node,
    quiz,
    mode,
    sectionIndex: resumeFrom?.sectionIndex ?? 0,
    correct: resumeFrom?.correct ?? 0,
    missed: resumeFrom?.missed ?? [],
    redeemQueue: resumeFrom?.redeemQueue ?? [],
    redeemPoints: resumeFrom?.redeemPoints ?? 0,
    shownIds: {},
  };
  apiRef = api;
  onDoneRef = onDone;
  root().hidden = false;
  if (mode === "gauntlet") startGauntletClock();
  if (resumeFrom?.phase === "redeem") {
    if (state.redeemQueue.length > 0) renderRedeem();
    else renderRedemptionIntro();
  } else {
    renderLesson();
  }
}

/* ---------------- Gauntlet countdown ---------------- */

function startGauntletClock(): void {
  if (!state) return;
  state.deadline =
    Date.now() + state.quiz.sections.length * GAUNTLET_SECONDS_PER_QUESTION * 1000;
  state.timerId = window.setInterval(() => {
    if (!state?.deadline) return;
    const left = state.deadline - Date.now();
    if (left <= 0) {
      expireGauntlet();
      return;
    }
    const chip = document.getElementById("gauntlet-timer");
    if (chip) {
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      chip.textContent = `${m}:${String(s).padStart(2, "0")}`;
      chip.classList.toggle("urgent", left < 60000);
    }
  }, 500);
}

function stopGauntletClock(): void {
  if (state?.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = undefined;
  }
}

/** Time called: every unanswered question counts as missed; straight to results. */
function expireGauntlet(): void {
  if (!state) return;
  stopGauntletClock();
  for (let i = state.sectionIndex; i < state.quiz.sections.length; i++) {
    if (!state.missed.includes(i)) state.missed.push(i);
  }
  state.sectionIndex = state.quiz.sections.length - 1;
  afterLessons();
}

function timerChip(): string {
  return state?.mode === "gauntlet"
    ? ` &middot; <span id="gauntlet-timer" class="gauntlet-timer"></span>`
    : "";
}

/**
 * Snapshot graded progress to disk (fire-and-forget). Practice runs are not
 * resumable — they carry no stakes — so they never write an attempt file.
 */
function persistAttempt(phase: ActiveAttempt["phase"]): void {
  if (!state || state.mode !== "graded") return;
  void apiRef
    .saveAttempt({
      nodeId: state.node.id,
      phase,
      sectionIndex: state.sectionIndex,
      correct: state.correct,
      missed: [...state.missed],
      redeemQueue: [...state.redeemQueue],
      redeemPoints: state.redeemPoints,
    })
    .catch((err) => console.warn("attempt autosave failed:", err));
}

function closeModal(): void {
  stopGauntletClock();
  state = null;
  const r = root();
  r.hidden = true;
  r.replaceChildren();
}

/** Explicit abandon: the learner chose to leave, so the snapshot is void. */
function abandonModule(): void {
  void apiRef.clearAttempt().catch(() => {});
  closeModal();
}

function card(inner: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "modal-card";
  div.innerHTML = inner;
  // Screen-reader affordances on every card shape.
  div.querySelector(".options")?.setAttribute("role", "group");
  div.querySelector(".options")?.setAttribute("aria-label", "Answer choices (press 1-4)");
  div.querySelector(".feedback-slot")?.setAttribute("aria-live", "polite");
  return div;
}

/** Show a card and put keyboard focus where the flow continues. */
function mountCard(el: HTMLElement): void {
  root().replaceChildren(el);
  root().scrollTop = 0;
  const target = el.querySelector<HTMLButtonElement>(
    ".option-btn:not([disabled]), .modal-actions .primary-btn"
  );
  target?.focus();
}

/* ---------------- Keyboard: 1-4 answer, Enter advance, Esc leave, Tab trap ---------------- */

function onModalKeydown(e: KeyboardEvent): void {
  const r = root();
  if (r.hidden) return;

  if (e.key === "Escape") {
    e.preventDefault();
    // Trigger whatever "leave" action the current card exposes, so Esc
    // matches the visible button's semantics on every screen.
    r.querySelector<HTMLButtonElement>(
      '[data-action="abandon"], [data-action="leave"], [data-action="done"]'
    )?.click();
    return;
  }

  // Answer with 1–4 or A–D regardless of the label style shown.
  let optIndex = -1;
  if (e.key >= "1" && e.key <= "4") optIndex = Number(e.key) - 1;
  else if (/^[a-dA-D]$/.test(e.key)) optIndex = e.key.toLowerCase().charCodeAt(0) - 97;
  if (optIndex >= 0) {
    const btn = r.querySelectorAll<HTMLButtonElement>(".option-btn")[optIndex];
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
    return;
  }

  if (e.key === "Enter") {
    // A focused button handles Enter natively; otherwise press the primary.
    if (e.target instanceof HTMLButtonElement) return;
    const primary = r.querySelector<HTMLButtonElement>(".modal-actions .primary-btn");
    if (primary) {
      e.preventDefault();
      primary.click();
    }
    return;
  }

  if (e.key === "Tab") {
    // Focus trap: cycle within the open card.
    const focusables = Array.from(
      r.querySelectorAll<HTMLElement>("button:not([disabled]), input, [tabindex]")
    ).filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = active !== null && r.contains(active);
    if (e.shiftKey && (!inside || active === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || active === last)) {
      e.preventDefault();
      first.focus();
    }
  }
}

// Bound once per page load; a no-op while the modal is hidden.
document.addEventListener("keydown", onModalKeydown);

/** A/B/C/D or 1/2/3/4 or nothing, per the user's option-label setting. */
function optionBadge(i: number): string {
  const style = document.documentElement.dataset.optionLabels ?? "letters";
  if (style === "none") return "";
  const mark = style === "numbers" ? String(i + 1) : "ABCD"[i] ?? "";
  return `<span class="opt-badge" aria-hidden="true">${mark}</span>`;
}

function optionsMarkup(options: string[]): string {
  return options
    .map(
      (opt, i) =>
        `<button class="option-btn" data-index="${i}">` +
        `${optionBadge(i)}<span class="opt-text">${rich(opt)}</span></button>`
    )
    .join("");
}

/**
 * Shared answer handling: reveal correct/wrong, render feedback, and append a
 * Continue button that invokes `onContinue` with whether the pick was right.
 */
function wireAnswer(
  el: HTMLElement,
  q: QuizQuestion,
  continueLabel: string,
  onContinue: (wasCorrect: boolean) => void
): void {
  let resolved = false;
  el.querySelectorAll<HTMLButtonElement>(".option-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (resolved) return;
      resolved = true;
      const chosen = Number(btn.dataset.index);
      const isCorrect = chosen === q.correctAnswerIndex;
      playCue(isCorrect ? "correct" : "wrong");

      el.querySelectorAll<HTMLButtonElement>(".option-btn").forEach((b) => {
        const i = Number(b.dataset.index);
        b.disabled = true;
        if (i === q.correctAnswerIndex) b.classList.add("correct");
        else if (i === chosen) b.classList.add("wrong");
      });

      const whyWrong = isCorrect
        ? ""
        : `<div class="why-wrong"><strong>Why your pick is wrong:</strong> ${rich(
            q.optionExplanations[chosen] ?? ""
          )}</div>`;

      el.querySelector(".feedback-slot")!.innerHTML = `
        <div class="feedback ${isCorrect ? "good" : "bad"}">
          <strong>${isCorrect ? "Correct." : "Not quite."}</strong> ${rich(q.rationale)}
          ${whyWrong}
          <div class="interview-tip">&#9650; Interview tip: ${rich(q.interviewTip)}</div>
        </div>`;

      const next = document.createElement("button");
      next.className = "primary-btn";
      next.textContent = continueLabel;
      next.addEventListener("click", () => onContinue(isCorrect));
      el.querySelector(".modal-actions")!.appendChild(next);
      // Reveal the feedback + Continue button — on a long lesson they render
      // below the fold, so bring them into view without the user scrolling.
      next.scrollIntoView({ block: "nearest" });
      next.focus();
    })
  );
}

/* ---------------- First pass: lessons + checks ---------------- */

function renderLesson(): void {
  if (!state) return;
  const { quiz, sectionIndex, mode } = state;
  const section = quiz.sections[sectionIndex];
  // Practice and the gauntlet rotate through the variant bank at random;
  // graded pins the canonical Test A so the unlock bar is identical for all.
  const q =
    mode === "graded"
      ? pickVariant(section, { mode: "graded" })
      : pickVariant(section, { mode: "practice" });
  state.shownIds[sectionIndex] = q.id;

  // The gauntlet is an exam: no teaching text, just concept + question.
  const paragraphs =
    mode === "gauntlet"
      ? ""
      : section.paragraphs
          .slice(0, 3) // hard cap: the chunked-feeding law
          .map((p) => `<p class="lesson-paragraph">${rich(p)}</p>`)
          .join("");

  const tag =
    mode === "practice"
      ? " &middot; <em>practice</em>"
      : mode === "gauntlet"
        ? " &middot; <em>gauntlet</em>"
        : "";
  const label = mode === "gauntlet" ? "Interview question" : "Interactive check";
  const el = card(`
    <h2>${escapeHtml(quiz.title)}</h2>
    <div class="modal-progress">Section ${sectionIndex + 1} of ${quiz.sections.length}
      &middot; ${state.correct} correct so far${tag}${timerChip()}</div>
    <h3 class="lesson-heading">${rich(section.heading)}</h3>
    ${paragraphs}
    <div class="check-label">${label}</div>
    <div class="question-text">${rich(q.question)}</div>
    <div class="options">${optionsMarkup(q.options)}</div>
    <div class="feedback-slot"></div>
    <div class="modal-actions">
      <button class="ghost-btn" data-action="abandon">Leave module</button>
    </div>
  `);

  el.querySelector('[data-action="abandon"]')!.addEventListener("click", abandonModule);

  const last = sectionIndex === quiz.sections.length - 1;
  wireAnswer(el, q, last ? "See results" : "Continue", (wasCorrect) => {
    if (!state) return;
    recordResult(state.sectionIndex, wasCorrect);
    if (wasCorrect) state.correct++;
    else state.missed.push(state.sectionIndex);
    if (last) afterLessons();
    else {
      state.sectionIndex++;
      persistAttempt("lesson");
      renderLesson();
    }
  });

  mountCard(el);
}

/* ---------------- Branch: pass / redeem / retake ---------------- */

function afterLessons(): void {
  if (!state) return;
  stopGauntletClock();
  const total = state.quiz.sections.length;
  const base = state.correct / total;
  const threshold = state.quiz.passThreshold;

  // Practice carries no stakes: no redemption, no score write, no unlocks.
  if (state.mode === "practice") {
    finishPractice(base);
    return;
  }

  if (base >= threshold) {
    void finalize(base, { mode: "clean", base });
  } else if (base + REDEMPTION_CAP + 1e-9 >= threshold) {
    persistAttempt("redeem"); // resume lands on the redemption intro
    renderRedemptionIntro();
  } else {
    void finalize(base, { mode: "tooLow", base });
  }
}

/** Practice summary — feedback only; progress is deliberately untouched. */
function finishPractice(score: number): void {
  if (!state) return;
  const { quiz, correct } = state;
  const total = quiz.sections.length;
  const pct = Math.round(score * 100);
  const el = card(`
    <h2>${escapeHtml(quiz.title)}</h2>
    <div class="modal-progress">Practice run &middot; progress unchanged</div>
    <div class="result-score ${pct >= 85 ? "pass" : "fail"}">${pct}%</div>
    <div class="result-detail">
      ${correct} of ${total} correct in practice. Nothing was recorded against
      your temple &mdash; but the concepts you missed just moved up your
      Review queue.
    </div>
    <div class="modal-actions">
      <button class="primary-btn" data-action="done">Return to the temple</button>
    </div>
  `);
  el.querySelector('[data-action="done"]')!.addEventListener("click", () => {
    const done = onDoneRef;
    closeModal();
    // Practice doesn't change progress, but refresh so any resume/UI re-reads.
    void apiRef.getProgress().then((p) => done(p));
  });
  mountCard(el);
}

function renderRedemptionIntro(): void {
  if (!state) return;
  const { quiz } = state;
  const base = state.correct / quiz.sections.length;
  const pct = Math.round(base * 100);
  const threshold = Math.round(quiz.passThreshold * 100);
  const cap = Math.round(REDEMPTION_CAP * 100);

  const el = card(`
    <h2>${escapeHtml(quiz.title)}</h2>
    <div class="result-score fail">${pct}%</div>
    <div class="result-detail">
      You landed just short of ${threshold}%. You've earned a
      <strong>Redemption Round</strong>: re-answer only the
      ${state.missed.length} question${state.missed.length === 1 ? "" : "s"}
      you missed. Each one you get right now earns points back, up to
      <strong>+${cap}%</strong> &mdash; enough to clear the line from here.
    </div>
    <div class="unlock-note">The lessons already showed you why. Prove it stuck.</div>
    <div class="modal-actions">
      <button class="ghost-btn" data-action="abandon">Leave module</button>
      <button class="primary-btn" data-action="begin">Begin Redemption Round</button>
    </div>
  `);
  el.querySelector('[data-action="abandon"]')!.addEventListener("click", abandonModule);
  el.querySelector('[data-action="begin"]')!.addEventListener("click", () => {
    if (!state) return;
    state.redeemQueue = [...state.missed];
    state.redeemPoints = 0;
    persistAttempt("redeem");
    renderRedeem();
  });
  mountCard(el);
}

function renderRedeem(): void {
  if (!state) return;
  const { quiz } = state;
  const idx = state.redeemQueue[0];
  // Redemption re-tests the concept with a variant the learner has NOT seen
  // this attempt — never the graded question they could have memorized.
  const section = quiz.sections[idx];
  // Avoid whichever variant was actually shown this attempt (graded runs pin
  // variants[0]; the gauntlet shows a random one).
  const shownId = state.shownIds[idx] ?? sectionVariants(section)[0]?.id ?? "";
  const q = pickVariant(section, {
    mode: "redeem",
    usedIds: new Set([shownId]),
  });
  const remaining = state.redeemQueue.length;
  const cap = Math.round(REDEMPTION_CAP * 100);

  const el = card(`
    <h2>${escapeHtml(quiz.title)}</h2>
    <div class="modal-progress">Redemption Round
      &middot; ${remaining} question${remaining === 1 ? "" : "s"} left
      &middot; up to +${cap}% recoverable</div>
    <div class="check-label">Second chance &middot; a different question, same concept</div>
    <div class="question-text">${rich(q.question)}</div>
    <div class="options">${optionsMarkup(q.options)}</div>
    <div class="feedback-slot"></div>
    <div class="modal-actions">
      <button class="ghost-btn" data-action="abandon">Leave module</button>
    </div>
  `);
  el.querySelector('[data-action="abandon"]')!.addEventListener("click", abandonModule);

  const last = remaining === 1;
  wireAnswer(el, q, last ? "See results" : "Next question", (wasCorrect) => {
    if (!state) return;
    recordResult(idx, wasCorrect);
    if (wasCorrect) state.redeemPoints += 1 / quiz.sections.length;
    state.redeemQueue.shift();
    if (state.redeemQueue.length > 0) persistAttempt("redeem");
    if (state.redeemQueue.length === 0) {
      const base = state.correct / quiz.sections.length;
      const earnedBack = Math.min(REDEMPTION_CAP, state.redeemPoints);
      const final = Math.min(1, base + earnedBack);
      void finalize(final, { mode: "redeemed", base, earnedBack });
    } else {
      renderRedeem();
    }
  });

  mountCard(el);
}

/* ---------------- Result screen ---------------- */

interface FinalizeMeta {
  mode: "clean" | "tooLow" | "redeemed";
  base: number;
  earnedBack?: number;
}

async function finalize(score: number, meta: FinalizeMeta): Promise<void> {
  if (!state) return;
  const { node, quiz } = state;
  const result = await apiRef.saveQuizScore(node.id, score);
  if (result.passed) playCue("pass");
  const pct = Math.round(score * 100);
  const threshold = Math.round(quiz.passThreshold * 100);

  const unlockNames = result.newlyUnlocked
    .map((id) => result.progress.nodes[id]?.title ?? id)
    .map(escapeHtml);

  let breakdown = "";
  if (meta.mode === "redeemed") {
    breakdown = `<div class="result-detail">Base ${Math.round(
      meta.base * 100
    )}% &nbsp;+&nbsp; redemption ${Math.round(
      (meta.earnedBack ?? 0) * 100
    )}% &nbsp;=&nbsp; <strong>${pct}%</strong></div>`;
  }

  let verdict: string;
  if (result.passed) {
    verdict = "This block of the temple is now solid marble.";
  } else if (meta.mode === "tooLow") {
    verdict = `That's more than ${Math.round(
      REDEMPTION_CAP * 100
    )} points below ${threshold}%, so the Redemption Round (worth up to ${Math.round(
      REDEMPTION_CAP * 100
    )}%) can't reach it. Re-enter the module &mdash; the lessons replay and your best score is kept.`;
  } else {
    verdict = `Still short of ${threshold}% after redemption. Re-enter the module to try again &mdash; your best score is kept.`;
  }

  const scoreBlock = result.passed
    ? `<div class="result-burst">${Array.from({ length: 12 })
        .map(() => `<span class="burst-spark"></span>`)
        .join("")}<div class="result-score pass">${pct}%</div></div>`
    : `<div class="result-score fail">${pct}%</div>`;

  const el = card(`
    <h2>${escapeHtml(quiz.title)}</h2>
    ${scoreBlock}
    ${breakdown}
    <div class="result-detail">${verdict}</div>
    ${
      unlockNames.length
        ? `<div class="unlock-note">Unlocked: ${unlockNames.join(" &middot; ")}</div>`
        : ""
    }
    <div class="modal-actions">
      <button class="primary-btn" data-action="done">Return to the temple</button>
    </div>
  `);

  el.querySelector('[data-action="done"]')!.addEventListener("click", () => {
    closeModal();
    onDoneRef(result.progress);
  });

  // Spark angles via CSSOM (inline style attributes violate the CSP).
  el.querySelectorAll<HTMLElement>(".burst-spark").forEach((s, i) => {
    s.style.setProperty("--a", `${i * 30}deg`);
  });

  mountCard(el);
}

/* ---------------- Cross-module Review drill (spaced repetition) ---------------- */

interface ReviewState {
  entries: ReviewDeckEntry[];
  index: number;
  correct: number;
  quizCache: Map<string, QuizModule>;
  onClose: () => void;
}

let review: ReviewState | null = null;

/**
 * Drill a queue of weak-spot concepts (possibly spanning several modules),
 * one random variant each, recording every result so the scheduler pushes
 * mastered concepts out and keeps missed ones near. No lessons, no scoring —
 * pure retrieval practice.
 */
export function openReviewDrill(
  entries: ReviewDeckEntry[],
  api: ParthenonApi,
  onClose: () => void
): void {
  apiRef = api;
  review = { entries, index: 0, correct: 0, quizCache: new Map(), onClose };
  root().hidden = false;
  void renderReviewCard();
}

function closeReview(): void {
  const cb = review?.onClose;
  review = null;
  const r = root();
  r.hidden = true;
  r.replaceChildren();
  cb?.();
}

async function renderReviewCard(): Promise<void> {
  if (!review) return;
  const entry = review.entries[review.index];
  let quiz = review.quizCache.get(entry.quizFile);
  if (!quiz) {
    quiz = await apiRef.getQuiz(entry.quizFile);
    review.quizCache.set(entry.quizFile, quiz);
  }
  const section = quiz.sections[entry.sectionIndex];
  const q = pickVariant(section, { mode: "practice" });
  const pos = review.index + 1;

  const el = card(`
    <h2>Review &middot; Weak Spots</h2>
    <div class="modal-progress">Concept ${pos} of ${review.entries.length}
      &middot; ${escapeHtml(entry.nodeTitle)}${entry.due ? " &middot; <em>due</em>" : ""}</div>
    <h3 class="lesson-heading">${rich(entry.heading)}</h3>
    <div class="check-label">Recall check &middot; a fresh scenario</div>
    <div class="question-text">${rich(q.question)}</div>
    <div class="options">${optionsMarkup(q.options)}</div>
    <div class="feedback-slot"></div>
    <div class="modal-actions">
      <button class="ghost-btn" data-action="leave">Leave review</button>
    </div>
  `);
  el.querySelector('[data-action="leave"]')!.addEventListener("click", closeReview);

  const last = review.index === review.entries.length - 1;
  wireAnswer(el, q, last ? "See summary" : "Next concept", (wasCorrect) => {
    if (!review) return;
    if (wasCorrect) review.correct++;
    void apiRef
      .recordSectionResult(entry.nodeId, entry.sectionIndex, wasCorrect)
      .catch(() => {});
    if (last) renderReviewSummary();
    else {
      review.index++;
      void renderReviewCard();
    }
  });

  mountCard(el);
}

function renderReviewSummary(): void {
  if (!review) return;
  const total = review.entries.length;
  const pct = Math.round((review.correct / total) * 100);
  const el = card(`
    <h2>Review Complete</h2>
    <div class="result-score ${pct >= 85 ? "pass" : "fail"}">${pct}%</div>
    <div class="result-detail">
      ${review.correct} of ${total} recalled. Concepts you nailed drift further
      down the queue; the ones you missed will resurface sooner.
    </div>
    <div class="modal-actions">
      <button class="primary-btn" data-action="done">Return to the temple</button>
    </div>
  `);
  el.querySelector('[data-action="done"]')!.addEventListener("click", closeReview);
  mountCard(el);
}
