/**
 * The public standings, for the /leaderboard page. Server only. Cached for a
 * few minutes (and refreshed straight away when someone joins or leaves, by
 * the actions in ./leaderboard-actions.ts), so the page doesn't recompute
 * everyone's value on every visit.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { syncPrices } from "./analytics/server";
import { leaderboard } from "./db";
import type { Standing } from "./leaderboard";
import { priceSource } from "./market";

export const LEADERBOARD_TAG = "leaderboard";

export async function getStandings(): Promise<Standing[]> {
  "use cache";
  cacheTag(LEADERBOARD_TAG);
  cacheLife("minutes");
  const source = priceSource();
  // The daily job stores every catalog stock; a member may also hold another ticker (real data), so store it first.
  const missing = await leaderboard.unpricedSymbols(source);
  if (missing.length) await syncPrices(missing);
  return leaderboard.standings(source, Date.now());
}
