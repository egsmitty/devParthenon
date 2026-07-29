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
 * Per-module keyword that scopes a section's "Learn more" web search to the
 * right topic (a heading like "Who does what" is ambiguous on its own).
 */
const LEARN_MORE_KEYWORD: Record<string, string> = {
  foundation: "web development",
  "pillar-react": "React",
  "pillar-nextjs": "Next.js",
  "pillar-node": "Node.js",
  "pillar-databases": "SQL databases",
  "pillar-tailwind": "CSS Tailwind",
  "pillar-git": "Git version control",
  pediment: "web development interview",
};

/** A web-search URL that expands on a section's topic, opened in the browser. */
function learnMoreUrl(nodeId: string, heading: string): { url: string; topic: string } {
  const topic = heading.replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
  const keyword = LEARN_MORE_KEYWORD[nodeId] ?? "web development";
  // Cap the query so a pathological heading can never build a runaway URL.
  const query = `${topic} ${keyword}`.trim().slice(0, 300);
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    topic: topic || keyword,
  };
}

/** Briefly show an error on the Learn-more button if the browser won't open. */
function flashLearnMoreError(btn: HTMLButtonElement): void {
  if (btn.dataset.restoring) return;
  const original = btn.innerHTML;
  btn.dataset.restoring = "1";
  btn.disabled = true;
  btn.innerHTML = `<span class="lm-glyph" aria-hidden="true">&#9888;</span> Couldn't open browser`;
  window.setTimeout(() => {
    btn.innerHTML = original;
    btn.disabled = false;
    delete btn.dataset.restoring;
  }, 2600);
}

/**
 * "graded" is the real, unlock-affecting attempt. "practice" re-runs a
 * completed module with random variants for drilling — it feeds the
 * spaced-repetition scheduler but never touches score or unlock state.
 * "gauntlet" is the pediment's mock interview: graded stakes, shuffled
 * random variants, a countdown, no lesson paragraphs, not resumable.
 * "mastery" is a module's Mastery Test: 10 random questions from its bank, no
 * lessons, ≥80% to earn the trophy, infinite retries, not resumable.
 * "herculean" is the final trial: 25 questions spanning the whole curriculum
 * (seen + new), timed, ≥85%, not resumable; a fail stashes weak areas for a
 * side-quest and a pass awards the ultimate trophy.
 */
export type ModuleMode = "graded" | "practice" | "gauntlet" | "mastery" | "herculean";

/** Questions drawn for a Mastery Test, and the fraction needed to pass it. */
export const MASTERY_QUESTION_COUNT = 10;
export const MASTERY_PASS = 0.8;

/** The Herculean final: question count and the fraction needed to pass. */
export const HERCULEAN_QUESTION_COUNT = 25;
export const HERCULEAN_PASS = 0.85;

/** Mock-interview pacing: seconds allotted per gauntlet/Herculean question. */
export const GAUNTLET_SECONDS_PER_QUESTION = 40;

/** True for the timed, lesson-free exam modes (gauntlet + Herculean). */
function isTimedExam(mode: ModuleMode): boolean {
  return mode === "gauntlet" || mode === "herculean";
}

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

/* Glossary linking: chips under a lesson that jump to the Codex. */
let lessonTerms: string[] = [];
let openCodexTerm: (term: string) => void = () => {};
export function configureLessonLinks(
  terms: string[],
  opener: (term: string) => void
): void {
  lessonTerms = terms;
  openCodexTerm = opener;
}

/* Mastery launch: app.ts wires how to start a module's Mastery Test (it builds
   the random 10-question draw), so a result screen can offer/retry it. */
let launchMastery: (node: ModuleNode) => void = () => {};
export function configureMastery(fn: (node: ModuleNode) => void): void {
  launchMastery = fn;
}

/* Overview launch: app.ts wires the recap overlay (it holds the glossary), so
   a graded-pass screen can offer a "what you now know" review. */
let launchOverview: (quiz: QuizModule) => void = () => {};
export function configureOverview(fn: (quiz: QuizModule) => void): void {
  launchOverview = fn;
}

/* Herculean side-quest: app.ts wires how to drill a set of weak-area keys (it
   resolves them to a review deck), so a failed Herculean can send the learner
   to train the exact concepts they missed before retrying. */
let launchSideQuest: (weakAreas: string[]) => void = () => {};
export function configureHerculean(fn: (weakAreas: string[]) => void): void {
  launchSideQuest = fn;
}

/** Glossary terms mentioned (whole-word) in a section's paragraphs. */
function relatedTerms(paragraphs: string[]): string[] {
  const text = " " + paragraphs.join("  ").toLowerCase() + " ";
  return lessonTerms
    .filter((t) => {
      const esc = t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(text);
    })
    .slice(0, 6);
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
  /** Gauntlet/Herculean countdown state. */
  deadline?: number;
  timerId?: number;
  /** Mastery/Herculean: relaunch a fresh draw for "Try again". */
  retry?: () => void;
  /**
   * Herculean only: the review key ("nodeId/sectionIndex") each question came
   * from, aligned by section index; null for the "new/general" bank questions
   * that map to no single concept. Missed ones seed the side-quest.
   */
  origins?: (string | null)[];
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
  // The exams (gauntlet, Mastery, Herculean) draw questions across banks, so
  // their indices don't map to real sections — not tracked drilling. Skip.
  if (state.mode === "gauntlet" || state.mode === "mastery" || state.mode === "herculean") return;
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
  mode: ModuleMode = "graded",
  retry?: () => void,
  examOrigins?: (string | null)[]
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
    retry,
    origins: examOrigins,
  };
  apiRef = api;
  onDoneRef = onDone;
  root().hidden = false;
  if (isTimedExam(mode)) startGauntletClock();
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
  return state && isTimedExam(state.mode)
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

  // The exams (gauntlet, Mastery, Herculean) show no teaching text — just the check.
  const noLessons = mode === "gauntlet" || mode === "mastery" || mode === "herculean";
  const paragraphs = noLessons
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
        : mode === "mastery"
          ? " &middot; <em>mastery test</em>"
          : mode === "herculean"
            ? " &middot; <em>herculean trial</em>"
            : "";
  const label =
    mode === "gauntlet"
      ? "Interview question"
      : mode === "mastery"
        ? "Mastery question"
        : mode === "herculean"
          ? "Trial of Heracles"
          : "Your turn";
  const related = noLessons ? [] : relatedTerms(section.paragraphs);
  const relatedHtml = related.length
    ? `<div class="related-terms"><span class="rt-label">In the Codex</span>` +
      related
        .map(
          (t) =>
            `<button class="jargon-chip" data-term="${escapeHtml(t)}">${escapeHtml(t)}</button>`
        )
        .join("") +
      `</div>`
    : "";
  // The "Your turn" check: question + options + actions. In a lesson this is
  // the right-hand panel; in the gauntlet (no teaching text) it stands alone.
  const turnHtml = `
    <div class="check-label">${label}</div>
    <div class="question-text">${rich(q.question)}</div>
    <div class="options">${optionsMarkup(q.options)}</div>
    <div class="feedback-slot"></div>
    <div class="modal-actions">
      <button class="ghost-btn" data-action="abandon">Step away</button>
    </div>
  `;

  // Lesson text (left column): heading, paragraphs, "In short", Codex chips.
  const lessonHtml = `
    <h3 class="lesson-heading">${rich(section.heading)}</h3>
    ${paragraphs}
    ${section.summary ? `<div class="lesson-summary"><span class="ls-label">In short</span><span>${rich(section.summary)}</span></div>` : ""}
    ${relatedHtml}
  `;

  // An exam is a bare question; a taught section is two columns
  // (lesson | your turn) that stack on narrow windows.
  const body = noLessons
    ? turnHtml
    : `<div class="lesson-columns">
          <div class="lesson-col-left">${lessonHtml}</div>
          <div class="lesson-col-right your-turn">${turnHtml}</div>
        </div>`;

  // A per-topic "Learn more" — hands off to a web search that goes deeper than
  // the lesson. Only on taught sections (an exam is a closed check).
  const learn = noLessons ? null : learnMoreUrl(state.node.id, section.heading);
  const learnMoreHtml = learn
    ? `<div class="lesson-topbar"><button class="learn-more-btn" data-action="learn-more"
        title="Search the web for &ldquo;${escapeHtml(learn.topic)}&rdquo;">
        <span class="lm-glyph" aria-hidden="true">&#128269;</span> Learn more
        <span class="lm-arrow" aria-hidden="true">&#8599;</span></button></div>`
    : "";

  const el = card(`
    ${learnMoreHtml}
    <h2>${escapeHtml(quiz.title)}</h2>
    <div class="modal-progress">${noLessons ? "Question" : "Section"} ${sectionIndex + 1} of ${quiz.sections.length}
      &middot; ${state.correct} correct so far${tag}${timerChip()}</div>
    ${body}
  `);
  if (!noLessons) el.classList.add("lesson-wide");

  el.querySelector('[data-action="abandon"]')!.addEventListener("click", abandonModule);
  if (learn) {
    el.querySelector('[data-action="learn-more"]')!.addEventListener("click", (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      void apiRef
        .openExternal(learn.url)
        .then((ok) => {
          if (!ok) flashLearnMoreError(btn);
        })
        .catch(() => flashLearnMoreError(btn));
    });
  }
  el.querySelectorAll<HTMLButtonElement>(".jargon-chip").forEach((chip) =>
    chip.addEventListener("click", () => openCodexTerm(chip.dataset.term ?? ""))
  );

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

  // The Mastery Test has its own pass bar, trophy, and retry — no redemption.
  if (state.mode === "mastery") {
    void finishMastery(base);
    return;
  }

  // The Herculean final: its own 85% bar, ultimate trophy, and side-quest.
  if (state.mode === "herculean") {
    void finishHerculean(base);
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

/**
 * Mastery-Test result: record the attempt (which may award the module's
 * trophy), then show pass + trophy or fail + a "Try again" that redraws a fresh
 * 10-question set. Retries are unlimited and carry no penalty.
 */
async function finishMastery(score: number): Promise<void> {
  if (!state) return;
  const { node, quiz, correct, retry } = state;
  const total = quiz.sections.length;
  const pct = Math.round(score * 100);
  const bar = Math.round(MASTERY_PASS * 100);

  let outcome: {
    progress: ProgressData;
    passed: boolean;
    awardedTrophy: string | null;
    newlyUnlocked: string[];
  } | null = null;
  try {
    outcome = await apiRef.recordMasteryResult(node.id, score);
  } catch (err) {
    console.warn("mastery record failed:", err);
  }
  const passed = outcome?.passed ?? score + 1e-9 >= MASTERY_PASS;
  if (passed) playCue("pass");

  // A mastery pass is what unlocks the next stone under the progression gate.
  const unlockNames = (outcome?.newlyUnlocked ?? [])
    .map((id) => outcome?.progress.nodes[id]?.title ?? id)
    .map(escapeHtml);

  const scoreBlock = passed
    ? `<div class="result-burst">${Array.from({ length: 12 })
        .map(() => `<span class="burst-spark"></span>`)
        .join("")}<div class="result-score pass">${pct}%</div></div>`
    : `<div class="result-score fail">${pct}%</div>`;

  const verdict = passed
    ? `You cleared the ${bar}% Mastery bar &mdash; ${correct} of ${total} correct. This topic is proven, not just seen.`
    : `${correct} of ${total} correct, short of the ${bar}% bar. Retries are unlimited and each draws a fresh set of questions.`;

  const trophyNote = outcome?.awardedTrophy
    ? `<div class="trophy-award"><span class="trophy-mark" aria-hidden="true">&#9819;</span> Trophy earned &mdash; added to your case.</div>`
    : passed
      ? `<div class="unlock-note">Mastery re-confirmed. The trophy is already in your case.</div>`
      : "";

  const unlockNote = unlockNames.length
    ? `<div class="unlock-note">Unlocked: ${unlockNames.join(" &middot; ")}</div>`
    : "";

  const actions = passed
    ? `<button class="primary-btn" data-action="done">Return to the temple</button>`
    : `<button class="ghost-btn" data-action="done">Leave</button>` +
      (retry ? `<button class="primary-btn" data-action="retry">Try again</button>` : "");

  const el = card(`
    <h2>${escapeHtml(quiz.title)} &middot; Mastery Test</h2>
    ${scoreBlock}
    <div class="result-detail">${verdict}</div>
    ${trophyNote}
    ${unlockNote}
    <div class="modal-actions">${actions}</div>
  `);

  el.querySelector('[data-action="done"]')!.addEventListener("click", () => {
    const done = onDoneRef;
    const prog = outcome?.progress ?? null;
    closeModal();
    if (prog) done(prog);
    else void apiRef.getProgress().then((p) => done(p));
  });
  el.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
    const again = retry;
    closeModal();
    again?.();
  });
  el.querySelectorAll<HTMLElement>(".burst-spark").forEach((s, i) =>
    s.style.setProperty("--a", `${i * 30}deg`)
  );

  mountCard(el);
}

/**
 * Herculean result: record the attempt (awarding the ultimate trophy on a pass,
 * stashing weak areas on a fail), then show pass + Zeus, or fail + the
 * side-quest to drill the exact concepts missed before retrying.
 */
async function finishHerculean(score: number): Promise<void> {
  if (!state) return;
  const { quiz, correct, retry, origins } = state;
  const total = quiz.sections.length;
  const pct = Math.round(score * 100);
  const bar = Math.round(HERCULEAN_PASS * 100);

  // Missed questions that trace to a real concept seed the side-quest; the
  // "new/general" bank questions (origin null) map to no single review key.
  const missedKeys = origins
    ? [...new Set(state.missed.map((i) => origins[i]).filter((k): k is string => !!k))]
    : [];

  let outcome: {
    progress: ProgressData;
    passed: boolean;
    awardedTrophy: string | null;
    weakAreas: string[];
  } | null = null;
  try {
    outcome = await apiRef.recordHerculeanResult(score, missedKeys);
  } catch (err) {
    console.warn("herculean record failed:", err);
  }
  const passed = outcome?.passed ?? score + 1e-9 >= HERCULEAN_PASS;
  if (passed) playCue("pass");

  const scoreBlock = passed
    ? `<div class="result-burst">${Array.from({ length: 12 })
        .map(() => `<span class="burst-spark"></span>`)
        .join("")}<div class="result-score pass">${pct}%</div></div>`
    : `<div class="result-score fail">${pct}%</div>`;

  const verdict = passed
    ? `You cleared the ${bar}% Herculean bar &mdash; ${correct} of ${total} across the whole craft. The pantheon is yours.`
    : `${correct} of ${total} correct, short of the ${bar}% bar. The trial has marked the concepts you missed &mdash; drill them, then return stronger.`;

  const trophyNote = outcome?.awardedTrophy
    ? `<div class="trophy-award"><span class="trophy-mark" aria-hidden="true">&#9819;</span> The ultimate trophy &mdash; Zeus &mdash; is enshrined in your case.</div>`
    : "";

  const weak = outcome?.weakAreas ?? missedKeys;
  const sideQuestBtn =
    !passed && weak.length
      ? `<button class="primary-btn" data-action="sidequest">Train ${weak.length} weak spot${weak.length === 1 ? "" : "s"} &rarr;</button>`
      : "";
  const retryBtn =
    !passed && retry ? `<button class="ghost-btn" data-action="retry">Retry the trial</button>` : "";
  const actions = passed
    ? `<button class="primary-btn" data-action="done">Return to the temple</button>`
    : `<button class="ghost-btn" data-action="done">Leave</button>${retryBtn}${sideQuestBtn}`;

  const el = card(`
    <h2>The Herculean Trial</h2>
    ${scoreBlock}
    <div class="result-detail">${verdict}</div>
    ${trophyNote}
    <div class="modal-actions">${actions}</div>
  `);

  el.querySelector('[data-action="done"]')!.addEventListener("click", () => {
    const done = onDoneRef;
    const prog = outcome?.progress ?? null;
    closeModal();
    if (prog) done(prog);
    else void apiRef.getProgress().then((p) => done(p));
  });
  el.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
    const again = retry;
    closeModal();
    again?.();
  });
  el.querySelector('[data-action="sidequest"]')?.addEventListener("click", () => {
    const keys = weak;
    closeModal();
    launchSideQuest(keys);
  });
  el.querySelectorAll<HTMLElement>(".burst-spark").forEach((s, i) =>
    s.style.setProperty("--a", `${i * 30}deg`)
  );

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
      <button class="ghost-btn" data-action="abandon">Step away</button>
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
      <button class="ghost-btn" data-action="abandon">Step away</button>
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
  // A graded module pass opens its Mastery Test (the gauntlet/pediment doesn't).
  const offerMastery = result.passed && state.mode === "graded";

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

  // On a graded pass, recap the key takeaways (the section summaries).
  const recap =
    result.passed && state.mode === "graded" && quiz.sections.some((s) => s.summary)
      ? `<div class="result-recap"><h3>What you carry forward</h3><ul>${quiz.sections
          .map((s) => (s.summary ? `<li>${rich(s.summary)}</li>` : ""))
          .join("")}</ul></div>`
      : "";

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
    ${recap}
    ${
      offerMastery
        ? `<div class="mastery-cta"><span class="mc-label">Prove it</span>
             Pass the Mastery Test (${Math.round(MASTERY_PASS * 100)}% on 10 drawn
             questions) to earn this pillar's trophy and unlock the next stone.</div>`
        : ""
    }
    <div class="modal-actions">
      ${
        offerMastery
          ? `<button class="ghost-btn" data-action="overview">Review what you learned</button>
             <button class="ghost-btn" data-action="done">Not yet</button>
             <button class="primary-btn" data-action="mastery">Take the Mastery Test &rarr;</button>`
          : `<button class="primary-btn" data-action="done">Return to the temple</button>`
      }
    </div>
  `);

  el.querySelector('[data-action="done"]')!.addEventListener("click", () => {
    closeModal();
    onDoneRef(result.progress);
  });
  el.querySelector('[data-action="overview"]')?.addEventListener("click", () => {
    // Peek at the recap over the result screen; closing it returns here.
    launchOverview(quiz);
  });
  el.querySelector('[data-action="mastery"]')?.addEventListener("click", () => {
    const node = result.progress.nodes[state!.node.id] ?? state!.node;
    closeModal();
    onDoneRef(result.progress);
    launchMastery(node);
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
