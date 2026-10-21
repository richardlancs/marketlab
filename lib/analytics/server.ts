/**
 * Stored analytics, from the Next.js side: keeping the price store current,
 * asking the Python analytics service to (re)calculate, and reading results.
 *
 * - The daily job (lib/maintenance.ts) calls refreshAnalytics() after the
 *   close: it stores every catalog stock's and index's latest bars, then has
 *   the service recalculate whatever changed, in time-boxed calls.
 * - Pages call getStockProfile(): it reads the stored result, and if there's
 *   none yet (or it's behind the latest close), it stores that stock's bars
 *   and has the service calculate it on the spot. So pages work before the
 *   daily job has ever run, and locally without it.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { BacktestConfig } from "../backtest/config";
import { post, pythonConfigured } from "../backtest/python-client";
import { prices } from "../db";
import { getBarsForStore, priceSource } from "../market";
import { CATALOG } from "../market/catalog";
import { INDICES } from "../market/universe";
import { parseStockProfile, type StockProfile } from "./profile";
import { buildRows, type ScreenerRow } from "./screener";

/** The index every beta is measured against (it must be stored with any stock). */
const MARKET = "SPX";

export interface JobResult {
  computed: number;
  unchanged: number;
  missing: string[];
  failed: Record<string, string>;
  remaining: string[];
  ms: number;
}

function parseJob(data: Record<string, unknown>): JobResult {
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  return {
    computed: Number(data.computed) || 0,
    unchanged: Number(data.unchanged) || 0,
    missing: strings(data.missing),
    failed: (data.failed && typeof data.failed === "object" ? data.failed : {}) as Record<string, string>,
    remaining: strings(data.remaining),
    ms: Number(data.ms) || 0,
  };
}

/**
 * Stores the latest bars of these symbols. Returns how many series changed; a
 * symbol whose prices can't be loaded is skipped. With a `deadline` (ms), it
 * stops when time runs out and lists the symbols it didn't reach (the first
 * fill of an empty store writes about 130,000 rows; later runs only append).
 */
export async function syncPrices(symbols: readonly string[], deadline = Infinity, now: () => number = Date.now): Promise<{ changed: number; failed: string[]; skipped: string[] }> {
  const source = priceSource();
  let changed = 0;
  const failed: string[] = [];
  // A few at a time: each first write is a network round trip of about a second on Turso.
  const PARALLEL = 6;
  for (let i = 0; i < symbols.length; i += PARALLEL) {
    if (now() > deadline) return { changed, failed, skipped: symbols.slice(i) };
    await Promise.all(
      symbols.slice(i, i + PARALLEL).map(async (symbol) => {
        const series = await getBarsForStore(symbol);
        if (!series) {
          failed.push(symbol);
          return;
        }
        if ((await prices.syncSeries(source, symbol, series.bars, { marketCap: series.marketCap, peRatio: series.peRatio, dividendYield: series.dividendYield })) !== "unchanged") changed++;
      }),
    );
  }
  return { changed, failed, skipped: [] };
}

/** Asks the analytics service to recalculate stock profiles (all stored ones, or these), within `budgetMs`. */
export async function runStockProfiles(symbols: string[] | null, budgetMs = 8000): Promise<JobResult> {
  const data = await post("/v1/analytics/stock-profiles", { source: priceSource(), symbols: symbols ?? undefined, budgetMs }, "Stock profiles");
  return parseJob(data);
}

export interface RefreshSummary {
  pricesChanged: number;
  priceFailures: string[];
  computed: number;
  unchanged: number;
  unfinished: boolean;
  skipped?: string;
}

/** The daily job's analytics step: store the latest prices, then recalculate what changed, until `deadline` (ms). */
export async function refreshAnalytics(deadline: number, now: () => number = Date.now): Promise<RefreshSummary> {
  const symbols = [...INDICES.map((i) => i.symbol), ...CATALOG.map((s) => s.symbol)];
  // Leave time for at least one calculation call after storing prices.
  const synced = await syncPrices(symbols, deadline - 9000, now);
  const summary: RefreshSummary = { pricesChanged: synced.changed, priceFailures: synced.failed, computed: 0, unchanged: 0, unfinished: synced.skipped.length > 0 };
  if (!pythonConfigured()) return { ...summary, skipped: "The analytics service isn't configured (ANALYTICS_URL, ANALYTICS_SERVICE_TOKEN)." };
  let pending: string[] | null = null;
  for (;;) {
    const left = deadline - now();
    if (left < 1500) {
      summary.unfinished = true;
      break;
    }
    const job: JobResult = await runStockProfiles(pending, Math.min(8000, left - 1000));
    summary.computed += job.computed;
    summary.unchanged += job.unchanged;
    if (job.remaining.length === 0) break;
    pending = job.remaining;
  }
  return summary;
}

async function storedProfile(symbol: string) {
  return prices.result("stock-profile", symbol, priceSource(), parseStockProfile);
}

export type ProfileStatus = { status: "ok"; profile: StockProfile; computedAt: number } | { status: "unavailable"; reason: string };

/**
 * A stock's profile as of the latest close, calculating it if needed.
 * Cached for an hour; a failure only for a minute, so it's retried soon.
 */
export async function getStockProfile(symbol: string): Promise<ProfileStatus> {
  "use cache";
  cacheTag("market", `profile:${symbol}`);
  try {
    const latest = (await getBarsForStore(symbol))?.bars.at(-1)?.time;
    let stored = await storedProfile(symbol);
    if (!stored || (latest !== undefined && stored.asOf < latest)) {
      if (!pythonConfigured()) {
        cacheLife("minutes");
        return stored ? { status: "ok", profile: stored.result, computedAt: stored.computedAt } : { status: "unavailable", reason: "The analytics service isn't running." };
      }
      await syncPrices(symbol === MARKET ? [MARKET] : [MARKET, symbol]);
      await runStockProfiles(symbol === MARKET ? [MARKET] : [symbol], 5000);
      stored = await storedProfile(symbol);
    }
    if (!stored) {
      cacheLife("minutes");
      return { status: "unavailable", reason: "There isn't enough price history for this stock yet." };
    }
    cacheLife("hours");
    return { status: "ok", profile: stored.result, computedAt: stored.computedAt };
  } catch (error) {
    console.error(`[analytics] Profile for ${symbol} failed:`, error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return { status: "unavailable", reason: "Risk and technical analysis is unavailable right now. Try again in a minute." };
  }
}

export type ScreenerData = { status: "ok"; rows: ScreenerRow[]; asOf: number } | { status: "unavailable"; reason: string };

/**
 * Every catalog stock's screener row. If profiles are missing or behind the
 * latest close (the daily job hasn't run yet), they're brought up to date
 * first, within about 9 seconds. Cached for an hour.
 */
export async function getScreenerData(): Promise<ScreenerData> {
  "use cache";
  cacheTag("market", "screener");
  const source = priceSource();
  try {
    let profiles = await prices.results("stock-profile", source, parseStockProfile);
    const latest = (await getBarsForStore(MARKET))?.bars.at(-1)?.time ?? 0;
    const behind = CATALOG.filter((s) => (profiles.get(s.symbol)?.asOf ?? 0) < latest);
    if (behind.length > 0 && pythonConfigured()) {
      await refreshAnalytics(Date.now() + 9000);
      profiles = await prices.results("stock-profile", source, parseStockProfile);
    }
    const index = await prices.seriesIndex(source);
    const rows = buildRows(
      CATALOG.flatMap((s) => {
        const stored = profiles.get(s.symbol);
        const meta = index.get(s.symbol);
        return stored ? [{ symbol: s.symbol, name: s.name, sector: s.sector, profile: stored.result, marketCap: meta?.marketCap ?? null, peRatio: meta?.peRatio ?? null, dividendYield: meta?.dividendYield ?? null }] : [];
      }),
    );
    if (rows.length === 0) {
      cacheLife("minutes");
      return { status: "unavailable", reason: pythonConfigured() ? "The screener's numbers aren't ready yet. Try again in a minute." : "The analytics service isn't running." };
    }
    if (rows.length < CATALOG.length) cacheLife("minutes");
    else cacheLife("hours");
    return { status: "ok", rows, asOf: Math.max(...[...profiles.values()].map((p) => p.asOf)) };
  } catch (error) {
    console.error("[analytics] Screener failed:", error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return { status: "unavailable", reason: "The screener is unavailable right now. Try again in a minute." };
  }
}

export interface WalkForwardFold {
  trainStart: number;
  testStart: number;
  testEnd: number;
  fast: number;
  slow: number;
  inSampleSharpe: number | null;
  outOfSampleSharpe: number | null;
  outOfSampleReturn: number;
  baseReturn: number;
  holdReturn: number;
}

export interface WalkForwardCurve {
  equity: [number, number][];
  metrics: { totalReturn: number; cagr: number; maxDrawdown: number; sharpe: number | null; volatility: number; trades: number; exposure: number; finalValue: number };
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  combinations: number;
  trainSessions: number;
  testSessions: number;
  walkForward: WalkForwardCurve;
  base: WalkForwardCurve;
  buyAndHold: WalkForwardCurve;
  meanInSampleSharpe: number | null;
  meanOutOfSampleSharpe: number | null;
  efficiency: number | null;
}

const isCurve = (v: unknown): v is WalkForwardCurve => {
  const c = v as WalkForwardCurve | null;
  return !!c && Array.isArray(c.equity) && c.equity.every((p) => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number") && typeof c.metrics?.totalReturn === "number";
};

/** Walk-forward test of a moving-average crossover on stored prices (services/analytics/analytics/walkforward.py). */
export async function walkForwardOnServer(
  config: BacktestConfig,
  fast: { from: number; to: number; step: number },
  slow: { from: number; to: number; step: number },
  trainYears: number,
  testMonths: number,
): Promise<{ ok: true; result: WalkForwardResult } | { ok: false; message: string }> {
  if (!pythonConfigured()) return { ok: false, message: "Walk-forward testing needs the analytics service, which isn't running." };
  try {
    const synced = await syncPrices(config.holdings.map((h) => h.symbol));
    if (synced.failed.length) return { ok: false, message: `Prices for ${synced.failed.join(", ")} are unavailable right now. Try again in a minute.` };
    const data = await post("/v1/backtests/walk-forward", { source: priceSource(), config, fast, slow, trainYears, testMonths }, "Walk-forward");
    const r = data.result as WalkForwardResult | undefined;
    if (!r || !Array.isArray(r.folds) || !isCurve(r.walkForward) || !isCurve(r.base) || !isCurve(r.buyAndHold)) return { ok: false, message: "The walk-forward test came back in a form MarketLab couldn't read." };
    return { ok: true, result: r };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The walk-forward test failed. Try again in a minute." };
  }
}
