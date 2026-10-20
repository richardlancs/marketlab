/**
 * Saved backtests, for signed-in users and guests alike. Every query is filtered by the user's
 * ID, so one user can never read or delete another's runs.
 */
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { MAX_SAVED_RUNS, parseSavedRun, type SavedRun } from "../backtest/config";
import { isSymbolFormat } from "../market/symbols";
import * as schema from "./schema";
import { writeTransaction, type Executor } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;
const { backtestRun } = schema;

/**
 * Hands one user's saved runs to another (a guest signing in), newest first,
 * up to the receiver's room under MAX_SAVED_RUNS. Runs that don't fit stay
 * with the sender, to be deleted with it. For use inside a transaction.
 */
export async function moveRuns(ex: Executor, fromUserId: string, toUserId: string) {
  const [{ total }] = await ex.select({ total: count() }).from(backtestRun).where(eq(backtestRun.userId, toUserId));
  const room = Math.max(0, MAX_SAVED_RUNS - total);
  if (room === 0) return;
  const ids = (await ex.select({ id: backtestRun.id }).from(backtestRun).where(eq(backtestRun.userId, fromUserId)).orderBy(desc(backtestRun.createdAt)).limit(room)).map((r) => r.id);
  if (ids.length) await ex.update(backtestRun).set({ userId: toUserId }).where(and(eq(backtestRun.userId, fromUserId), inArray(backtestRun.id, ids)));
}

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
