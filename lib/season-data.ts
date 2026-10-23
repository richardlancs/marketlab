/**
 * A season's public board, for the season pages. Server only. Cached for a
 * few minutes and refreshed at once when someone joins or the season closes
 * (SEASON_TAG). Only display names are shown; owners' and portfolios' ids
 * never leave the server.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { badgeIcons, type BadgeKind } from "./badges";
import { seasons } from "./db";
import type { EntryHoldings } from "./db/seasons";
import { getMarket } from "./market";
import { canJoin, daysLeft, rank, seasonReturn } from "./seasons";

export const SEASON_TAG = "seasons";

export interface BoardRow {
  rank: number;
  displayName: string;
  /** The name in lower case: the entry's address (/leaderboard/season/[id]/[name]). */
  nameKey: string;
  value: number;
  /** Fraction: 0.12 = +12% since the start. */
  return: number;
  joinedAt: number;
  badges: { kind: BadgeKind; count: number }[];
}

export interface SeasonBoard {
  id: string;
  status: "upcoming" | "open" | "running" | "closed";
  entrants: number;
  daysLeft: number;
  rows: BoardRow[];
  /** Value at each recorded close for the top ten, by display name. */
  race: { displayName: string; points: { time: number; value: number }[] }[];
  /** When the values were worked out. */
  asOf: number;
}

/** Each entry's value: final once closed; otherwise cash plus holdings at today's prices (at cost where there's none). */
export function valueEntries(entries: EntryHoldings[], prices: ReadonlyMap<string, number>) {
  return entries.map((e) => ({
    ...e,
    value: e.finalValue ?? e.cash + e.holdings.reduce((sum, h) => sum + h.shares * (prices.get(h.symbol) ?? h.averageCost), 0),
  }));
}

/** The board, cached for a few minutes: for the season page. */
export async function getSeasonBoard(id: string): Promise<SeasonBoard> {
  "use cache";
  cacheTag(SEASON_TAG);
  cacheLife("minutes");
  return loadSeasonBoard(id);
}

/**
 * The board, read now. For a player's own page and its share image: they're
 * opened right after joining, when a cached board may not have them yet.
 */
export async function loadSeasonBoard(id: string): Promise<SeasonBoard> {
  const now = Date.now();
  const [row, entries, market] = await Promise.all([seasons.get(id), seasons.entriesWithHoldings(id), getMarket()]);
  const prices = new Map(market.stocks.map((s) => [s.symbol, s.price]));
  const closed = row?.closedAt != null;
  const valued = valueEntries(entries, prices);
  const ranked = closed ? [...valued].sort((a, b) => (a.finalRank ?? 0) - (b.finalRank ?? 0)).map((e) => ({ ...e, rank: e.finalRank ?? 0 })) : rank(valued);
  const badges = await seasons.badgesFor([...new Set(entries.map((e) => e.userId))]);
  const top = ranked.slice(0, 10);
  const history = await seasons.history(id, top.map((e) => e.accountId));

  return {
    id,
    status: closed ? "closed" : canJoin(id, now) ? "open" : now < Date.parse(`${id}-01T00:00:00Z`) ? "upcoming" : "running",
    entrants: entries.length,
    daysLeft: daysLeft(id, now),
    rows: ranked.map((e) => ({
      rank: e.rank,
      displayName: e.displayName,
      nameKey: e.displayName.toLocaleLowerCase("en-US"),
      value: e.value,
      return: seasonReturn(e.value, e.startValue),
      joinedAt: e.joinedAt,
      badges: badgeIcons(badges.get(e.userId) ?? []),
    })),
    race: top.map((e) => ({ displayName: e.displayName, points: history.get(e.accountId) ?? [] })),
    asOf: now,
  };
}

export async function getSeasonList() {
  "use cache";
  cacheTag(SEASON_TAG);
  cacheLife("minutes");
  return seasons.list();
}
