/**
 * Saved backtests, for signed-in users and guests alike. Every query is filtered by the user's
 * ID, so one user can never read or delete another's runs.
 */
import { and, count, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { parseSavedScreen, parseScreenResult, type SavedScreen, type ScreenResult } from "../analytics/history";
import { MAX_SAVED_RUNS, parseSavedRun, type SavedRun, type StoredInfo } from "../backtest/config";
import { parseSnapshot, type PriceSnapshot } from "../backtest/snapshot";
import { parseStoredResult, type StoredResult } from "../backtest/stored";
import { parseMLResult, parseSavedMLRun, type MLResult, type SavedMLRun } from "../ml/types";
import { isSymbolFormat } from "../market/symbols";
import * as schema from "./schema";
import { writeTransaction, type Executor } from "./transaction";

type Db = LibSQLDatabase<typeof schema>;
const { backtestRun, priceSnapshot } = schema;

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

/** A saved run's full result and its input prices, saved with it (migration 0006). */
export interface StoredRun {
  result: StoredResult;
  snapshot: PriceSnapshot;
}

const listColumns = {
  id: backtestRun.id,
  name: backtestRun.name,
  config: backtestRun.config,
  summary: backtestRun.summary,
  createdAt: backtestRun.createdAt,
  engine: backtestRun.engine,
  engineVersion: backtestRun.engineVersion,
  dataSource: backtestRun.dataSource,
  simulated: backtestRun.simulated,
  datasetVersion: backtestRun.datasetVersion,
};

function toSavedRun(row: { [K in keyof typeof listColumns]: unknown }): SavedRun | null;
function toSavedRun(row: { [K in keyof typeof listColumns]: unknown }, parse: typeof parseSavedScreen): SavedScreen | null;
function toSavedRun(row: { [K in keyof typeof listColumns]: unknown }, parse: (value: unknown, isKnown: (symbol: string) => boolean) => SavedRun | SavedScreen | null = parseSavedRun) {
  let run: SavedRun | SavedScreen | null;
  try {
    run = parse({ ...row, config: JSON.parse(row.config as string), summary: JSON.parse(row.summary as string) }, isSymbolFormat);
  } catch {
    return null;
  }
  if (!run) return null;
  const stored: StoredInfo | undefined =
    typeof row.engine === "string" && typeof row.engineVersion === "string" && typeof row.dataSource === "string" && typeof row.datasetVersion === "string"
      ? { engine: { name: row.engine, version: row.engineVersion }, dataSource: row.dataSource, simulated: row.simulated === true, datasetVersion: row.datasetVersion }
      : undefined;
  return stored ? { ...run, stored } : run;
}

function toSavedML(row: { [K in keyof typeof listColumns]: unknown }): SavedMLRun | null {
  let run: SavedMLRun | null;
  try {
    run = parseSavedMLRun({ ...row, config: JSON.parse(row.config as string), summary: JSON.parse(row.summary as string) }, isSymbolFormat);
  } catch {
    return null;
  }
  if (!run) return null;
  return typeof row.engine === "string" && typeof row.engineVersion === "string" && typeof row.dataSource === "string" && typeof row.datasetVersion === "string"
    ? { ...run, stored: { engine: { name: row.engine, version: row.engineVersion }, dataSource: row.dataSource, simulated: row.simulated === true, datasetVersion: row.datasetVersion } }
    : run;
}

export function createBacktestRepository(db: Db) {
  return {
    /**
     * The user's saved runs, newest first, without their stored results
     * (which can be large: see `get`). Symbols are only checked for their
     * format, so a run on a stock missing from today's data still lists;
     * rows that are malformed are skipped.
     */
    async list(userId: string): Promise<SavedRun[]> {
      const rows = await db
        .select(listColumns)
        .from(backtestRun)
        .where(and(eq(backtestRun.userId, userId), eq(backtestRun.kind, "backtest")))
        .orderBy(desc(backtestRun.createdAt));
      return rows.map((row) => toSavedRun(row)).filter((run): run is SavedRun => run !== null);
    },

    /** The user's saved historical screens (lib/analytics/history.ts), newest first, without their results. */
    async listScreens(userId: string): Promise<SavedScreen[]> {
      const rows = await db
        .select(listColumns)
        .from(backtestRun)
        .where(and(eq(backtestRun.userId, userId), eq(backtestRun.kind, "historical-screen")))
        .orderBy(desc(backtestRun.createdAt));
      return rows.map((row) => toSavedRun(row, parseSavedScreen)).filter((run): run is SavedScreen => run !== null);
    },

    /** The user's saved machine-learning runs (lib/ml/types.ts), newest first, without their results. */
    async listML(userId: string): Promise<SavedMLRun[]> {
      const rows = await db
        .select(listColumns)
        .from(backtestRun)
        .where(and(eq(backtestRun.userId, userId), eq(backtestRun.kind, "ml")))
        .orderBy(desc(backtestRun.createdAt));
      return rows.map(toSavedML).filter((run): run is SavedMLRun => run !== null);
    },

    /** One of the user's saved machine-learning runs with its stored result (its prices stay in the database, for the analytics service). */
    async getML(userId: string, id: string): Promise<{ run: SavedMLRun; result: MLResult | null } | null> {
      const [row] = await db
        .select({ ...listColumns, result: backtestRun.result })
        .from(backtestRun)
        .where(and(eq(backtestRun.userId, userId), eq(backtestRun.id, id), eq(backtestRun.kind, "ml")));
      const run = row ? toSavedML(row) : null;
      if (!run) return null;
      let result: MLResult | null = null;
      try {
        result = row.result ? parseMLResult(JSON.parse(row.result)) : null;
      } catch {
        result = null;
      }
      return { run, result };
    },

    /**
     * One of the user's saved historical screens with its stored result.
     * Its input prices stay in the database: only the analytics service
     * reads them, to reproduce it.
     */
    async getScreen(userId: string, id: string): Promise<{ run: SavedScreen; result: ScreenResult | null } | null> {
      const [row] = await db
        .select({ ...listColumns, result: backtestRun.result })
        .from(backtestRun)
        .where(and(eq(backtestRun.userId, userId), eq(backtestRun.id, id), eq(backtestRun.kind, "historical-screen")));
      const run = row ? toSavedRun(row, parseSavedScreen) : null;
      if (!run) return null;
      let result: ScreenResult | null = null;
      try {
        result = row.result ? parseScreenResult(JSON.parse(row.result)) : null;
      } catch {
        result = null;
      }
      return { run, result };
    },

    /**
     * One of the user's saved runs, with its stored result and input prices
     * when it has them (null for runs saved before results were stored).
     * Someone else's ID finds nothing.
     */
    async get(userId: string, id: string): Promise<{ run: SavedRun; stored: StoredRun | null } | null> {
      const [row] = await db
        .select({ ...listColumns, result: backtestRun.result, snapshot: priceSnapshot.data })
        .from(backtestRun)
        .leftJoin(priceSnapshot, eq(priceSnapshot.checksum, backtestRun.snapshotChecksum))
        .where(and(eq(backtestRun.userId, userId), eq(backtestRun.id, id), eq(backtestRun.kind, "backtest")));
      if (!row) return null;
      const run = toSavedRun(row);
      if (!run) return null;
      let stored: StoredRun | null = null;
      try {
        const result = row.result ? parseStoredResult(JSON.parse(row.result)) : null;
        const snapshot = row.snapshot ? parseSnapshot(JSON.parse(row.snapshot)) : null;
        stored = result && snapshot ? { result, snapshot } : null;
      } catch {
        stored = null;
      }
      return { run, stored };
    },

    /**
     * Saves a run, with its full result and input prices when given. The
     * snapshot is stored once per checksum and shared. Returns false (saving
     * nothing) if the user already has the maximum.
     */
    save: (userId: string, run: SavedRun, stored?: StoredRun & { checksum: string }) =>
      writeTransaction(db, async (tx) => {
        const [{ total }] = await tx.select({ total: count() }).from(backtestRun).where(eq(backtestRun.userId, userId));
        if (total >= MAX_SAVED_RUNS) return false;
        if (stored) {
          await tx
            .insert(priceSnapshot)
            .values({ checksum: stored.checksum, data: JSON.stringify(stored.snapshot), source: stored.snapshot.source, simulated: stored.snapshot.simulated, asOf: stored.snapshot.asOf, createdAt: Date.now() })
            .onConflictDoNothing();
        }
        await tx.insert(backtestRun).values({
          id: run.id,
          userId,
          name: run.name,
          config: JSON.stringify(run.config),
          summary: JSON.stringify(run.summary),
          createdAt: run.createdAt,
          ...(stored && {
            result: JSON.stringify(stored.result),
            snapshotChecksum: stored.checksum,
            engine: stored.result.provenance.engine.name,
            engineVersion: stored.result.provenance.engine.version,
            dataSource: stored.result.provenance.dataset.source,
            simulated: stored.result.provenance.dataset.simulated,
            datasetVersion: stored.result.provenance.dataset.datasetVersion,
          }),
        });
        return true;
      }),

    /** Deletes one of the user's runs. Someone else's ID simply matches nothing. */
    async remove(userId: string, id: string): Promise<void> {
      await db.delete(backtestRun).where(and(eq(backtestRun.userId, userId), eq(backtestRun.id, id)));
    },

    /** Deletes snapshots no saved run refers to any more (the daily job). Returns how many went. */
    deleteOrphanSnapshots: (limit: number) =>
      writeTransaction(db, async (tx) => {
        const orphans = await tx
          .select({ checksum: priceSnapshot.checksum })
          .from(priceSnapshot)
          .where(notExists(tx.select({ one: sql`1` }).from(backtestRun).where(eq(backtestRun.snapshotChecksum, priceSnapshot.checksum))))
          .limit(limit);
        if (orphans.length) await tx.delete(priceSnapshot).where(inArray(priceSnapshot.checksum, orphans.map((o) => o.checksum)));
        return orphans.length;
      }),
  };
}
