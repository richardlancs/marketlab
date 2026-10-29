"use server";

/**
 * Joining and leaving the leaderboard. Like every Server Action here: the
 * user comes from the session cookie, and every argument is validated. The
 * value saved at joining is computed here from the server's own prices.
 */
import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { auth } from "./auth";
import { accounts, leaderboard } from "./db";
import { checkDisplayName } from "./leaderboard";
import { LEADERBOARD_TAG } from "./leaderboard-data";
import { getStockDetail } from "./market";
import { summarizePortfolio } from "./portfolio";

export type Entry = { displayName: string; joinedAt: number; startValue: number };
export type LeaderboardResult = { ok: true; entry: Entry | null } | { ok: false; message: string };

async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

const SIGNED_OUT: LeaderboardResult = { ok: false, message: "Sign in to join the leaderboard." };

/** The signed-in user's entry, or null if they aren't on the board. */
export async function myLeaderboardEntryAction(): Promise<LeaderboardResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  return { ok: true, entry: await leaderboard.get(userId) };
}

export async function joinLeaderboardAction(name: unknown): Promise<LeaderboardResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  const checked = checkDisplayName(name);
  if (!checked.ok) return checked;
  const account = await accounts.load(userId);
  if (!account) return { ok: false, message: "Set up your account first." };

  const details = await Promise.all(account.holdings.map((h) => getStockDetail(h.symbol)));
  const quotes = details.flatMap((d) => (d?.status === "ok" ? [d.stock] : []));
  const startValue = summarizePortfolio(account.holdings, quotes, account.cash, account.options).totalValue;
  const entry = { displayName: checked.name, joinedAt: Date.now(), startValue };
  const result = await leaderboard.join(userId, { ...entry, nameKey: checked.key });
  if (result === "taken") return { ok: false, message: "That display name is taken. Try another." };
  if (result === "member") return { ok: true, entry: await leaderboard.get(userId) };
  updateTag(LEADERBOARD_TAG); // show the new member straight away
  return { ok: true, entry };
}

export async function leaveLeaderboardAction(): Promise<LeaderboardResult> {
  const userId = await currentUserId();
  if (!userId) return SIGNED_OUT;
  await leaderboard.leave(userId);
  updateTag(LEADERBOARD_TAG);
  return { ok: true, entry: null };
}
