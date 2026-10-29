/**
 * Leaderboard membership in the database. Joining stores a display name and
 * the account's value at that moment; leaving deletes the row. Nothing else
 * about a user (email, trades) is ever read for the public list beyond their
 * cash and holdings, which value their entry.
 */
import { eq, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Standing } from "../leaderboard";
import * as schema from "./schema";
import { writeTransaction } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;
const { leaderboardEntry, holding, priceSeries } = schema;
const DAY = 24 * 60 * 60 * 1000;

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

    /** Symbols members hold that the price store has no series for (to store before ranking). */
    async unpricedSymbols(source: string): Promise<string[]> {
      const rows = await db
        .selectDistinct({ symbol: holding.symbol })
        .from(holding)
        .innerJoin(leaderboardEntry, eq(leaderboardEntry.userId, holding.userId))
        .leftJoin(priceSeries, sql`${priceSeries.source} = ${source} and ${priceSeries.symbol} = ${holding.symbol}`)
        .where(sql`${priceSeries.symbol} is null`);
      return rows.map((r) => r.symbol);
    },

    /**
     * The standings, valued and ranked in one query: each holding at its
     * stock's latest stored close (from the price store, `source`), or at
     * what it cost if there's none (a short's shares are negative), plus
     * options at their marks and cash; best return since joining
     * first, ties to whoever joined first.
     */
    async standings(source: string, now: number): Promise<(Standing & { userId: string })[]> {
      const result = await db.run(sql`
        with valued as (
          select e.user_id, e.joined_at, e.display_name, e.start_value,
                 coalesce(p.cash, 0) + coalesce((
                   select sum(h.shares * coalesce((
                     -- This stock's latest stored close: price_series knows its last day, so it's two primary-key lookups.
                     select b.close
                     from price_series s
                     join daily_bar b on b.source = s.source and b.symbol = s.symbol and b.time = s.last_time
                     where s.source = ${source} and s.symbol = h.symbol
                   ), h.average_cost))
                   from holding h
                   where h.user_id = e.user_id
                 ), 0)
                 -- Options at their latest mark (100 shares a contract), or what was paid until there's one.
                 + coalesce((select sum(o.contracts * 100 * coalesce(o.mark, o.average_premium)) from option_position o where o.user_id = e.user_id), 0) as value
          from leaderboard_entry e
          left join portfolio p on p.user_id = e.user_id
        ),
        ranked as (
          select *, case when start_value > 0 then value / start_value - 1 else 0 end as return_since_joining from valued
        )
        select row_number() over (order by return_since_joining desc, joined_at) as rank,
               user_id, display_name, value, return_since_joining,
               max(0, (${now} - joined_at) / ${DAY}) as days_on_board
        from ranked
        order by rank`);
      return result.rows.map((r) => ({
        rank: Number(r.rank),
        userId: String(r.user_id),
        displayName: String(r.display_name),
        value: Number(r.value),
        returnSinceJoining: Number(r.return_since_joining),
        daysOnBoard: Math.floor(Number(r.days_on_board)),
      }));
    },
  };
}

export type LeaderboardRepository = ReturnType<typeof createLeaderboardRepository>;
