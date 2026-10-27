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

// Options and factors. Black-Scholes needs exp, log and the normal curve, so
// these are built from arithmetic too (see the top of this file): series
// that give the same bits in every browser and in Node.

const LN2 = 0.6931471805599453;

/** e^x from arithmetic only: x = k·ln 2 + r, then a Taylor series for e^r, times 2^k. */
export function arithmeticExp(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 700) return Infinity;
  if (x < -700) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2;
  let term = 1;
  let sum = 1;
  for (let i = 1; i < 25; i++) {
    term *= r / i;
    sum += term;
  }
  let scale = 1;
  for (let i = 0; i < Math.abs(k); i++) scale *= k > 0 ? 2 : 0.5;
  return sum * scale;
}

/** The natural log from arithmetic only: halve or double into [√½, √2), then the series 2·(z + z³/3 + z⁵/5 + …). */
export function arithmeticLog(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let k = 0;
  while (x >= Math.SQRT2) {
    x /= 2;
    k++;
  }
  while (x < Math.SQRT1_2) {
    x *= 2;
    k--;
  }
  const z = (x - 1) / (x + 1);
  const z2 = z * z;
  let term = z;
  let sum = 0;
  for (let i = 1; i < 60; i += 2) {
    sum += term / i;
    term *= z2;
  }
  return 2 * sum + k * LN2;
}

/** The bell curve's height at x (mean 0, standard deviation 1). */
export const normalDensity = (x: number) => 0.3989422804014327 * arithmeticExp((-x * x) / 2);

/** The chance a standard normal number is below x (Abramowitz and Stegun 26.2.17, accurate to about 1e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const tail = normalDensity(x) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

export type OptionKind = "call" | "put";

export interface OptionInputs {
  spot: number;
  strike: number;
  /** Time to expiry in years. */
  years: number;
  /** Yearly volatility: 0.2 = 20%. */
  volatility: number;
  /** Yearly interest rate: 0.04 = 4%. */
  rate: number;
}

export interface OptionValue {
  price: number;
  /** Price change per $1 move in the stock. */
  delta: number;
  /** Delta's change per $1 move in the stock. */
  gamma: number;
  /** Price change per calendar day that passes. */
  theta: number;
  /** Price change per 1 percentage point of volatility. */
  vega: number;
  /** Price change per 1 percentage point of interest rate. */
  rho: number;
}

/** The value at expiry of one share's worth of option. */
export const intrinsicValue = (kind: OptionKind, spot: number, strike: number) => Math.max(0, kind === "call" ? spot - strike : strike - spot);

/** Black-Scholes price and Greeks for a European option on a stock with no dividends, per share. */
export function blackScholes(kind: OptionKind, { spot, strike, years, volatility, rate }: OptionInputs): OptionValue {
  if (years <= 0 || volatility <= 0) {
    const itm = kind === "call" ? spot > strike : spot < strike;
    return { price: intrinsicValue(kind, spot, strike), delta: itm ? (kind === "call" ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const root = Math.sqrt(years);
  const d1 = (arithmeticLog(spot / strike) + (rate + (volatility * volatility) / 2) * years) / (volatility * root);
  const d2 = d1 - volatility * root;
  const discounted = strike * arithmeticExp(-rate * years);
  const density = normalDensity(d1);
  const gamma = density / (spot * volatility * root);
  const vega = (spot * density * root) / 100;
  const decay = (-spot * density * volatility) / (2 * root);
  if (kind === "call") {
    const n2 = normalCdf(d2);
    return { price: spot * normalCdf(d1) - discounted * n2, delta: normalCdf(d1), gamma, theta: (decay - rate * discounted * n2) / 365, vega, rho: (years * discounted * n2) / 100 };
  }
  const n2 = normalCdf(-d2);
  return { price: discounted * n2 - spot * normalCdf(-d1), delta: normalCdf(d1) - 1, gamma, theta: (decay + rate * discounted * n2) / 365, vega, rho: (-years * discounted * n2) / 100 };
}

/**
 * The volatility at which Black-Scholes gives `price`, found by bisection:
 * try the middle of a range, keep the half the answer must be in, repeat.
 * Returns null when no volatility from 1% to 300% gives that price. `steps`
 * are the guesses, for showing the search.
 */
export function impliedVolatility(kind: OptionKind, price: number, inputs: Omit<OptionInputs, "volatility">): { volatility: number; steps: { volatility: number; price: number }[] } | null {
  let low = 0.01;
  let high = 3;
  const at = (volatility: number) => blackScholes(kind, { ...inputs, volatility }).price;
  if (price < at(low) || price > at(high)) return null;
  const steps: { volatility: number; price: number }[] = [];
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const p = at(mid);
    steps.push({ volatility: mid, price: p });
    if (p > price) high = mid;
    else low = mid;
  }
  return { volatility: (low + high) / 2, steps };
}

/** One part of an option position: options bought (quantity > 0) or sold (< 0), or shares bought at `price`. */
export type Leg = { kind: OptionKind; strike: number; premium: number; quantity: number } | { kind: "stock"; price: number; quantity: number };

/** A position's profit per share at expiry, if the stock ends at `spot`: what the legs pay, less what they cost. */
export const profitAtExpiry = (legs: readonly Leg[], spot: number) =>
  legs.reduce((sum, leg) => sum + leg.quantity * (leg.kind === "stock" ? spot - leg.price : intrinsicValue(leg.kind, spot, leg.strike) - leg.premium), 0);

/**
 * The prices where a position's profit at expiry crosses zero, on a grid of
 * stock prices. Payoffs are straight between strikes, so with whole-dollar
 * strikes on a whole-dollar grid the crossings are exact.
 */
export function breakevens(legs: readonly Leg[], prices: readonly number[]): number[] {
  const found: number[] = [];
  const values = prices.map((p) => profitAtExpiry(legs, p));
  values.forEach((v, i) => {
    if (v === 0 && (i === 0 || values[i - 1] !== 0)) found.push(prices[i]);
    else if (i > 0 && values[i - 1] * v < 0) found.push(prices[i - 1] + ((prices[i] - prices[i - 1]) * -values[i - 1]) / (v - values[i - 1]));
  });
  return found;
}

export const FACTORS = ["Market", "Size", "Value", "Momentum", "Low volatility"] as const;
export type Factor = (typeof FACTORS)[number];

/**
 * A year's return split into each factor's part (exposure × the factor's
 * return) and alpha, the part left over. Adding the parts is a simplification:
 * real returns compound day by day.
 */
export function factorContributions(exposures: Record<Factor, number>, factorReturns: Record<Factor, number>, alpha: number) {
  const parts = FACTORS.map((factor) => ({ factor, contribution: exposures[factor] * factorReturns[factor] }));
  return { parts, total: parts.reduce((sum, p) => sum + p.contribution, alpha) };
}

// Volatility clustering.

/**
 * Daily moves with a long-run volatility of `annualVolatility`. Clustered
 * moves follow GARCH(1,1): tomorrow's variance = the long-run level's share
 * (1 − alpha − beta) + alpha × today's squared move + beta × today's variance,
 * so a big move makes the next ones bigger. Constant moves keep the same
 * size every day. Both draw the same random numbers, so only the clustering differs.
 */
export function volatilityMoves(seed: number, days: number, { annualVolatility = 0.2, alpha = 0.09, beta = 0.89, clustered = true } = {}): number[] {
  const rng = mulberry32(seed);
  const longRun = (annualVolatility * annualVolatility) / TRADING_DAYS;
  const base = longRun * (1 - alpha - beta);
  let variance = longRun;
  const moves: number[] = [];
  for (let i = 0; i < days; i++) {
    const move = Math.sqrt(clustered ? variance : longRun) * normal(rng);
    moves.push(move);
    variance = base + alpha * move * move + beta * variance;
  }
  return moves;
}

/** A price path from daily moves, starting at `start`. */
export function pathFromMoves(moves: readonly number[], start = 100): number[] {
  const values = [start];
  for (const move of moves) values.push(values[values.length - 1] * (1 + move));
  return values;
}

/** Each whole block of `block` days' volatility, scaled to a year: the standard deviation of its moves × √252. */
export function blockVolatilities(moves: readonly number[], block = 21): number[] {
  const out: number[] = [];
  for (let start = 0; start + block <= moves.length; start += block) {
    const slice = moves.slice(start, start + block);
    const mean = slice.reduce((a, b) => a + b, 0) / block;
    const variance = slice.reduce((a, m) => a + (m - mean) ** 2, 0) / (block - 1);
    out.push(Math.sqrt(variance * TRADING_DAYS));
  }
  return out;
}

/** Sessions for a shock's extra variance to fade by half, when `persistence` (alpha + beta) of it is left each day: log(0.5) ÷ log(persistence). */
export const shockHalfLife = (persistence: number) => (persistence > 0 && persistence < 1 ? arithmeticLog(0.5) / arithmeticLog(persistence) : Infinity);

