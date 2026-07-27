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
} from "../types/schema.js";

/** Maximum score (as a fraction) recoverable in a Redemption Round. */
export const REDEMPTION_CAP = 0.15;

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
  sectionIndex: number;
  correct: number;
  /** Section indices answered wrong on the first pass. */
  missed: number[];
  /** Missed indices still to be re-attempted in the redemption round. */
  redeemQueue: number[];
  /** Uncapped points earned back so far in redemption. */
  redeemPoints: number;
}

let state: ModalState | null = null;
let apiRef: ParthenonApi;
let onDoneRef: (updated: ProgressData) => void;

function root(): HTMLElement {
  return document.getElementById("modal-root")!;
}

export function openModule(
  node: ModuleNode,
  quiz: QuizModule,
  api: ParthenonApi,
  onDone: (updated: ProgressData) => void,
  resumeFrom?: ActiveAttempt
): void {
  state = {
    node,
    quiz,
    sectionIndex: resumeFrom?.sectionIndex ?? 0,
    correct: resumeFrom?.correct ?? 0,
    missed: resumeFrom?.missed ?? [],
    redeemQueue: resumeFrom?.redeemQueue ?? [],
    redeemPoints: resumeFrom?.redeemPoints ?? 0,
  };
  apiRef = api;
  onDoneRef = onDone;
  root().hidden = false;
  if (resumeFrom?.phase === "redeem") {
    if (state.redeemQueue.length > 0) renderRedeem();
    else renderRedemptionIntro();
  } else {
    renderLesson();
  }
}

/** Snapshot current progress-through-the-module to disk (fire-and-forget). */
function persistAttempt(phase: ActiveAttempt["phase"]): void {
  if (!state) return;
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
  return div;
}

function optionsMarkup(options: string[]): string {
  return options
    .map(
      (opt, i) =>
        `<button class="option-btn" data-index="${i}">${rich(opt)}</button>`
    )
    .join("");
}

/**
 * Shared answer handling: reveal correct/wrong, render feedback, and append a
 * Continue button that invokes `onContinue` with whether the pick was right.
 */
function wireAnswer(
  el: HTMLElement,
  q: QuizModule["sections"][number]["question"],
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
    })
  );
}

/* ---------------- First pass: lessons + checks ---------------- */

function renderLesson(): void {
  if (!state) return;
  const { quiz, sectionIndex } = state;
  const section = quiz.sections[sectionIndex];
  const q = section.question;

  const paragraphs = section.paragraphs
    .slice(0, 3) // hard cap: the chunked-feeding law
    .map((p) => `<p class="lesson-paragraph">${rich(p)}</p>`)
    .join("");

  const el = card(`
    <h2>${escapeHtml(quiz.title)}</h2>
    <div class="modal-progress">Section ${sectionIndex + 1} of ${quiz.sections.length}
      &middot; ${state.correct} correct so far</div>
    <h3 class="lesson-heading">${rich(section.heading)}</h3>
    ${paragraphs}
    <div class="check-label">Interactive check</div>
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
    if (wasCorrect) state.correct++;
    else state.missed.push(state.sectionIndex);
    if (last) afterLessons();
    else {
      state.sectionIndex++;
      persistAttempt("lesson");
      renderLesson();
    }
  });

  root().replaceChildren(el);
  root().scrollTop = 0;
}

/* ---------------- Branch: pass / redeem / retake ---------------- */

function afterLessons(): void {
  if (!state) return;
  const total = state.quiz.sections.length;
  const base = state.correct / total;
  const threshold = state.quiz.passThreshold;

  if (base >= threshold) {
    void finalize(base, { mode: "clean", base });
  } else if (base + REDEMPTION_CAP + 1e-9 >= threshold) {
    persistAttempt("redeem"); // resume lands on the redemption intro
    renderRedemptionIntro();
  } else {
    void finalize(base, { mode: "tooLow", base });
  }
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
  root().replaceChildren(el);
  root().scrollTop = 0;
}

function renderRedeem(): void {
  if (!state) return;
  const { quiz } = state;
  const idx = state.redeemQueue[0];
  // Redemption uses the parallel variant ("Test B"), not the primary
  // question, so the concept is re-tested rather than the memorized answer.
  const q = quiz.sections[idx].altQuestion;
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

  root().replaceChildren(el);
  root().scrollTop = 0;
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

  const el = card(`
    <h2>${escapeHtml(quiz.title)}</h2>
    <div class="result-score ${result.passed ? "pass" : "fail"}">${pct}%</div>
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

  root().replaceChildren(el);
  root().scrollTop = 0;
}
