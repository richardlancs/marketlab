/**
 * Monthly competitions: the rules, pure, so they're unit-tested and shared by
 * the actions, the daily job and the pages.
 *
 * - A season is a calendar month (UTC), named by its id: "2026-11".
 * - Joining gives a separate portfolio with STARTING_CASH, during the first
 *   JOIN_DAYS days. Everyone starts with the same money, so total value
 *   ranks them; ties go to whoever joined first.
 * - It ends with the month: the daily job freezes the standings at the
 *   season's last close, once the market's latest close is in a later month.
 */

export const STARTING_CASH = 100_000;
export const JOIN_DAYS = 7;
const DAY = 86_400_000;

export const seasonIdOf = (time: number) => new Date(time).toISOString().slice(0, 7);

const ID = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const isSeasonId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

/** The month's first moment and the next month's (exclusive), in ms. */
export function seasonBounds(id: string): { start: number; end: number } {
  const [, y, m] = ID.exec(id)!;
  return { start: Date.UTC(Number(y), Number(m) - 1, 1), end: Date.UTC(Number(y), Number(m), 1) };
}

export const joinDeadline = (id: string) => seasonBounds(id).start + JOIN_DAYS * DAY;
export const canJoin = (id: string, now: number) => now >= seasonBounds(id).start && now < joinDeadline(id);
export const previousSeasonId = (id: string) => seasonIdOf(seasonBounds(id).start - 1);

/** "November 2026", or just "November" with `short`. */
export function seasonLabel(id: string, { short = false } = {}): string {
  return new Date(seasonBounds(id).start).toLocaleDateString("en-US", { month: "long", ...(short ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** Whole days until the season ends (0 on its last day). */
export const daysLeft = (id: string, now: number) => Math.max(0, Math.ceil((seasonBounds(id).end - now) / DAY) - 1);

export interface Contender {
  accountId: string;
  joinedAt: number;
  value: number;
}

/** Ranks by value, best first; a tie goes to whoever joined first. 1-based. */
export function rank<T extends Contender>(entries: readonly T[]): (T & { rank: number })[] {
  return [...entries].sort((a, b) => b.value - a.value || a.joinedAt - b.joinedAt).map((e, i) => ({ ...e, rank: i + 1 }));
}

export const seasonReturn = (value: number, startValue = STARTING_CASH) => (startValue > 0 ? value / startValue - 1 : 0);

/** What the daily job should do about a season, given the market's latest close. */
export function seasonDue(id: string, latestClose: number, now: number, flags: { closedAt: number | null; announcedAt: number | null; remindedAt: number | null }) {
  const current = seasonIdOf(latestClose);
  return {
    /** Record standings: the latest close is in this season, and it's still running. */
    record: current === id && flags.closedAt === null,
    /** Close: the market has moved on to a later month. */
    close: current > id && flags.closedAt === null,
    /** The "season is open" notice, during its joining window. */
    announce: flags.announcedAt === null && canJoin(id, now),
    /** The "3 days left" reminder. */
    remind: flags.remindedAt === null && flags.closedAt === null && now >= seasonBounds(id).start && daysLeft(id, now) <= 3 && now < seasonBounds(id).end,
  };
}

/** The words for each season notification (push and email). */
export const seasonMessages = {
  open: (id: string) => ({
    title: `The ${seasonLabel(id, { short: true })} season is open`,
    body: `Start fresh with $100,000 and see how you rank. Join by ${new Date(joinDeadline(id) - 1).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}.`,
    url: `/leaderboard/season/${id}`,
  }),
  reminder: (id: string, place: number, of: number) => ({
    title: `${seasonLabel(id, { short: true })} season: 3 days left`,
    body: `You're #${place} of ${of}.`,
    url: `/leaderboard/season/${id}`,
  }),
  result: (id: string, place: number, of: number, value: number) => ({
    title: `${seasonLabel(id, { short: true })} season over`,
    body: `You finished #${place} of ${of}, at ${value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`,
    url: `/leaderboard/season/${id}`,
  }),
};
