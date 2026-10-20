/**
 * A simple rate limit for work that costs server time (backtests, sweeps),
 * per visitor IP. Counts live in the database (Better Auth's `rate_limit`
 * table, under our own keys), because online each server instance has its
 * own memory: an in-memory count could be dodged by landing on another one.
 *
 * Fixed windows: up to `max` requests per `windowSeconds`, counted from the
 * first request in the window.
 */
import "server-only";
import { and, eq, like, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "./db";
import { rateLimit } from "./db/schema";
import { writeTransaction } from "./db/transaction";

/** The visitor's IP as the hosting platform reports it ("local" in development). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/** Counts one request against `name`'s limit for this visitor. Returns false if they're over it. */
export async function allow(name: string, max: number, windowSeconds: number): Promise<boolean> {
  const key = `marketlab:${name}:${await clientIp()}`;
  const now = Date.now();
  return writeTransaction(db, async (tx) => {
    const [row] = await tx.select().from(rateLimit).where(eq(rateLimit.key, key));
    if (!row) {
      await tx.insert(rateLimit).values({ id: crypto.randomUUID(), key, count: 1, lastRequest: now });
      return true;
    }
    // Better Auth's column is "lastRequest"; here it marks the start of the current window.
    if (now - row.lastRequest >= windowSeconds * 1000) {
      await tx.update(rateLimit).set({ count: 1, lastRequest: now }).where(eq(rateLimit.key, key));
      return true;
    }
    if (row.count >= max) return false;
    await tx.update(rateLimit).set({ count: row.count + 1 }).where(eq(rateLimit.key, key));
    return true;
  });
}

/** Deletes this app's counters whose window started before `before` (the daily job keeps the table small). */
export async function pruneRateLimits(before: number) {
  await db.delete(rateLimit).where(and(like(rateLimit.key, "marketlab:%"), lt(rateLimit.lastRequest, before)));
}
