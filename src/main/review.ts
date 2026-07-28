/**
 * Spaced-repetition scheduling for the weak-spot Review deck (Feature B).
 *
 * SM-2-lite: each correct answer at review time pushes the next review
 * further out (1d -> 3d -> 7d -> 21d, then holding at 21d); a miss resets
 * the streak and brings the concept back in 1 day. Pure functions with time
 * injected — no Electron, no I/O — so the policy is unit-testable.
 */
import type { SectionStat } from "../types/schema";

/** Review intervals in days, indexed by consecutive-correct streak. */
export const INTERVALS_DAYS = [1, 3, 7, 21];

const DAY_MS = 24 * 60 * 60 * 1000;

export function freshStat(nowISO: string): SectionStat {
  return { seen: 0, missed: 0, streak: 0, lastSeenISO: nowISO, nextReviewISO: nowISO };
}

/** Apply one answer result to a stat, returning the updated stat. */
export function recordResult(
  stat: SectionStat | undefined,
  correct: boolean,
  nowISO: string
): SectionStat {
  const s: SectionStat = stat ? { ...s0(stat) } : freshStat(nowISO);
  s.seen += 1;
  if (correct) {
    const interval =
      INTERVALS_DAYS[Math.min(s.streak, INTERVALS_DAYS.length - 1)];
    s.streak += 1;
    s.nextReviewISO = new Date(Date.parse(nowISO) + interval * DAY_MS).toISOString();
  } else {
    s.missed += 1;
    s.streak = 0;
    s.nextReviewISO = new Date(Date.parse(nowISO) + 1 * DAY_MS).toISOString();
  }
  s.lastSeenISO = nowISO;
  return s;
}

/** Defensive copy that tolerates older saves missing newer fields. */
function s0(stat: SectionStat): SectionStat {
  return {
    seen: stat.seen ?? 0,
    missed: stat.missed ?? 0,
    streak: stat.streak ?? 0,
    lastSeenISO: stat.lastSeenISO ?? new Date(0).toISOString(),
    nextReviewISO: stat.nextReviewISO ?? new Date(0).toISOString(),
  };
}

export interface DeckCandidate {
  key: string;
  stat: SectionStat;
}

/**
 * Order candidates for review: due-date ascending (most overdue first);
 * ties broken by miss rate descending, then by least-recently-seen.
 */
export function orderDeck(candidates: DeckCandidate[]): DeckCandidate[] {
  return [...candidates].sort((a, b) => {
    const dueDiff = Date.parse(a.stat.nextReviewISO) - Date.parse(b.stat.nextReviewISO);
    if (dueDiff !== 0) return dueDiff;
    const missRate = (s: SectionStat) => (s.seen === 0 ? 0 : s.missed / s.seen);
    const rateDiff = missRate(b.stat) - missRate(a.stat);
    if (rateDiff !== 0) return rateDiff;
    return Date.parse(a.stat.lastSeenISO) - Date.parse(b.stat.lastSeenISO);
  });
}

export function isDue(stat: SectionStat, nowISO: string): boolean {
  return Date.parse(stat.nextReviewISO) <= Date.parse(nowISO);
}
