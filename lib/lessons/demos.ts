/**
 * The numbers behind the lessons' interactive demos. Pure functions on
 * generated prices: the same seed always gives the same path, so every
 * reader sees the same demo and the server and browser agree.
 *
 * Demo prices are illustrations, not market data, and the demos say so.
 *
 * They're built from arithmetic only (+ − × ÷ and √), never Math.log, exp or
 * cos: browsers and Node may differ in those functions' last digit, and a
 * strategy that trades on a crossover can turn that into a different trade,
 * so the page the server rendered wouldn't match the browser's. Basic
 * arithmetic and √ give the same bits everywhere.
 */
import { computeMetrics, runBacktest, type Metrics } from "../backtest/engine";
import { movingAverageCrossover } from "../backtest/strategies";
import { mulberry32, type Rng } from "../random";
import type { PricePoint } from "../types";

export const TRADING_DAYS = 252;
const DAY = 24 * 60 * 60 * 1000;
/** Calendar time between trading days, so 252 of them make a year. */
const STEP = (365.25 / TRADING_DAYS) * DAY;
const START = Date.UTC(2024, 0, 2);

/** A day's timestamp for a demo series: 252 per year. */
export const demoTime = (day: number) => START + day * STEP;

/**
 * A roughly normal random number (mean 0, standard deviation 1): the sum of
 * 12 uniform numbers, minus 6. Close enough to a bell curve for demos, and
 * arithmetic only (see above), unlike lib/random's gaussian.
 */
export function normal(rng: Rng): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += rng();
  return sum - 6;
}

/**
 * A random daily price path: `days` moves after `start`, each a roughly
 * normal percentage move. `annualReturn` and `annualVolatility` are rough
 * targets (the path is random, so a given seed lands near them, not on them).
 */
export function pricePath(seed: number, days: number, { annualReturn = 0.08, annualVolatility = 0.2, start = 100 } = {}): number[] {
  const rng = mulberry32(seed);
  const vol = annualVolatility / Math.sqrt(TRADING_DAYS);
  const drift = annualReturn / TRADING_DAYS;
  const values = [start];
  for (let i = 0; i < days; i++) values.push(values[i] * (1 + drift + vol * normal(rng)));
  return values;
}

/**
 * A random path from `start` that ends exactly at `end`: a price path,
 * tilted by a straight line so its last point lands on target. For
 * comparing different amounts of swing with the same result.
 */
export function pathBetween(seed: number, start: number, end: number, days: number, annualVolatility: number): number[] {
  const path = pricePath(seed, days, { annualReturn: 0, annualVolatility, start });
  const gap = end - path[days];
  return path.map((v, i) => (i === days ? end : v + (gap * i) / days));
}

/** Turns values into dated points, one trading day apart. */
export const toPricePoints = (values: readonly number[]): PricePoint[] => values.map((price, i) => ({ time: demoTime(i), price }));

/** The app's own metrics (return, CAGR, drawdown, volatility, Sharpe) for a daily series. */
export const metricsOf = (values: readonly number[]): Metrics => computeMetrics(toPricePoints(values), 0, 1);

/** The value of `start` growing at `rate` a year, for each year from 0 to `years`. */
export const compoundPath = (start: number, rate: number, years: number) => Array.from({ length: years + 1 }, (_, y) => start * (1 + rate) ** y);

/** The same, if only the starting amount earned anything (no growth on growth). */
export const simplePath = (start: number, rate: number, years: number) => Array.from({ length: years + 1 }, (_, y) => start * (1 + rate * y));

/** Where the worst fall from a peak started and bottomed, and how deep it was (0.3 = −30%). */
export function worstDrawdown(values: readonly number[]): { peak: number; trough: number; depth: number } {
  let peak = 0;
  let worst = { peak: 0, trough: 0, depth: 0 };
  values.forEach((v, i) => {
    if (v > values[peak]) peak = i;
    const depth = 1 - v / values[peak];
    if (depth > worst.depth) worst = { peak, trough: i, depth };
  });
  return worst;
}

/** The gain needed to recover from a fall: −50% needs +100%. */
export const recoveryNeeded = (fall: number) => 1 / (1 - fall) - 1;

const dailyReturns = (values: readonly number[]) => values.slice(1).map((v, i) => v / values[i] - 1);

/** Beta: how much `stock` has moved per 1% move in `market` (covariance ÷ variance of daily returns). */
export function beta(stock: readonly number[], market: readonly number[]): number {
  const s = dailyReturns(stock);
  const m = dailyReturns(market);
  const meanS = s.reduce((a, b) => a + b, 0) / s.length;
  const meanM = m.reduce((a, b) => a + b, 0) / m.length;
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < m.length; i++) {
    covariance += (s[i] - meanS) * (m[i] - meanM);
    variance += (m[i] - meanM) ** 2;
  }
  return variance === 0 ? 0 : covariance / variance;
}

/**
 * A stock that moves `beta` times the market each day, plus its own random
 * moves of `ownVolatility` a year: the market-linked part and the company's own part.
 */
export function stockWithBeta(seed: number, market: readonly number[], targetBeta: number, ownVolatility = 0.15): number[] {
  const rng = mulberry32(seed);
  const vol = ownVolatility / Math.sqrt(TRADING_DAYS);
  const values = [market[0]];
  for (let i = 1; i < market.length; i++) {
    const marketMove = market[i] / market[i - 1] - 1;
    values.push(values[i - 1] * (1 + targetBeta * marketMove + vol * normal(rng)));
  }
  return values;
}

/**
 * An equal mix of several stocks, reset to equal weights every day: the
 * average of their daily moves. Their own swings partly cancel out.
 */
export function equalMix(paths: readonly (readonly number[])[]): number[] {
  const values = [paths[0][0]];
  for (let i = 1; i < paths[0].length; i++) {
    const move = paths.reduce((sum, p) => sum + (p[i] / p[i - 1] - 1), 0) / paths.length;
    values.push(values[i - 1] * (1 + move));
  }
  return values;
}

/**
 * Stocks that share a common market move plus their own: `correlation` is how
 * much of each one's daily swing is the shared part (0 = all their own).
 */
export function relatedPaths(seed: number, count: number, days: number, correlation: number, annualVolatility = 0.3): number[][] {
  const rng = mulberry32(seed);
  const vol = annualVolatility / Math.sqrt(TRADING_DAYS);
  const drift = 0.08 / TRADING_DAYS;
  const shared = Math.sqrt(correlation);
  const own = Math.sqrt(1 - correlation);
  const paths = Array.from({ length: count }, () => [100]);
  for (let d = 0; d < days; d++) {
    const common = normal(rng);
    for (const path of paths) path.push(path[d] * (1 + drift + vol * (shared * common + own * normal(rng))));
  }
  return paths;
}

/**
 * Investing `total` at once on day 0, against spreading it over `installments`
 * equal monthly purchases (every 21 trading days). Returns each one's value
 * every day and the average price paid with the monthly plan.
 */
export function lumpSumVersusMonthly(prices: readonly number[], total: number, installments: number) {
  const MONTH = 21;
  const lump = prices.map((p) => (total / prices[0]) * p);
  const each = total / installments;
  let shares = 0;
  let cash = total;
  let bought = 0;
  const monthly = prices.map((p, i) => {
    if (i % MONTH === 0 && bought < installments) {
      shares += each / p;
      cash -= each;
      bought++;
    }
    return cash + shares * p;
  });
  return { lump, monthly, averageCost: (each * bought) / shares, shares };
}

/**
 * Two holdings starting at `targetA` and 1 − `targetA` of the money. Without
 * rebalancing, each grows on its own; with it, the mix resets to the target
 * every `every` days. Returns A's share of the portfolio each day, and both values.
 */
export function rebalanceDrift(a: readonly number[], b: readonly number[], targetA: number, every: number) {
  const run = (rebalance: boolean) => {
    let unitsA = (targetA * 100) / a[0];
    let unitsB = ((1 - targetA) * 100) / b[0];
    const share: number[] = [];
    const value: number[] = [];
    for (let i = 0; i < a.length; i++) {
      let total = unitsA * a[i] + unitsB * b[i];
      if (rebalance && i > 0 && i % every === 0) {
        unitsA = (targetA * total) / a[i];
        unitsB = ((1 - targetA) * total) / b[i];
        total = unitsA * a[i] + unitsB * b[i];
      }
      share.push((unitsA * a[i]) / total);
      value.push(total);
    }
    return { share, value };
  };
  return { drifting: run(false), rebalanced: run(true) };
}

/** Each moving-average crossover setting's total return on `prices`, for the overfitting demo. */
export function crossoverReturns(prices: readonly number[], fastDays: readonly number[], slowDays: number): { fast: number; totalReturn: number }[] {
  const series = [{ symbol: "DEMO", points: toPricePoints(prices) }];
  const options = { start: demoTime(0), end: demoTime(prices.length - 1), initialCash: 10_000, costs: { commission: 0, slippageBps: 0 } };
  return fastDays.map((fast) => ({ fast, totalReturn: runBacktest(series, movingAverageCrossover({ DEMO: 1 }, fast, slowDays), options).metrics.totalReturn }));
}

export type OrderKind = "market" | "limit" | "stop";

/**
 * When an order placed before day 1 fills, checked at each close like
 * MarketLab: a market order fills at the first close; a buy limit at the
 * first close at or below `level`; a sell stop at the first close at or
 * below `level`. Returns the day and price, or null if it never fills.
 */
export function orderFill(closes: readonly number[], kind: OrderKind, level: number): { day: number; price: number } | null {
  for (let day = 1; day < closes.length; day++) {
    if (kind === "market" || closes[day] <= level) return { day, price: closes[day] };
  }
  return null;
}

/**
 * The cost of trading: what's left of `start` after `trades` round trips,
 * each paying `commission` dollars per trade and `slippageBps` on the money
 * traded, against the same growth with no costs.
 */
export function afterCosts(start: number, grossReturn: number, trades: number, commission: number, slippageBps: number) {
  const gross = start * (1 + grossReturn);
  let value = start;
  const perTrade = (1 + grossReturn) ** (1 / Math.max(1, trades));
  for (let i = 0; i < trades; i++) {
    value -= commission + (value * slippageBps) / 10_000;
    value *= perTrade;
  }
  if (trades === 0) value = gross;
  return { gross, net: value, cost: gross - value };
}
