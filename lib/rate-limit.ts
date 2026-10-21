/**
 * A simple rate limit for work that costs server time (backtests, sweeps),
 * per visitor IP. Counts live in the database (Better Auth's `rate_limit`
 * table, under our own keys), because online each server instance has its
 * own memory: an in-memory count could be dodged by landing on another one.
 *
 * Fixed windows: up to `max` requests per `windowSeconds`, counted from the
 * first request in the window, in one atomic statement (lib/db/rate-limits.ts).
 */
import "server-only";
import { and, like, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "./db";
import { countRequest } from "./db/rate-limits";
import { rateLimit } from "./db/schema";

/** The visitor's IP as the hosting platform reports it ("local" in development). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/** Counts one request against `name`'s limit for this visitor. Returns false if they're over it. */
export async function allow(name: string, max: number, windowSeconds: number): Promise<boolean> {
  return countRequest(db, `marketlab:${name}:${await clientIp()}`, max, windowSeconds * 1000, Date.now());
}

/** Deletes this app's counters whose window started before `before` (the daily job keeps the table small). */
export async function pruneRateLimits(before: number) {
  await db.delete(rateLimit).where(and(like(rateLimit.key, "marketlab:%"), lt(rateLimit.lastRequest, before)));
}
