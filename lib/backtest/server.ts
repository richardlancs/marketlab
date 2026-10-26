/**
 * Backtests on the server, next to the prices: the browser sends the
 * settings and gets back only the results.
 *
 * Each run:
 * 1. loads prices through the market-data layer, and refuses to run if real
 *    prices were asked for but the market fell back to simulated ones (it
 *    never mixes the two, or passes simulated prices off as real);
 * 2. takes a snapshot of exactly the prices the engine will use (./snapshot.ts);
 * 3. calculates with the Python engine (./engines.ts), cached by the
 *    settings, the dataset's checksum and the engine's version, so a shared
 *    link is calculated once while new prices or a new engine version
 *    recalculate.
 *
 * Each result carries its provenance: the engine, the data source (and
 * whether it's simulated), the dataset checksum and dates, and the
 * simulation assumptions.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { formatDate } from "../format";
import { getBarsForStore, getMarket, getStockDetail } from "../market";
import { marketMode } from "../market/mode";
import type { PricePoint } from "../types";
import { configNeedsBars, type BacktestConfig } from "./config";
import type { BacktestRun, ExtraPoint } from "./engine";
import { ASSUMPTIONS, compute } from "./engines";
import type { LuckResult } from "./luck";
import { luckOnPython, PythonEngineError, pythonEngineVersion, sweepOnPython } from "./python-client";
import { describeSnapshot, makeSnapshot, type PriceSnapshot } from "./snapshot";
import type { StoredResult } from "./stored";
import { buildGrid, type Axis, type SweepResult } from "./sweep";

type Grid = Exclude<ReturnType<typeof buildGrid>, { error: string }>;

export type Prices = { history: Record<string, PricePoint[]>; market: PricePoint[] };

interface LoadedPrices {
  history: Record<string, PricePoint[]>;
  /** Each stock's adjusted highs and lows and its volumes, when asked for (rules that need them). */
  extra?: Record<string, ExtraPoint[]>;
  market: { symbol: string; name: string; history: PricePoint[] };
  source: PriceSnapshot["source"];
  asOf: number;
}

const REAL_UNAVAILABLE =
  "Real prices are unavailable right now (the data provider couldn't be reached), and backtests never use simulated prices in their place. Try again in a few minutes.";

/** Every stock's adjusted daily closes and the market index, all from one source, or the reason they can't be had. */
async function loadPrices(symbols: string[], withBars = false): Promise<LoadedPrices | { error: string }> {
  const market = await getMarket();
  // With real data selected, a market that fell back to the mock (provider down) can't be used:
  // its stocks and index would be simulated, next to real prices for any other stock.
  if (marketMode() === "tiingo" && market.source !== "tiingo") return { error: REAL_UNAVAILABLE };
  const details = await Promise.all(symbols.map(getStockDetail));
  const history: Record<string, PricePoint[]> = {};
  for (const [i, detail] of details.entries()) {
    if (!detail) return { error: `Unknown stock: ${symbols[i]}.` };
    if (detail.status === "unavailable") return { error: `Prices for ${symbols[i]} are unavailable right now. Try again in a minute.` };
    history[symbols[i]] = detail.stock.history;
  }
  const index = market.indices[0];
  let extra: Record<string, ExtraPoint[]> | undefined;
  if (withBars) {
    extra = {};
    for (const symbol of symbols) {
      const stored = await getBarsForStore(symbol);
      if (!stored) return { error: `Daily highs, lows and volumes for ${symbol} are unavailable right now. Try again in a minute.` };
      // On the adjusted scale, like the closes: each day's high and low times its adjusted close ÷ traded close.
      extra[symbol] = stored.bars.map((b) => ({ time: b.time, high: b.high * (b.adjClose / b.close), low: b.low * (b.adjClose / b.close), volume: b.volume }));
    }
  }
  return { history, ...(extra && { extra }), market: { symbol: index.symbol, name: index.name, history: index.history }, source: market.source, asOf: market.asOf };
}

const cents = (n: number) => Math.round(n * 100) / 100;
/** Values to the cent: what the charts and tables show, at about half the size. */
const trim = (run: BacktestRun): BacktestRun => ({ ...run, equity: run.equity.map((p) => ({ time: p.time, price: cents(p.price) })) });

export type RunResult = ({ ok: true } & StoredResult) | { ok: false; message: string };

/** A result plus the snapshot it came from: what saving a run stores. */
export type FullRun = Extract<RunResult, { ok: true }> & { snapshot: PriceSnapshot };

/**
 * The calculation, cached by everything that decides its result: the
 * settings, the exact input prices (through the snapshot, and so its
 * checksum), and the engine and its version. A failure throws, and errors
 * aren't cached, so a brief outage isn't remembered for an hour.
 */
/** Bumped when a result gains or changes fields (2: extras), so cached results in the old shape aren't served. */
const RESULT_FORMAT = 2;

async function computeCached(config: BacktestConfig, snapshot: PriceSnapshot, engineVersion: string, format = RESULT_FORMAT) {
  "use cache";
  cacheTag("market");
  cacheLife("hours");
  void engineVersion; // part of the cache key only
  void format; // likewise
  return computeFresh(config, snapshot);
}

/** The calculation itself, never cached. */
async function computeFresh(config: BacktestConfig, snapshot: PriceSnapshot) {
  const computed = await compute(config, snapshot);
  return { ...computed, outcome: { run: trim(computed.outcome.run), benchmark: trim(computed.outcome.benchmark) }, computedAt: Date.now() };
}

/**
 * Runs a backtest (settings already validated) on a snapshot: from the
 * cache, or, with `fresh`, calculated again regardless.
 */
export async function runFromSnapshot(config: BacktestConfig, snapshot: PriceSnapshot, { fresh = false, notes = [] as string[] } = {}): Promise<RunResult> {
  let computed: Awaited<ReturnType<typeof computeCached>>;
  try {
    computed = fresh ? await computeFresh(config, snapshot) : await computeCached(config, snapshot, await pythonEngineVersion());
  } catch (error) {
    if (error instanceof PythonEngineError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : "That backtest couldn't be run." };
  }
  const all = [...notes, ...computed.warnings];
  return {
    ok: true,
    outcome: computed.outcome,
    note: all.length ? all.join(" ") : null,
    provenance: { engine: computed.engine, dataset: describeSnapshot(snapshot), assumptions: ASSUMPTIONS, computedAt: computed.computedAt },
    ...(computed.extras && { extras: computed.extras }),
  };
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * A stock listed recently has a shorter history; the run then starts on the
 * first day all the stocks have prices. Say so, rather than leave it a
 * mystery. Judged on each stock's full history (not the snapshot, which
 * always starts within the run's dates), by calendar day: a close at 4 PM on
 * the start date isn't "later" than that date.
 */
function startNotes(config: BacktestConfig, history: Record<string, PricePoint[]>): string[] {
  const firsts = config.holdings.map((h) => ({ symbol: h.symbol, first: history[h.symbol]?.[0]?.time ?? 0 }));
  const latest = firsts.reduce((a, b) => (b.first > a.first ? b : a));
  return Math.floor(latest.first / DAY) > Math.floor(config.start / DAY) ? [`${latest.symbol}'s prices start on ${formatDate(latest.first)}, so the run starts there.`] : [];
}

/** One backtest on today's prices, and the snapshot it used. */
export async function runFull(config: BacktestConfig): Promise<FullRun | Extract<RunResult, { ok: false }>> {
  const prices = await loadPrices(config.holdings.map((h) => h.symbol), configNeedsBars(config));
  if ("error" in prices) return { ok: false, message: prices.error };
  const snapshot = makeSnapshot(config, prices.history, prices.market, prices.source, prices.asOf, prices.extra);
  const result = await runFromSnapshot(config, snapshot, { notes: startNotes(config, prices.history) });
  return result.ok ? { ...result, snapshot } : result;
}

/** One backtest on today's prices: the result without its snapshot, which only saving needs. */
export async function runOnServer(config: BacktestConfig): Promise<RunResult> {
  const result = await runFull(config);
  if (!result.ok) return result;
  const { snapshot: _snapshot, ...rest } = result;
  void _snapshot;
  return rest;
}

export type SweepOutcome = { ok: true; result: SweepResult } | { ok: false; message: string };

/**
 * A parameter sweep (base settings already validated; the axes are checked
 * by buildGrid), run by the analytics service on one snapshot of prices
 * (every point has the same stocks and dates), cached by its settings, the
 * prices and the engine version.
 */
export async function sweepOnServer(base: BacktestConfig, axes: Axis[]): Promise<SweepOutcome> {
  const grid = buildGrid(base, axes);
  if ("error" in grid) return { ok: false, message: grid.error };
  const prices = await loadPrices(base.holdings.map((h) => h.symbol), configNeedsBars(base));
  if ("error" in prices) return { ok: false, message: prices.error };
  const snapshot = makeSnapshot(base, prices.history, prices.market, prices.source, prices.asOf, prices.extra);
  try {
    return { ok: true, result: await sweepCached(base, grid, snapshot, await pythonEngineVersion()) };
  } catch (error) {
    return { ok: false, message: error instanceof PythonEngineError ? error.message : "That sweep couldn't be run." };
  }
}

async function sweepCached(base: BacktestConfig, grid: Grid, snapshot: PriceSnapshot, engineVersion: string): Promise<SweepResult> {
  "use cache";
  cacheTag("market");
  cacheLife("hours");
  void engineVersion; // part of the cache key only
  const swept = await sweepOnPython(base, grid.points.map((p) => p.config), snapshot);
  return { axes: grid.axes, points: grid.points.map((p, i) => ({ ...p, metrics: swept.metrics[i] })), benchmark: swept.benchmark, check: swept.check };
}

export type LuckOutcome = { ok: true; result: LuckResult } | { ok: false; message: string };

/**
 * "Was it luck?" for a run (lib/backtest/luck.ts): on a saved run's own
 * snapshot when given one, otherwise on today's prices (the same snapshot a
 * fresh run of these settings uses). Cached by the settings, the prices and
 * the engine version, like runs.
 */
export async function luckOnServer(config: BacktestConfig, saved?: PriceSnapshot): Promise<LuckOutcome> {
  let snapshot = saved;
  if (!snapshot) {
    const prices = await loadPrices(config.holdings.map((h) => h.symbol), configNeedsBars(config));
    if ("error" in prices) return { ok: false, message: prices.error };
    snapshot = makeSnapshot(config, prices.history, prices.market, prices.source, prices.asOf, prices.extra);
  }
  try {
    return { ok: true, result: await luckCached(config, snapshot, await pythonEngineVersion()) };
  } catch (error) {
    return { ok: false, message: error instanceof PythonEngineError ? error.message : "The luck check couldn't be run. Try again in a minute." };
  }
}

async function luckCached(config: BacktestConfig, snapshot: PriceSnapshot, engineVersion: string): Promise<LuckResult> {
  "use cache";
  cacheTag("market");
  cacheLife("hours");
  void engineVersion; // part of the cache key only
  return luckOnPython(config, snapshot);
}
