/**
 * Leaderboard membership in the database. Joining stores a display name and
 * the account's value at that moment; leaving deletes the row. Nothing else
 * about a user (email, trades) is ever read for the public list beyond their
 * cash and holdings, which value their entry.
 */
import { eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Member } from "../leaderboard";
import * as schema from "./schema";
import { writeTransaction } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;
const { leaderboardEntry, portfolio, holding } = schema;

export function createLeaderboardRepository(db: Db) {
  return {
    /** The user's entry, or null if they aren't on the board. */
    async get(userId: string) {
      const [row] = await db.select().from(leaderboardEntry).where(eq(leaderboardEntry.userId, userId));
      return row ? { displayName: row.displayName, joinedAt: row.joinedAt, startValue: row.startValue } : null;
    },

    /** Joins, or explains why not: the name is taken, or they're already on it. */
    join: (userId: string, entry: { displayName: string; nameKey: string; joinedAt: number; startValue: number }) =>
      writeTransaction(db, async (tx): Promise<"joined" | "taken" | "member"> => {
        const [mine] = await tx.select().from(leaderboardEntry).where(eq(leaderboardEntry.userId, userId));
        if (mine) return "member";
        const [other] = await tx.select().from(leaderboardEntry).where(eq(leaderboardEntry.nameKey, entry.nameKey));
        if (other) return "taken";
        await tx.insert(leaderboardEntry).values({ userId, ...entry });
        return "joined";
      }),

    async leave(userId: string): Promise<void> {
      await db.delete(leaderboardEntry).where(eq(leaderboardEntry.userId, userId));
    },

    /** Every member with what values their entry: cash and holdings. */
    async members(): Promise<Member[]> {
      const entries = await db.select().from(leaderboardEntry);
      if (entries.length === 0) return [];
      const ids = entries.map((e) => e.userId);
      const [cash, holdings] = await Promise.all([
        db.select({ userId: portfolio.userId, cash: portfolio.cash }).from(portfolio).where(inArray(portfolio.userId, ids)),
        db.select().from(holding).where(inArray(holding.userId, ids)),
      ]);
      const cashOf = new Map(cash.map((c) => [c.userId, c.cash]));
      return entries.map((e) => ({
        displayName: e.displayName,
        joinedAt: e.joinedAt,
        startValue: e.startValue,
        cash: cashOf.get(e.userId) ?? 0,
        holdings: holdings.filter((h) => h.userId === e.userId).map(({ symbol, shares, averageCost }) => ({ symbol, shares, averageCost })),
      }));
    },
  };
}

export type LeaderboardRepository = ReturnType<typeof createLeaderboardRepository>;
