/**
 * The public standings, for the /leaderboard page. Server only. Cached for a
 * few minutes (and refreshed straight away when someone joins or leaves, by
 * the actions in ./leaderboard-actions.ts), so the page doesn't recompute
 * everyone's value on every visit.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { syncPrices } from "./analytics/server";
import { badgeIcons } from "./badges";
import { leaderboard, seasons } from "./db";
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
  const rows = await leaderboard.standings(source, Date.now());
  const badges = await seasons.badgesFor(rows.map((r) => r.userId));
  // The user's id stays on the server; the page gets their badges instead.
  return rows.map(({ userId, ...row }) => ({ ...row, badges: badgeIcons(badges.get(userId) ?? []) }));
}
