/**
 * Badges: what earns them, pure, so the rules are unit-tested. Once earned,
 * a badge is kept (lib/db/seasons.ts badge table), even if the reason later
 * changes (a lesson's quiz retried, a portfolio reset).
 */

export const BADGES = {
  "first-lesson": { label: "First lesson", detail: "Passed a lesson's quiz", icon: "📘" },
  "ten-lessons": { label: "Ten lessons", detail: "Passed ten lessons", icon: "📚" },
  "all-lessons": { label: "Every lesson", detail: "Passed every lesson", icon: "🎓" },
  "streak-7": { label: "Seven-day streak", detail: "Passed a lesson or traded on seven days in a row", icon: "🔥" },
  "season-finished": { label: "Finisher", detail: "Finished a season", icon: "🏁" },
  "season-top10": { label: "Top 10%", detail: "Finished a season in the top tenth", icon: "⭐" },
  "season-podium": { label: "Podium", detail: "Finished a season in the top three", icon: "🥉" },
  "season-winner": { label: "Winner", detail: "Won a season", icon: "🏆" },
} as const;

export type BadgeKind = keyof typeof BADGES;
export interface Earned {
  kind: BadgeKind;
  /** The season id for season badges, "" otherwise. */
  scope: string;
}

export const isBadgeKind = (value: unknown): value is BadgeKind => typeof value === "string" && Object.hasOwn(BADGES, value);

export function lessonBadges(passed: number, totalLessons: number): Earned[] {
  const out: Earned[] = [];
  if (passed >= 1) out.push({ kind: "first-lesson", scope: "" });
  if (passed >= 10) out.push({ kind: "ten-lessons", scope: "" });
  if (totalLessons > 0 && passed >= totalLessons) out.push({ kind: "all-lessons", scope: "" });
  return out;
}

const DAY = 86_400_000;

/** The longest run of consecutive UTC days among `times` (any order, duplicates fine). */
export function longestStreak(times: readonly number[]): number {
  const days = [...new Set(times.map((t) => Math.floor(t / DAY)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export const streakBadges = (activity: readonly number[]): Earned[] => (longestStreak(activity) >= 7 ? [{ kind: "streak-7", scope: "" }] : []);

/** A finished season's badges for placing `rank` of `entrants`. */
export function seasonBadges(seasonId: string, rank: number, entrants: number): Earned[] {
  const out: Earned[] = [{ kind: "season-finished", scope: seasonId }];
  // The top tenth, rounded up, so small seasons still have one; only once there are ten or more players, so it means something.
  if (entrants >= 10 && rank <= Math.ceil(entrants / 10)) out.push({ kind: "season-top10", scope: seasonId });
  if (entrants >= 3 && rank <= 3) out.push({ kind: "season-podium", scope: seasonId });
  if (entrants >= 2 && rank === 1) out.push({ kind: "season-winner", scope: seasonId });
  return out;
}

/** The badges to show next to a name: one of each kind, the most impressive first. */
export function badgeIcons(earned: readonly Earned[]): { kind: BadgeKind; count: number }[] {
  const order = Object.keys(BADGES).reverse() as BadgeKind[];
  const counts = new Map<BadgeKind, number>();
  for (const e of earned) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return order.filter((k) => counts.has(k)).map((kind) => ({ kind, count: counts.get(kind)! }));
}
