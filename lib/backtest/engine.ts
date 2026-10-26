/**
 * A small backtesting engine for the Learn demos, which replay a strategy in
 * the browser, plus the result types every backtest uses. The backtests
 * themselves run in the Python analytics service (services/analytics), which
 * follows the same rules. Pure functions, no I/O.
 *
 * Rules of the simulation:
 * - Each day, the strategy sees closes up to *yesterday* only, decides what it
 *   wants to hold, and the orders fill at *today's* close. It can't act on a
 *   price before it could have known it (no "look-ahead bias"), by construction:
 *   it is never given today's price.
 * - Shares are fractional, as is usual for backtests (the trading simulator
 *   uses whole shares).
 * - Costs: a fixed commission per order, and slippage that makes buys fill a
 *   little above the close and sells a little below it.
 */
import type { PricePoint } from "../types";

export interface Costs {
  /** Dollars per order. */
  commission: number;
  /** Basis points (0.01%) the fill is worse than the close: 5 = 0.05%. */
  slippageBps: number;
}

export const NO_COSTS: Costs = { commission: 0, slippageBps: 0 };

/**
 * What a strategy asks for on a day:
 * - "target": hold these fractions of total value in each symbol (the rest in cash);
 * - "buy": spend these dollar amounts.
 */
export type Decision = { type: "target"; weights: Record<string, number> } | { type: "buy"; amounts: Record<string, number> };

export interface StrategyContext {
  /** Index of the day being decided (0 = the first day of the backtest). */
  day: number;
  /** Timestamps of every day up to and including today. Dates are known in advance; prices aren't. */
  times: number[];
  /** Closes for each symbol up to and including *yesterday* (empty on day 0). */
  closes: Record<string, number[]>;
  /**
   * Each symbol's daily high, low and volume up to and including yesterday,
   * when the series came with them (rules on ranges or volume need them).
   * Highs and lows are on the same adjusted scale as the closes.
   */
  bars?: Record<string, DailyExtras>;
  /** Shares held of each symbol, and cash, before today's orders. */
  shares: Record<string, number>;
  cash: number;
}

/** A strategy is a function from what it can see to what it wants, or null for "no change". */
export type Strategy = (context: StrategyContext) => Decision | null;

export interface BacktestTrade {
  time: number;
  symbol: string;
  side: "buy" | "sell";
  shares: number;
  /** The fill price per share, after slippage. */
  price: number;
  commission: number;
}

export interface Metrics {
  finalValue: number;
  totalReturn: number;
  /** Compound annual growth rate: the steady yearly return that would end at the same value. */
  cagr: number;
  /** The worst fall from a peak to a later low, as a fraction (0.25 = −25%). */
  maxDrawdown: number;
  drawdownPeak: number | null;
  drawdownTrough: number | null;
  /** Standard deviation of daily returns, annualized (× √252). */
  volatility: number;
  /** Average daily return over its standard deviation, annualized, with a 0% risk-free rate. Null when flat. */
  sharpe: number | null;
  trades: number;
  /** Fraction of days with money invested. */
  exposure: number;
}

export interface BacktestRun {
  /** Total value (cash + holdings) at each day's close. */
  equity: PricePoint[];
  trades: BacktestTrade[];
  metrics: Metrics;
}

/** A day's high, low and volume, besides its (adjusted) close. */
export interface ExtraPoint {
  time: number;
  high: number;
  low: number;
  volume: number | null;
}

/** Highs, lows and volumes, one per day, aligned with the closes. NaN where a day has none. */
export interface DailyExtras {
  high: number[];
  low: number[];
  volume: number[];
}

export interface Series {
  symbol: string;
  points: PricePoint[];
  /** Optional: each day's adjusted high and low, and volume. */
  extra?: ExtraPoint[];
}

/** Skip trades too small to matter, so rounding never generates a stream of commission-only orders. */
const MIN_TRADE_VALUE = 1;
const TRADING_DAYS_PER_YEAR = 252;
const YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Lines up several daily series on the days they all have, between `start`
 * and `end` (inclusive). Returns the shared times and each symbol's closes.
 */
export function alignSeries(series: Series[], start: number, end: number): { times: number[]; closes: Record<string, number[]>; bars?: Record<string, DailyExtras> } {
  const maps = series.map((s) => new Map(s.points.map((p) => [p.time, p.price])));
  const times = series[0].points
    .map((p) => p.time)
    .filter((t) => t >= start && t <= end && maps.every((m) => m.has(t)));
  const closes = Object.fromEntries(series.map((s, i) => [s.symbol, times.map((t) => maps[i].get(t) as number)]));
  if (!series.some((s) => s.extra)) return { times, closes };
  const bars = Object.fromEntries(
    series.map((s) => {
      const byTime = new Map((s.extra ?? []).map((e) => [e.time, e]));
      return [
        s.symbol,
        {
          high: times.map((t) => byTime.get(t)?.high ?? Number.NaN),
          low: times.map((t) => byTime.get(t)?.low ?? Number.NaN),
          volume: times.map((t) => byTime.get(t)?.volume ?? Number.NaN),
        },
      ];
    }),
  );
  return { times, closes, bars };
}

export function runBacktest(series: Series[], strategy: Strategy, options: { start: number; end: number; initialCash: number; costs: Costs }): BacktestRun {
  const { initialCash, costs } = options;
  const { times, closes, bars } = alignSeries(series, options.start, options.end);
  if (times.length < 2) throw new Error("Not enough price history in that date range.");
  const symbols = series.map((s) => s.symbol);
  const slip = costs.slippageBps / 10_000;

  let cash = initialCash;
  const shares: Record<string, number> = Object.fromEntries(symbols.map((s) => [s, 0]));
  const trades: BacktestTrade[] = [];
  const equity: PricePoint[] = [];
  let investedDays = 0;

  // `exit`: a sell to a 0% target sells every share held. (value / close can come out a hair under
  // the shares held, which would leave a sliver that still counts as a position.)
  const fill = (time: number, symbol: string, side: "buy" | "sell", value: number, close: number, exit = false) => {
    // `value` is dollars at the close; slippage moves the fill price against us.
    const price = side === "buy" ? close * (1 + slip) : close * (1 - slip);
    if (side === "buy") {
      const spend = Math.min(value, cash - costs.commission); // can't spend money we don't have
      if (spend < MIN_TRADE_VALUE) return;
      const qty = spend / price;
      cash -= spend + costs.commission;
      shares[symbol] += qty;
      trades.push({ time, symbol, side, shares: qty, price, commission: costs.commission });
    } else {
      const qty = exit ? shares[symbol] : Math.min(value / close, shares[symbol]); // can't sell more than we hold
      if (qty * close < MIN_TRADE_VALUE) return;
      cash += qty * price - costs.commission;
      shares[symbol] -= qty;
      trades.push({ time, symbol, side, shares: qty, price, commission: costs.commission });
    }
  };

  for (let day = 0; day < times.length; day++) {
    const time = times[day];
    const today = Object.fromEntries(symbols.map((s) => [s, closes[s][day]]));
    const decision = strategy({
      day,
      times: times.slice(0, day + 1),
      // Only up to yesterday: today's close is what the orders fill at.
      closes: Object.fromEntries(symbols.map((s) => [s, closes[s].slice(0, day)])),
      ...(bars && {
        bars: Object.fromEntries(symbols.map((s) => [s, { high: bars[s].high.slice(0, day), low: bars[s].low.slice(0, day), volume: bars[s].volume.slice(0, day) }])),
      }),
      shares: { ...shares },
      cash,
    });

    if (decision?.type === "buy") {
      for (const [symbol, amount] of Object.entries(decision.amounts)) {
        if (symbol in shares && amount > 0) fill(time, symbol, "buy", amount, today[symbol]);
      }
    } else if (decision?.type === "target") {
      const total = cash + symbols.reduce((sum, s) => sum + shares[s] * today[s], 0);
      const deltas = symbols.map((s) => ({ s, delta: (decision.weights[s] ?? 0) * total - shares[s] * today[s] }));
      // Sell first, so the cash is there for the buys.
      for (const { s, delta } of deltas) if (delta < 0) fill(time, s, "sell", -delta, today[s], !((decision.weights[s] ?? 0) > 0));
      for (const { s, delta } of deltas) if (delta > 0) fill(time, s, "buy", delta, today[s]);
    }

    const holdings = symbols.reduce((sum, s) => sum + shares[s] * today[s], 0);
    if (holdings > 0) investedDays++;
    equity.push({ time, price: cash + holdings });
  }

  return { equity, trades, metrics: computeMetrics(equity, trades.length, investedDays / times.length) };
}

export function computeMetrics(equity: PricePoint[], trades: number, exposure: number): Metrics {
  const first = equity[0].price;
  const last = equity[equity.length - 1].price;
  const years = (equity[equity.length - 1].time - equity[0].time) / YEAR;

  const returns = equity.slice(1).map((p, i) => p.price / equity[i].price - 1);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.length > 1 ? returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1) : 0;
  const sd = Math.sqrt(variance);

  let peak = equity[0];
  let maxDrawdown = 0;
  let drawdownPeak: number | null = null;
  let drawdownTrough: number | null = null;
  for (const point of equity) {
    if (point.price > peak.price) peak = point;
    const drawdown = 1 - point.price / peak.price;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      drawdownPeak = peak.time;
      drawdownTrough = point.time;
    }
  }

  return {
    finalValue: last,
    totalReturn: last / first - 1,
    cagr: years > 0 ? (last / first) ** (1 / years) - 1 : 0,
    maxDrawdown,
    drawdownPeak,
    drawdownTrough,
    volatility: sd * Math.sqrt(TRADING_DAYS_PER_YEAR),
    sharpe: sd > 1e-12 ? (mean / sd) * Math.sqrt(TRADING_DAYS_PER_YEAR) : null,
    trades,
    exposure,
  };
}
