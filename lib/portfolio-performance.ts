/**
 * The portfolio page's performance numbers: the portfolio's value on each
 * trading day of a range, rebuilt from its trades (lib/portfolio-history.ts),
 * next to a market index, with the same measures as a backtest. Pure, so the
 * server can compute it (app/api/portfolio/performance) and tests can check it.
 */
import { computeMetrics, type Metrics } from "./backtest/engine";
import { sliceTimeframe } from "./chart";
import { firstTradeTime, portfolioValueSeries } from "./portfolio-history";
import type { Account } from "./trading";
import type { PricePoint, Timeframe } from "./types";

export type Performance =
  | {
      status: "ok";
      /** The range's trading days (the index's days). */
      times: number[];
      /** The portfolio's total value in dollars on each day. */
      portfolio: number[];
      /** The index's level on each day. */
      indexValues: number[];
      metrics: { portfolio: Metrics; index: Metrics };
      /** The first trade's time, or null if there hasn't been one. */
      firstTrade: number | null;
    }
  | { status: "missing-prices" | "too-short" };

/**
 * `history` holds the closes as traded (not adjusted: they value real share
 * counts) of every stock the account holds or has traded; `index` is the
 * index's daily history.
 */
export function performance(account: Account, history: Record<string, PricePoint[]>, index: PricePoint[], range: Timeframe): Performance {
  const indexPoints = sliceTimeframe(index, range);
  const times = indexPoints.map((p) => p.time);
  if (times.length < 2) return { status: "too-short" };
  let values: PricePoint[];
  try {
    values = portfolioValueSeries(account, history, times);
  } catch {
    return { status: "missing-prices" };
  }
  const tradesInRange = account.trades.filter((t) => t.time >= times[0]).length;
  return {
    status: "ok",
    times,
    portfolio: values.map((p) => p.price),
    indexValues: indexPoints.map((p) => p.price),
    metrics: { portfolio: computeMetrics(values, tradesInRange, 1), index: computeMetrics(indexPoints, 0, 1) },
    firstTrade: firstTradeTime(account),
  };
}
