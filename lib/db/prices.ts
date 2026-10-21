/**
 * The price store (daily_bar, price_series) and stored analytics
 * (analytics_result). The Next.js server writes prices from its market data;
 * the Python analytics service reads them and writes results; pages read the
 * results here.
 */
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { DailyBar } from "../types";
import * as schema from "./schema";

type Db = LibSQLDatabase<typeof schema>;
const { analyticsResult, dailyBar, priceSeries } = schema;

export type PriceSource = "mock" | "tiingo";

/** Rows per INSERT: 9 values each, 9,000 per statement, under SQLite's 32,766 bound variables. A 5-year series fits in two. */
const CHUNK = 1000;

/** SHA-256 of the bars, in order: the same bars always give the same checksum. */
export function barsChecksum(bars: readonly DailyBar[]): string {
  const hash = createHash("sha256");
  for (const b of bars) hash.update(`${b.time},${b.open},${b.high},${b.low},${b.close},${b.adjClose},${b.volume ?? ""}\n`);
  return hash.digest("hex");
}

export type SyncOutcome = "unchanged" | "appended" | "rewritten";

export interface Fundamentals {
  marketCap: number | null;
  peRatio: number | null;
  dividendYield: number | null;
}

export interface StoredResultRow<T = unknown> {
  version: string;
  inputChecksum: string;
  asOf: number;
  computedAt: number;
  result: T;
}

export function createPriceRepository(db: Db) {
  const rows = (source: PriceSource, symbol: string, bars: readonly DailyBar[]) =>
    bars.map((b) => ({ source, symbol, time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, adjClose: b.adjClose, volume: b.volume }));

  return {
    /**
     * Stores a symbol's bars. Unchanged bars are left alone. New days at the
     * end are appended. If anything earlier differs (a dividend or split
     * rescales every adjusted close before it, or the source revised a day),
     * the whole series is rewritten in one transaction.
     */
    async syncSeries(
      source: PriceSource,
      symbol: string,
      bars: readonly DailyBar[],
      fundamentals: Fundamentals = { marketCap: null, peRatio: null, dividendYield: null },
      now = Date.now(),
    ): Promise<SyncOutcome> {
      if (bars.length === 0) return "unchanged";
      const checksum = barsChecksum(bars);
      const [stored] = await db.select().from(priceSeries).where(and(eq(priceSeries.source, source), eq(priceSeries.symbol, symbol)));
      if (stored?.checksum === checksum) return "unchanged";
      const meta = { source, symbol, checksum, firstTime: bars[0].time, lastTime: bars[bars.length - 1].time, bars: bars.length, ...fundamentals, updatedAt: now };

      // Only new days at the end, with every stored day the same as before?
      const known = stored ? bars.filter((b) => b.time <= stored.lastTime) : [];
      const appendOnly = stored !== undefined && known.length === stored.bars && known[0]?.time === stored.firstTime && barsChecksum(known) === stored.checksum;
      const fresh = appendOnly ? bars.slice(known.length) : bars;

      // One batch: atomic, and on Turso a single HTTP request instead of a round trip per statement.
      const values = rows(source, symbol, fresh);
      const inserts = [];
      for (let i = 0; i < values.length; i += CHUNK) inserts.push(db.insert(dailyBar).values(values.slice(i, i + CHUNK)));
      const upsert = db.insert(priceSeries).values(meta).onConflictDoUpdate({ target: [priceSeries.source, priceSeries.symbol], set: meta });
      if (appendOnly) await db.batch([upsert, ...inserts]);
      else await db.batch([db.delete(dailyBar).where(and(eq(dailyBar.source, source), eq(dailyBar.symbol, symbol))), ...inserts, upsert]);
      return appendOnly ? "appended" : "rewritten";
    },

    /** Each stored series' checksum, last day and fundamentals, by symbol. */
    async seriesIndex(source: PriceSource): Promise<Map<string, { checksum: string; lastTime: number; bars: number } & Fundamentals>> {
      const list = await db.select().from(priceSeries).where(eq(priceSeries.source, source));
      return new Map(list.map((s) => [s.symbol, { checksum: s.checksum, lastTime: s.lastTime, bars: s.bars, marketCap: s.marketCap, peRatio: s.peRatio, dividendYield: s.dividendYield }]));
    },

    /** Stored bars after `after` (ms), oldest first. */
    async bars(source: PriceSource, symbol: string, after = 0) {
      return db
        .select()
        .from(dailyBar)
        .where(and(eq(dailyBar.source, source), eq(dailyBar.symbol, symbol), gt(dailyBar.time, after)))
        .orderBy(dailyBar.time);
    },

    /** One stored result, or null. `parse` checks its shape. */
    async result<T>(kind: string, subject: string, source: PriceSource, parse: (value: unknown) => T | null): Promise<StoredResultRow<T> | null> {
      const [row] = await db
        .select()
        .from(analyticsResult)
        .where(and(eq(analyticsResult.kind, kind), eq(analyticsResult.subject, subject), eq(analyticsResult.source, source)));
      if (!row) return null;
      let value: T | null = null;
      try {
        value = parse(JSON.parse(row.result));
      } catch {
        value = null;
      }
      return value === null ? null : { version: row.version, inputChecksum: row.inputChecksum, asOf: row.asOf, computedAt: row.computedAt, result: value };
    },

    /** Every stored result of one kind, by subject. */
    async results<T>(kind: string, source: PriceSource, parse: (value: unknown) => T | null): Promise<Map<string, StoredResultRow<T>>> {
      const list = await db.select().from(analyticsResult).where(and(eq(analyticsResult.kind, kind), eq(analyticsResult.source, source)));
      const out = new Map<string, StoredResultRow<T>>();
      for (const row of list) {
        try {
          const value = parse(JSON.parse(row.result));
          if (value !== null) out.set(row.subject, { version: row.version, inputChecksum: row.inputChecksum, asOf: row.asOf, computedAt: row.computedAt, result: value });
        } catch {
          // A result that can't be read is treated as missing, and recalculated.
        }
      }
      return out;
    },
  };
}
