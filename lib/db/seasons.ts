/**
 * Seasons in the database (rules in lib/seasons.ts, badges in lib/badges.ts).
 *
 * Joining creates a hidden user row (user.season_of = the owner) holding the
 * season's portfolio, so every account repository works on it unchanged,
 * and an entry with the public display name. The daily job records each
 * entry's value at every close, and closes the season with final values and
 * ranks. Badges are stored once earned.
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { BadgeKind, Earned } from "../badges";
import { STARTING_CASH, seasonBounds } from "../seasons";
import type { Account } from "../trading";
import type { Holding } from "../types";
import { readAccount, writeAccount } from "./accounts";
import * as schema from "./schema";
import { writeTransaction } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;
const { user, season, seasonEntry, seasonStanding, badge, portfolio, holding, trade, learner, lessonProgress } = schema;

export interface EntryRow {
  seasonId: string;
  userId: string;
  accountId: string;
  displayName: string;
  joinedAt: number;
  startValue: number;
  finalValue: number | null;
  finalRank: number | null;
  /** When the season closed; null while it runs. */
  closedAt: number | null;
}

/** An entry's portfolio contents, for valuing it at today's prices. */
export interface EntryHoldings extends EntryRow {
  cash: number;
  holdings: Holding[];
}

const entryColumns = {
  seasonId: seasonEntry.seasonId,
  userId: seasonEntry.userId,
  accountId: seasonEntry.accountId,
  displayName: seasonEntry.displayName,
  joinedAt: seasonEntry.joinedAt,
  startValue: seasonEntry.startValue,
  finalValue: seasonEntry.finalValue,
  finalRank: seasonEntry.finalRank,
  closedAt: season.closedAt,
};

/** A season portfolio: $100,000 in cash, nothing else (the watchlist and alerts stay with the owner's own account). */
export const seasonAccount = (): Account => ({ cash: STARTING_CASH, holdings: [], watchlist: [], trades: [] });

export function createSeasonRepository(db: Db) {
  const transaction = <T>(fn: Parameters<typeof writeTransaction<T>>[1]) => writeTransaction(db, fn);

  return {
    async ensure(id: string, now: number) {
      await db.insert(season).values({ id, createdAt: now }).onConflictDoNothing();
    },

    async get(id: string) {
      const [row] = await db.select().from(season).where(eq(season.id, id));
      return row ?? null;
    },

    /** Seasons that haven't been closed yet. */
    open: () => db.select().from(season).where(isNull(season.closedAt)),

    /** Every season with entrants, newest first, with how many joined. */
    async list() {
      const rows = await db
        .select({ id: season.id, closedAt: season.closedAt, entrants: sql<number>`count(${seasonEntry.userId})` })
        .from(season)
        .leftJoin(seasonEntry, eq(seasonEntry.seasonId, season.id))
        .groupBy(season.id)
        .orderBy(desc(season.id));
      const winners = await db
        .select({ seasonId: seasonEntry.seasonId, displayName: seasonEntry.displayName, finalValue: seasonEntry.finalValue })
        .from(seasonEntry)
        .where(eq(seasonEntry.finalRank, 1));
      const winnerOf = new Map(winners.map((w) => [w.seasonId, w]));
      return rows.map((r) => ({ ...r, entrants: Number(r.entrants), winner: winnerOf.get(r.id) ?? null }));
    },

    /**
     * Joins `ownerId` to the season with a fresh portfolio. Refuses if they're
     * already in it ("member") or someone has the name ("taken").
     */
    join: (ownerId: string, seasonId: string, entry: { displayName: string; nameKey: string }, now: number) =>
      transaction(async (tx): Promise<{ status: "joined" | "member" | "taken"; accountId?: string }> => {
        const [mine] = await tx.select().from(seasonEntry).where(and(eq(seasonEntry.seasonId, seasonId), eq(seasonEntry.userId, ownerId)));
        if (mine) return { status: "member", accountId: mine.accountId };
        const [other] = await tx.select().from(seasonEntry).where(and(eq(seasonEntry.seasonId, seasonId), eq(seasonEntry.nameKey, entry.nameKey)));
        if (other) return { status: "taken" };
        const accountId = crypto.randomUUID();
        // ".invalid" is reserved for addresses that can never receive mail.
        await tx.insert(user).values({ id: accountId, name: "Season portfolio", email: `season-${accountId}@season.invalid`, seasonOf: ownerId, createdAt: new Date(now), updatedAt: new Date(now) });
        await writeAccount(tx, accountId, seasonAccount());
        await tx.insert(season).values({ id: seasonId, createdAt: now }).onConflictDoNothing();
        await tx.insert(seasonEntry).values({ seasonId, userId: ownerId, accountId, displayName: entry.displayName, nameKey: entry.nameKey, joinedAt: now, startValue: STARTING_CASH });
        return { status: "joined", accountId };
      }),

    /** The owner's entry in a season, or null. */
    async entryOf(ownerId: string, seasonId: string): Promise<EntryRow | null> {
      const [row] = await db
        .select(entryColumns)
        .from(seasonEntry)
        .innerJoin(season, eq(season.id, seasonEntry.seasonId))
        .where(and(eq(seasonEntry.seasonId, seasonId), eq(seasonEntry.userId, ownerId)));
      return row ?? null;
    },

    /** The entry whose portfolio is `accountId`, if `ownerId` owns it. */
    async entryByAccount(ownerId: string, accountId: string): Promise<EntryRow | null> {
      const [row] = await db
        .select(entryColumns)
        .from(seasonEntry)
        .innerJoin(season, eq(season.id, seasonEntry.seasonId))
        .where(and(eq(seasonEntry.accountId, accountId), eq(seasonEntry.userId, ownerId)));
      return row ?? null;
    },

    /** The owner's entries, newest season first. */
    entriesOf: (ownerId: string, limit = 12): Promise<EntryRow[]> =>
      db.select(entryColumns).from(seasonEntry).innerJoin(season, eq(season.id, seasonEntry.seasonId)).where(eq(seasonEntry.userId, ownerId)).orderBy(desc(seasonEntry.seasonId)).limit(limit),

    /** Every entry in the season with its cash and holdings (two queries, however many entrants). */
    async entriesWithHoldings(seasonId: string): Promise<EntryHoldings[]> {
      const entries = await db
        .select({ ...entryColumns, cash: portfolio.cash })
        .from(seasonEntry)
        .innerJoin(season, eq(season.id, seasonEntry.seasonId))
        .leftJoin(portfolio, eq(portfolio.userId, seasonEntry.accountId))
        .where(eq(seasonEntry.seasonId, seasonId));
      if (entries.length === 0) return [];
      const held = await db
        .select({ userId: holding.userId, symbol: holding.symbol, shares: holding.shares, averageCost: holding.averageCost })
        .from(holding)
        .where(inArray(holding.userId, entries.map((e) => e.accountId)));
      const byAccount = Map.groupBy(held, (h) => h.userId);
      return entries.map((e) => ({
        ...e,
        cash: e.cash ?? e.startValue,
        holdings: (byAccount.get(e.accountId) ?? []).map(({ symbol, shares, averageCost }) => ({ symbol, shares, averageCost })),
      }));
    },

    /** Stores each entry's value at the close `time` (again at the same close replaces it). */
    async recordStandings(time: number, values: { accountId: string; value: number }[]) {
      if (values.length === 0) return;
      await db
        .insert(seasonStanding)
        .values(values.map((v) => ({ ...v, time })))
        .onConflictDoUpdate({ target: [seasonStanding.accountId, seasonStanding.time], set: { value: sql`excluded.value` } });
    },

    /** Each account's recorded values within the season, oldest first. */
    async history(seasonId: string, accountIds: string[]): Promise<Map<string, { time: number; value: number }[]>> {
      if (accountIds.length === 0) return new Map();
      const { start, end } = seasonBounds(seasonId);
      const rows = await db
        .select()
        .from(seasonStanding)
        .where(and(inArray(seasonStanding.accountId, accountIds), gte(seasonStanding.time, start), lt(seasonStanding.time, end)))
        .orderBy(seasonStanding.time);
      return new Map([...Map.groupBy(rows, (r) => r.accountId)].map(([id, list]) => [id, list.map(({ time, value }) => ({ time, value }))]));
    },

    /** Each entry's last recorded value within the season (what it closes on). */
    async lastValues(seasonId: string): Promise<Map<string, number>> {
      const { start, end } = seasonBounds(seasonId);
      const rows = await db.run(sql`
        select s.account_id, s.value from season_standing s
        join season_entry e on e.account_id = s.account_id and e.season_id = ${seasonId}
        where s.time = (select max(time) from season_standing t where t.account_id = s.account_id and t.time >= ${start} and t.time < ${end})`);
      return new Map(rows.rows.map((r) => [String(r.account_id), Number(r.value)]));
    },

    /** Freezes the final standings. */
    close: (seasonId: string, finals: { accountId: string; value: number; rank: number }[], now: number) =>
      transaction(async (tx) => {
        for (const f of finals) {
          await tx.update(seasonEntry).set({ finalValue: f.value, finalRank: f.rank }).where(and(eq(seasonEntry.seasonId, seasonId), eq(seasonEntry.accountId, f.accountId)));
        }
        await tx.update(season).set({ closedAt: now }).where(eq(season.id, seasonId));
      }),

    async markAnnounced(seasonId: string, now: number) {
      await db.update(season).set({ announcedAt: now }).where(eq(season.id, seasonId));
    },

    async markReminded(seasonId: string, now: number) {
      await db.update(season).set({ remindedAt: now }).where(eq(season.id, seasonId));
    },

    /** Who entered a season (to tell them the next one is open). */
    async ownersOf(seasonId: string): Promise<string[]> {
      const rows = await db.select({ userId: seasonEntry.userId }).from(seasonEntry).where(eq(seasonEntry.seasonId, seasonId));
      return rows.map((r) => r.userId);
    },

    /** Stores badges; ones already earned are left as they were. */
    async award(userId: string, earned: Earned[], now: number) {
      if (earned.length) await db.insert(badge).values(earned.map((e) => ({ userId, ...e, earnedAt: now }))).onConflictDoNothing();
    },

    async badgesOf(userId: string): Promise<{ kind: BadgeKind; scope: string; earnedAt: number }[]> {
      const rows = await db.select().from(badge).where(eq(badge.userId, userId)).orderBy(badge.earnedAt);
      return rows.map(({ kind, scope, earnedAt }) => ({ kind: kind as BadgeKind, scope, earnedAt }));
    },

    async badgesFor(userIds: string[]): Promise<Map<string, Earned[]>> {
      if (userIds.length === 0) return new Map();
      const rows = await db.select().from(badge).where(inArray(badge.userId, userIds));
      return new Map([...Map.groupBy(rows, (r) => r.userId)].map(([id, list]) => [id, list.map(({ kind, scope }) => ({ kind: kind as BadgeKind, scope }))]));
    },

    /**
     * When the user did something that counts towards a streak since `since`:
     * trades in their own and their season portfolios, and lessons passed.
     */
    async activity(userId: string, since: number): Promise<number[]> {
      const accounts = db.select({ id: user.id }).from(user).where(eq(user.seasonOf, userId));
      const trades = await db
        .select({ time: trade.time })
        .from(trade)
        .where(and(gte(trade.time, since), sql`(${trade.userId} = ${userId} or ${trade.userId} in ${accounts})`));
      const passes = await db
        .select({ time: lessonProgress.passedAt })
        .from(lessonProgress)
        .innerJoin(learner, eq(learner.id, lessonProgress.learnerId))
        .where(and(eq(learner.userId, userId), isNotNull(lessonProgress.passedAt), gte(lessonProgress.passedAt, since)));
      return [...trades.map((t) => t.time), ...passes.map((p) => p.time as number)];
    },

    /** How many lessons the user has passed. */
    async lessonsPassed(userId: string): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)` })
        .from(lessonProgress)
        .innerJoin(learner, eq(learner.id, lessonProgress.learnerId))
        .where(and(eq(learner.userId, userId), isNotNull(lessonProgress.passedAt)));
      return Number(row?.n ?? 0);
    },

    /** The season portfolio's account, read directly (for tests and the close). */
    account: (accountId: string) => readAccount(db, accountId),
  };
}

export type SeasonRepository = ReturnType<typeof createSeasonRepository>;
