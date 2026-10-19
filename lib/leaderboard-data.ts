/**
 * The public standings, for the /leaderboard page. Server only. Cached for a
 * few minutes (and refreshed straight away when someone joins or leaves, by
 * the actions in ./leaderboard-actions.ts), so the page doesn't recompute
 * everyone's value on every visit.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { leaderboard } from "./db";
import { standings, type Standing } from "./leaderboard";
import { getStockDetail } from "./market";

export const LEADERBOARD_TAG = "leaderboard";

export async function getStandings(): Promise<Standing[]> {
  "use cache";
  cacheTag(LEADERBOARD_TAG);
  cacheLife("minutes");
  const members = await leaderboard.members();
  const symbols = [...new Set(members.flatMap((m) => m.holdings.map((h) => h.symbol)))];
  const details = await Promise.all(symbols.map(getStockDetail));
  const prices = new Map(symbols.flatMap((s, i) => (details[i]?.status === "ok" ? [[s, details[i].stock.price] as const] : [])));
  return standings(members, (s) => prices.get(s), Date.now());
}
