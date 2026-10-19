/**
 * The leaderboard's rules. Pure, so they're unit-tested and shared by the
 * Server Actions and the page.
 *
 * Members are ranked by their return since joining: their account's total
 * value now ÷ its value when they joined, minus 1. That compares everyone
 * fairly whatever they started with ($10,000 cash or the starter portfolio),
 * and needs no history beyond one number saved when they join.
 */
import type { Holding } from "./types";

export const NAME_LIMITS = { min: 3, max: 24 };

/** Letters, numbers, spaces, - and _: nothing that could pass for a link or markup. */
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u;

/** A cleaned-up display name, or why it can't be used. */
export function checkDisplayName(input: unknown): { ok: true; name: string; key: string } | { ok: false; message: string } {
  if (typeof input !== "string") return { ok: false, message: "Choose a display name." };
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < NAME_LIMITS.min || name.length > NAME_LIMITS.max) {
    return { ok: false, message: `Display names are ${NAME_LIMITS.min} to ${NAME_LIMITS.max} characters.` };
  }
  if (!NAME.test(name)) return { ok: false, message: "Use letters, numbers, spaces, - and _ only." };
  if (name.includes("@")) return { ok: false, message: "Don't use an email address as your display name." };
  return { ok: true, name, key: name.toLocaleLowerCase("en-US") };
}

export interface Member {
  displayName: string;
  joinedAt: number;
  startValue: number;
  cash: number;
  holdings: Holding[];
}

export interface Standing {
  rank: number;
  displayName: string;
  value: number;
  /** Fraction: 0.12 = +12% since joining. */
  returnSinceJoining: number;
  daysOnBoard: number;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Members valued at today's prices and ranked, best return first (ties: the
 * longest-standing member first). A stock without a price right now counts at
 * what it cost, as everywhere else in the app.
 */
export function standings(members: readonly Member[], priceOf: (symbol: string) => number | undefined, now: number): Standing[] {
  const rows = members.map((m) => {
    const value = m.cash + m.holdings.reduce((sum, h) => sum + h.shares * (priceOf(h.symbol) ?? h.averageCost), 0);
    return {
      displayName: m.displayName,
      value,
      returnSinceJoining: m.startValue > 0 ? value / m.startValue - 1 : 0,
      daysOnBoard: Math.max(0, Math.floor((now - m.joinedAt) / DAY)),
      joinedAt: m.joinedAt,
    };
  });
  rows.sort((a, b) => b.returnSinceJoining - a.returnSinceJoining || a.joinedAt - b.joinedAt);
  return rows.map((row, i) => ({
    rank: i + 1,
    displayName: row.displayName,
    value: row.value,
    returnSinceJoining: row.returnSinceJoining,
    daysOnBoard: row.daysOnBoard,
  }));
}
