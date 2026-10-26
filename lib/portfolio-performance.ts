/**
 * The portfolio page's performance numbers: the portfolio's value on each
 * trading day of a range, rebuilt from its trades, next to a market index,
 * with the same measures as a backtest. The analytics service calculates
 * them (services/analytics/analytics/performance.py), through
 * app/api/portfolio/performance.
 */
import type { Metrics } from "./backtest/engine";

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
