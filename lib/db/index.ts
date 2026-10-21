/**
 * The app's database connection. "server-only" makes the build fail if this
 * is ever imported into code that runs in the browser.
 */
import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { createAccountRepository } from "./accounts";
import { createAlertEmailRepository } from "./alert-emails";
import { createBacktestRepository } from "./backtests";
import { createFundamentalsRepository } from "./fundamentals";
import { createGuestRepository } from "./guests";
import { createJobRepository } from "./jobs";
import { createLearningRepository } from "./learning";
import { createLeaderboardRepository } from "./leaderboard";
import { createPriceRepository } from "./prices";
import * as schema from "./schema";

/**
 * In development this is a file next to the project (local.db, git-ignored).
 * Online, set DATABASE_URL to a Turso database URL (libsql://…) and
 * DATABASE_AUTH_TOKEN to its token.
 */
const client = createClient({
  url: process.env.DATABASE_URL ?? "file:local.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
  // Local files only: when another request holds the write lock, wait up to
  // 5 seconds instead of failing at once with SQLITE_BUSY. Turso ignores it.
  timeout: 5000,
});

export const db = drizzle(client, { schema });
export const accounts = createAccountRepository(db);
export const backtests = createBacktestRepository(db);
export const leaderboard = createLeaderboardRepository(db);
export const learning = createLearningRepository(db);
export const guests = createGuestRepository(db);
export const prices = createPriceRepository(db);
export const jobs = createJobRepository(db);
export const alertEmails = createAlertEmailRepository(db);
export const fundamentals = createFundamentalsRepository(db);
