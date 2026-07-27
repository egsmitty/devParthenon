/**
 * Quiz overlay & module reader.
 *
 * Enforces the anti-overwhelm laws: each section shows at most 3 short
 * paragraphs, then requires an interactive check before continuing. Wrong
 * answers always get an explanation of *why* they are wrong plus an
 * interview tip.
 */
import type {
  ModuleNode,
  ParthenonApi,
  ProgressData,
  QuizModule,
} from "../types/schema.js";

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
  answered: boolean;
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
  onDone: (updated: ProgressData) => void
): void {
  state = { node, quiz, sectionIndex: 0, correct: 0, answered: false };
  apiRef = api;
  onDoneRef = onDone;
  root().hidden = false;
  renderSection();
}

function closeModal(): void {
  state = null;
  const r = root();
  r.hidden = true;
  r.replaceChildren();
}

function card(inner: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "modal-card";
  div.innerHTML = inner;
  return div;
}

function renderSection(): void {
  if (!state) return;
  const { quiz, sectionIndex } = state;
  const section = quiz.sections[sectionIndex];
  const q = section.question;

  const paragraphs = section.paragraphs
    .slice(0, 3) // hard cap: the chunked-feeding law
    .map((p) => `<p class="lesson-paragraph">${rich(p)}</p>`)
    .join("");

  const options = q.options
    .map(
      (opt, i) =>
        `<button class="option-btn" data-index="${i}">${rich(opt)}</button>`
    )
    .join("");

  const el = card(`
    <h2>${escapeHtml(quiz.title)}</h2>
    <div class="modal-progress">Section ${sectionIndex + 1} of ${quiz.sections.length}
      &middot; ${state.correct} correct so far</div>
    <h3 class="lesson-heading">${rich(section.heading)}</h3>
    ${paragraphs}
    <div class="check-label">Interactive check</div>
    <div class="question-text">${rich(q.question)}</div>
    <div class="options">${options}</div>
    <div class="feedback-slot"></div>
    <div class="modal-actions">
      <button class="ghost-btn" data-action="abandon">Leave module</button>
    </div>
  `);

  el.querySelectorAll<HTMLButtonElement>(".option-btn").forEach((btn) =>
    btn.addEventListener("click", () => answer(Number(btn.dataset.index), el))
  );
  el.querySelector('[data-action="abandon"]')!.addEventListener("click", closeModal);

  root().replaceChildren(el);
  root().scrollTop = 0;
}

function answer(chosen: number, el: HTMLElement): void {
  if (!state || state.answered) return;
  state.answered = true;
  const q = state.quiz.sections[state.sectionIndex].question;
  const isCorrect = chosen === q.correctAnswerIndex;
  if (isCorrect) state.correct++;

  el.querySelectorAll<HTMLButtonElement>(".option-btn").forEach((btn) => {
    const i = Number(btn.dataset.index);
    btn.disabled = true;
    if (i === q.correctAnswerIndex) btn.classList.add("correct");
    else if (i === chosen) btn.classList.add("wrong");
  });

  const whyWrong = isCorrect
    ? ""
    : `<div class="why-wrong"><strong>Why your pick is wrong:</strong> ${rich(
        q.optionExplanations[chosen] ?? ""
      )}</div>`;

  const slot = el.querySelector(".feedback-slot")!;
  slot.innerHTML = `
    <div class="feedback ${isCorrect ? "good" : "bad"}">
      <strong>${isCorrect ? "Correct." : "Not quite."}</strong> ${rich(q.rationale)}
      ${whyWrong}
      <div class="interview-tip">&#9650; Interview tip: ${rich(q.interviewTip)}</div>
    </div>`;

  const actions = el.querySelector(".modal-actions")!;
  const next = document.createElement("button");
  next.className = "primary-btn";
  const last = state.sectionIndex === state.quiz.sections.length - 1;
  next.textContent = last ? "Finish module" : "Continue";
  next.addEventListener("click", () => {
    if (!state) return;
    if (last) {
      void finishModule();
    } else {
      state.sectionIndex++;
      state.answered = false;
      renderSection();
    }
  });
  actions.appendChild(next);
}

async function finishModule(): Promise<void> {
  if (!state) return;
  const { node, quiz, correct } = state;
  const score = correct / quiz.sections.length;
  const result = await apiRef.saveQuizScore(node.id, score);
  const pct = Math.round(score * 100);
  const threshold = Math.round(quiz.passThreshold * 100);

  const unlockNames = result.newlyUnlocked
    .map((id) => result.progress.nodes[id]?.title ?? id)
    .map(escapeHtml);

  const el = card(`
    <h2>${escapeHtml(quiz.title)}</h2>
    <div class="result-score ${result.passed ? "pass" : "fail"}">${pct}%</div>
    <div class="result-detail">
      ${correct} of ${quiz.sections.length} checks correct.
      ${
        result.passed
          ? "This block of the temple is now solid marble."
          : `You need ${threshold}% to set this stone. Re-enter the module and try again &mdash; the lessons will replay.`
      }
    </div>
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
}
