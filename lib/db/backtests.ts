/**
 * Saved backtests for signed-in users. Every query is filtered by the user's
 * ID, so one user can never read or delete another's runs.
 */
import { and, count, desc, eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { MAX_SAVED_RUNS, parseSavedRun, type SavedRun } from "../backtest/config";
import { isSymbolFormat } from "../market/symbols";
import * as schema from "./schema";
import { writeTransaction } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;
const { backtestRun } = schema;

export function createBacktestRepository(db: Db) {
  return {
    /**
     * The user's saved runs, newest first. Symbols are only checked for their
     * format, so a run on a stock missing from today's data still lists; rows
     * that are malformed are skipped.
     */
    async list(userId: string): Promise<SavedRun[]> {
      const rows = await db.select().from(backtestRun).where(eq(backtestRun.userId, userId)).orderBy(desc(backtestRun.createdAt));
      return rows
        .map((row) => {
          try {
            return parseSavedRun({ ...row, config: JSON.parse(row.config), summary: JSON.parse(row.summary) }, isSymbolFormat);
          } catch {
            return null;
          }
        })
        .filter((run): run is SavedRun => run !== null);
    },

    /** Saves a run; returns false (saving nothing) if the user already has the maximum. */
    save: (userId: string, run: SavedRun) =>
      writeTransaction(db, async (tx) => {
        const [{ total }] = await tx.select({ total: count() }).from(backtestRun).where(eq(backtestRun.userId, userId));
        if (total >= MAX_SAVED_RUNS) return false;
        await tx.insert(backtestRun).values({
          id: run.id,
          userId,
          name: run.name,
          config: JSON.stringify(run.config),
          summary: JSON.stringify(run.summary),
          createdAt: run.createdAt,
        });
        return true;
      }),

    /** Deletes one of the user's runs. Someone else's ID simply matches nothing. */
    async remove(userId: string, id: string): Promise<void> {
      await db.delete(backtestRun).where(and(eq(backtestRun.userId, userId), eq(backtestRun.id, id)));
    },
  };
}
