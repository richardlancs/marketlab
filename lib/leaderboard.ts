/**
 * The leaderboard's rules. Pure, so they're unit-tested and shared by the
 * Server Actions and the page.
 *
 * Members are ranked by their return since joining: their account's total
 * value now ÷ its value when they joined, minus 1. That compares everyone
 * fairly whatever they started with ($10,000 cash or the starter portfolio),
 * and needs no history beyond one number saved when they join. The valuing
 * and ranking itself is one SQL query (lib/db/leaderboard.ts standings).
 */

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

export interface Standing {
  rank: number;
  displayName: string;
  value: number;
  /** Fraction: 0.12 = +12% since joining. */
  returnSinceJoining: number;
  daysOnBoard: number;
}
