/**
 * Variant-pool normalization and selection (Feature A, master prompt §2).
 *
 * Pure functions — no DOM, no IPC — so the policy is unit-testable.
 */
import type { LessonSection, QuizQuestion } from "../types/schema.js";

/**
 * Canonical view of a section's question pool. Bridges the legacy
 * question/altQuestion shape so old data files keep working.
 */
export function sectionVariants(section: LessonSection): QuizQuestion[] {
  if (section.variants && section.variants.length > 0) return section.variants;
  const legacy: QuizQuestion[] = [];
  if (section.question) legacy.push(section.question);
  if (section.altQuestion) legacy.push(section.altQuestion);
  return legacy;
}

export type VariantMode = "graded" | "redeem" | "practice";

export interface VariantContext {
  mode: VariantMode;
  /** Variant ids already shown (this attempt for redeem; this bag-cycle for practice). */
  usedIds?: ReadonlySet<string>;
  /** Random source for practice mode; defaults to Math.random. */
  rng?: () => number;
}

/**
 * Selection policy:
 *  - graded:   always variants[0] — the canonical bar is stable for everyone.
 *  - redeem:   the first variant not yet shown this attempt, so a missed
 *              concept is re-tested with a fresh scenario, never the same
 *              question. If the whole pool has been seen, the earliest
 *              non-canonical variant is reused (pool exhausted).
 *  - practice: uniform-random among unused (shuffle-bag). The caller clears
 *              its used set when the pool is exhausted, guaranteeing every
 *              variant appears once per cycle with no immediate repeats.
 */
export function pickVariant(
  section: LessonSection,
  ctx: VariantContext
): QuizQuestion {
  const pool = sectionVariants(section);
  if (pool.length === 0) {
    throw new Error(`Section "${section.heading}" has no question variants`);
  }
  const used = ctx.usedIds ?? new Set<string>();

  switch (ctx.mode) {
    case "graded":
      return pool[0];
    case "redeem": {
      const fresh = pool.find((q) => !used.has(q.id));
      return fresh ?? pool[Math.min(1, pool.length - 1)];
    }
    case "practice": {
      const unused = pool.filter((q) => !used.has(q.id));
      const candidates = unused.length > 0 ? unused : pool;
      const rng = ctx.rng ?? Math.random;
      return candidates[Math.floor(rng() * candidates.length) % candidates.length];
    }
  }
}
