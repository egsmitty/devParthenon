/**
 * Shared type contracts for Dev Parthenon.
 * Used by the Electron main process, the preload bridge, and the renderer.
 */

export type NodeStatus = "locked" | "unlocked" | "in_progress" | "completed";

export type NodeCategory = "foundation" | "pillar" | "pediment";

export interface ModuleNode {
  id: string;
  category: NodeCategory;
  title: string;
  description: string;
  status: NodeStatus;
  /** Best score achieved on the module quiz, 0..1. Null when never attempted. */
  score: number | null;
  /** Node ids that must all be "completed" before this node unlocks. */
  prerequisites: string[];
  /** File name inside data/quizzes/ that holds this module's lessons + quiz. */
  quizFile: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  /** Why the correct answer is correct. */
  rationale: string;
  /**
   * One entry per option, same order as options[]. Explains why each wrong
   * choice is wrong — targeted at common interview traps.
   */
  optionExplanations: string[];
  interviewTip: string;
}

/**
 * A single "chunk" of a module: at most 3 short paragraphs of teaching,
 * always followed by an interactive check (the anti-overwhelm law).
 */
export interface LessonSection {
  heading: string;
  paragraphs: string[];
  /** Primary check ("Test A"), shown on the first pass through the module. */
  question: QuizQuestion;
  /**
   * Parallel variant ("Test B") of the same concept with a different
   * scenario and answer. Shown in the Redemption Round so a learner can't
   * pass by memorizing the primary answer — they must understand the idea.
   */
  altQuestion: QuizQuestion;
}

export interface QuizModule {
  id: string;
  title: string;
  /** Fraction of questions that must be answered correctly to pass (0.8). */
  passThreshold: number;
  sections: LessonSection[];
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  tags: string[];
}

export interface ProgressData {
  version: number;
  foundationCompleted: boolean;
  /** Ids of pillar nodes currently unlocked (or beyond). */
  unlockedPillars: string[];
  nodes: Record<string, ModuleNode>;
}

export interface SaveScoreResult {
  progress: ProgressData;
  passed: boolean;
  newlyUnlocked: string[];
}

/**
 * A snapshot of an in-flight module attempt, autosaved after every answered
 * check so a renderer reload, crash, or app restart can resume mid-module
 * instead of restarting from section 1. Cleared on completion or explicit
 * abandon.
 */
export interface ActiveAttempt {
  nodeId: string;
  /** Which stage of the module flow the learner is in. */
  phase: "lesson" | "redeem";
  /** Next section to show (lesson phase). */
  sectionIndex: number;
  correct: number;
  missed: number[];
  redeemQueue: number[];
  redeemPoints: number;
  /** Stamped by the main process on save. */
  savedAtISO?: string;
}

/** API surface exposed on window.parthenon by the preload script. */
export interface ParthenonApi {
  getProgress(): Promise<ProgressData>;
  saveQuizScore(nodeId: string, score: number): Promise<SaveScoreResult>;
  resetProgress(): Promise<ProgressData>;
  getQuiz(quizFile: string): Promise<QuizModule>;
  getGlossary(): Promise<GlossaryEntry[]>;
  saveAttempt(attempt: ActiveAttempt): Promise<void>;
  getAttempt(): Promise<ActiveAttempt | null>;
  clearAttempt(): Promise<void>;
  windowControl(action: "minimize" | "maximize" | "close"): void;
  onMaximizeChange(cb: (isMaximized: boolean) => void): void;
  /** True when running under the headless smoke check (suppress dialogs). */
  isSmoke: boolean;
}
