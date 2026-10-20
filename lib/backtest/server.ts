/**
 * Backtests run on the server, next to the prices: the browser sends the
 * settings and gets back only the results, instead of downloading years of
 * daily prices for every stock and running them itself.
 *
 * Results are cached by their settings for as long as the market data they
 * came from (an hour), so a shared link, or a lesson's ready-made backtest,
 * is computed once and then instant for everyone who opens it.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { formatDate } from "../format";
import { getMarket, getStockDetail } from "../market";
import type { PricePoint } from "../types";
import { runConfig, type BacktestConfig, type BacktestOutcome } from "./config";
import type { BacktestRun } from "./engine";
import { runSweep, type Axis, type SweepResult } from "./sweep";

export type Prices = { history: Record<string, PricePoint[]>; market: PricePoint[] };

/** Every stock's adjusted daily closes, and the S&P 500's, or the reason they can't be had. */
async function loadPrices(symbols: string[]): Promise<Prices | { error: string }> {
  const details = await Promise.all(symbols.map(getStockDetail));
  const history: Record<string, PricePoint[]> = {};
  for (const [i, detail] of details.entries()) {
    if (!detail) return { error: `Unknown stock: ${symbols[i]}.` };
    if (detail.status === "unavailable") return { error: `Prices for ${symbols[i]} are unavailable right now. Try again in a minute.` };
    history[symbols[i]] = detail.stock.history;
  }
  return { history, market: (await getMarket()).indices[0].history };
}

const cents = (n: number) => Math.round(n * 100) / 100;
/** Values to the cent: what the charts and tables show, at about half the size. */
const trim = (run: BacktestRun): BacktestRun => ({ ...run, equity: run.equity.map((p) => ({ time: p.time, price: cents(p.price) })) });

export type RunResult = { ok: true; outcome: BacktestOutcome; note: string | null } | { ok: false; message: string };

/** One backtest (settings already validated), cached by its settings. */
export async function runOnServer(config: BacktestConfig): Promise<RunResult> {
  "use cache";
  cacheTag("market");
  cacheLife("hours");
  const symbols = config.holdings.map((h) => h.symbol);
  const prices = await loadPrices(symbols);
  if ("error" in prices) return { ok: false, message: prices.error };
  // A stock listed recently has a shorter history; the run then starts on the
  // first day all the stocks have prices. Say so, rather than leave it a mystery.
  const latest = symbols.map((symbol) => ({ symbol, first: prices.history[symbol][0]?.time ?? 0 })).reduce((a, b) => (b.first > a.first ? b : a));
  const note = latest.first > config.start ? `${latest.symbol}'s prices start on ${formatDate(latest.first)}, so the run starts there.` : null;
  try {
    const { run, benchmark } = runConfig(config, prices.history, prices.market);
    return { ok: true, outcome: { run: trim(run), benchmark: trim(benchmark) }, note };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "That backtest couldn't be run." };
  }
}

export type SweepOutcome = { ok: true; result: SweepResult } | { ok: false; message: string };

/** A parameter sweep (base settings already validated; the axes are checked by the sweep itself), cached by its settings. */
export async function sweepOnServer(base: BacktestConfig, axes: Axis[]): Promise<SweepOutcome> {
  "use cache";
  cacheTag("market");
  cacheLife("hours");
  const prices = await loadPrices(base.holdings.map((h) => h.symbol));
  if ("error" in prices) return { ok: false, message: prices.error };
  const result = runSweep(base, axes, prices.history, prices.market);
  return "error" in result ? { ok: false, message: result.error } : { ok: true, result };
}
