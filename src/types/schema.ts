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
 *
 * Each section carries an ordered pool of parallel question variants
 * (Test A/B/C/D…): same concept and interview trap, different scenario and
 * answer. variants[0] is the canonical graded check; later entries feed the
 * Redemption Round and practice replays so rote answer-memorization never
 * passes. Selection policy lives in src/renderer/variants.ts.
 */
export interface LessonSection {
  heading: string;
  paragraphs: string[];
  /** Optional plain-language one-line takeaway shown before the check. */
  summary?: string;
  /** Ordered variant pool; index 0 is the canonical "Test A". */
  variants?: QuizQuestion[];
  /** @deprecated legacy shape — superseded by variants[0]. */
  question?: QuizQuestion;
  /** @deprecated legacy shape — superseded by variants[1]. */
  altQuestion?: QuizQuestion;
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

/** Per-concept learning history driving the spaced-repetition Review deck. */
export interface SectionStat {
  seen: number;
  missed: number;
  /** Consecutive correct answers; indexes the review-interval ladder. */
  streak: number;
  lastSeenISO: string;
  nextReviewISO: string;
}

/** v4+: a module's Mastery Test standing (10 Qs drawn from its bank, ≥80%). */
export interface MasteryRecord {
  passed: boolean;
  /** Best Mastery-Test score, 0..1. */
  bestScore: number;
  attempts: number;
  lastAttemptISO?: string;
}

/**
 * v4+: state of the Herculean Test — the parallel final that unlocks once
 * every pillar (and the foundation) is built. Sits alongside the pediment, not
 * gating it.
 */
export interface HerculeanState {
  passed: boolean;
  /** Best Herculean score, 0..1. */
  bestScore: number;
  attempts: number;
  /** "<nodeId>/<sectionIndex>" keys missed on the last failed run — the side-quest targets. */
  weakAreas: string[];
  /** Epoch ms before which a retry is on cooldown after a failed run (optional). */
  cooldownUntil?: number;
}

export interface ProgressData {
  version: number;
  foundationCompleted: boolean;
  /** Ids of pillar nodes currently unlocked (or beyond). */
  unlockedPillars: string[];
  nodes: Record<string, ModuleNode>;
  /** v2+: keyed by "<nodeId>/<sectionIndex>". */
  sectionStats?: Record<string, SectionStat>;
  /** v3+: consecutive-day practice streak. */
  activity?: { streak: number; lastActiveDay: string };
  /** v4+: earned trophy ids — a mastered module's nodeId, plus "herculean". */
  trophies?: string[];
  /** v4+: per-module Mastery-Test records, keyed by nodeId. */
  mastery?: Record<string, MasteryRecord>;
  /** v4+: the Herculean final's state. */
  herculean?: HerculeanState;
}

/** Result of recording a Mastery-Test attempt (v4). */
export interface MasteryOutcome {
  progress: ProgressData;
  passed: boolean;
  /** Trophy id newly awarded by this attempt, or null if none/already had it. */
  awardedTrophy: string | null;
  /** Node ids the mastery pass just unlocked (the gate advancing the temple). */
  newlyUnlocked: string[];
}

export type ThemeName = "temple-dark" | "parchment";
export type OptionLabelStyle = "letters" | "numbers" | "none";

/** User preferences — persisted separately from progress in settings.json. */
export interface Settings {
  theme: ThemeName;
  /** User override; effective reduced motion is this OR the OS preference. */
  reducedMotion: boolean;
  /** Root font-size multiplier, clamped 0.8..1.4. */
  fontScale: number;
  optionLabels: OptionLabelStyle;
  /** Synthesized UI sound cues. */
  sound: boolean;
  /** First-run welcome shown yet? */
  introSeen: boolean;
}

/** One reviewable concept, resolved with display metadata. */
export interface ReviewDeckEntry {
  key: string;
  nodeId: string;
  sectionIndex: number;
  nodeTitle: string;
  heading: string;
  quizFile: string;
  due: boolean;
  missed: number;
  seen: number;
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
  recordSectionResult(
    nodeId: string,
    sectionIndex: number,
    correct: boolean
  ): Promise<void>;
  getReviewDeck(limit?: number): Promise<ReviewDeckEntry[]>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  /** Save a copy of progress via a file dialog. Resolves true if written. */
  exportProgress(): Promise<boolean>;
  /** Load progress from a chosen file; null if cancelled. Throws if invalid. */
  importProgress(): Promise<ProgressData | null>;
  windowControl(action: "minimize" | "maximize" | "close"): void;
  /** Open an http(s) URL in the browser (validated in main); false on failure. */
  openExternal(url: string): Promise<boolean>;
  /** Record a Mastery-Test attempt; may award the module's trophy. */
  recordMasteryResult(nodeId: string, score: number): Promise<MasteryOutcome>;
  onMaximizeChange(cb: (isMaximized: boolean) => void): void;
  /** True when running under the headless smoke check (suppress dialogs). */
  isSmoke: boolean;
}
