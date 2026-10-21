/**
 * Rate-limit counters (Better Auth's `rate_limit` table, under our own keys),
 * counted in one atomic statement: insert the counter, or bump it (starting a
 * new window if the old one is over), and read the result back. One round
 * trip, and no read-then-write race between two requests.
 */
import { sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "./schema";

type Db = LibSQLDatabase<typeof schema>;

/**
 * Counts one request for `key` in fixed windows of `windowMs`, counted from
 * the window's first request. Returns true while the count is within `max`.
 * The stored count stops at max + 1, so it says "over" without growing.
 */
export async function countRequest(db: Db, key: string, max: number, windowMs: number, now: number): Promise<boolean> {
  const result = await db.run(sql`
    insert into rate_limit (id, key, count, last_request) values (${crypto.randomUUID()}, ${key}, 1, ${now})
    on conflict (key) do update set
      -- Every expression here sees the row as it was, so both use the old window start.
      count = case when ${now} - rate_limit.last_request >= ${windowMs} then 1 else min(rate_limit.count + 1, ${max + 1}) end,
      last_request = case when ${now} - rate_limit.last_request >= ${windowMs} then ${now} else rate_limit.last_request end
    returning count`);
  return Number(result.rows[0]?.count) <= max;
}
