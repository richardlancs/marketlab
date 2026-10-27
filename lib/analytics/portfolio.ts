/**
 * Portfolio analytics as the analytics service returns them
 * (services/analytics/analytics/portfolio.py). Types and a parser only.
 * Weights and returns are fractions; losses (VaR) are positive.
 */

export interface PortfolioPoint {
  expectedReturn: number | null;
  volatility: number | null;
}

export interface Weighting extends PortfolioPoint {
  weights: (number | null)[];
  sharpe: number | null;
}

export interface StressResult {
  name: string;
  kind: "historical" | "hypothetical";
  start?: number;
  end?: number;
  market: number | null;
  portfolio: number | null;
  coverage?: number | null;
}

/** How a set of stocks move together (services/analytics/analytics/correlation.py), in the order the stocks are listed. */
export interface CorrelationSummary {
  correlation: (number | null)[][];
  /** Indices into the list, ordered so stocks that move alike sit together. */
  order: number[];
  /** How many independent bets the stocks amount to: 1 if they move in lockstep, their number if not at all. */
  effectiveBets: number | null;
  closest: { a: string; b: string; correlation: number | null }[];
}

/** What /api/watchlist/correlation answers: the watched stocks compared, or nothing to compare. */
export type WatchlistCorrelation = { empty: true } | { symbols: string[]; leftOut: string[]; asOf: number; summary: CorrelationSummary };

/** The summary if `value` (for `n` stocks) has its shape, or null. */
export function isCorrelationSummary(value: unknown, n: number): value is CorrelationSummary {
  const v = obj(value);
  if (!v || !Array.isArray(v.correlation) || v.correlation.length !== n || !v.correlation.every((row) => numbers(row, n))) return false;
  if (!Array.isArray(v.order) || v.order.length !== n || [...v.order].sort((a, b) => a - b).some((x, i) => x !== i)) return false;
  return numOrNull(v.effectiveBets) && Array.isArray(v.closest) && v.closest.every((c) => obj(c) && typeof (c as Record<string, unknown>).a === "string" && typeof (c as Record<string, unknown>).b === "string" && numOrNull((c as Record<string, unknown>).correlation));
}

export interface PortfolioAnalysis {
  asOf: number;
  symbols: string[];
  leftOut: string[];
  weights: (number | null)[];
  cashWeight: number | null;
  risk: {
    volatility: number | null;
    beta: number | null;
    var95: number | null;
    expectedShortfall95: number | null;
    diversificationRatio: number | null;
    holdingVolatility: (number | null)[];
    holdingBeta: (number | null)[];
    riskContribution: (number | null)[];
    /** A GARCH fit to the portfolio's own past returns (annualised now/long-run; `month` is the next month's sd); missing on old results. */
    forecast?: { now: number | null; longRun: number | null; month: number | null; halfLife: number | null } | null;
  } & CorrelationSummary;
  sectors: Record<string, number | null>;
  stress: StressResult[];
  monteCarlo: {
    paths: number;
    years: number;
    historySessions: number;
    months: number[];
    bands: Record<"p5" | "p25" | "p50" | "p75" | "p95", (number | null)[]>;
    lossProbability: Record<"1Y" | "5Y" | "10Y", number | null>;
    median: Record<"1Y" | "5Y" | "10Y", number | null>;
  };
  optimisation: {
    minimumVariance: Weighting;
    maximumSharpe: Weighting;
    riskParity: Weighting;
    current: Weighting;
    frontier: PortfolioPoint[];
    cap: number | null;
    estimationSessions: number;
  } | null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const numbers = (v: unknown, length?: number) => Array.isArray(v) && v.every(numOrNull) && (length === undefined || v.length === length);
const weighting = (v: unknown, n: number) => {
  const w = obj(v);
  return !!w && numbers(w.weights, n) && numOrNull(w.expectedReturn) && numOrNull(w.volatility) && numOrNull(w.sharpe);
};

/** The analysis if `value` has its shape, or null. */
export function parsePortfolioAnalysis(value: unknown): PortfolioAnalysis | null {
  const a = obj(value);
  const risk = obj(a?.risk);
  const mc = obj(a?.monteCarlo);
  const bands = obj(mc?.bands);
  if (!a || !risk || !mc || !bands || !isNum(a.asOf) || !Array.isArray(a.symbols) || !a.symbols.every((s) => typeof s === "string")) return null;
  const n = a.symbols.length;
  if (!numbers(a.weights, n) || !numOrNull(a.cashWeight) || !Array.isArray(a.leftOut)) return null;
  if (!["volatility", "beta", "var95", "expectedShortfall95", "diversificationRatio"].every((k) => numOrNull(risk[k]))) return null;
  if (!["holdingVolatility", "holdingBeta", "riskContribution"].every((k) => numbers(risk[k], n))) return null;
  if (!isCorrelationSummary(risk, n)) return null;
  if (risk.forecast !== undefined && risk.forecast !== null) {
    const f = obj(risk.forecast);
    if (!f || !["now", "longRun", "month", "halfLife"].every((k) => numOrNull(f[k]))) return null;
  }
  const sectors = obj(a.sectors);
  if (!sectors || !Object.values(sectors).every(numOrNull)) return null;
  if (!Array.isArray(a.stress) || !a.stress.every((s) => obj(s) && typeof (s as StressResult).name === "string" && numOrNull((s as StressResult).portfolio))) return null;
  if (!["p5", "p25", "p50", "p75", "p95"].every((k) => numbers(bands[k])) || !numbers(mc.months)) return null;
  if (a.optimisation !== null) {
    const o = obj(a.optimisation);
    if (!o || !["minimumVariance", "maximumSharpe", "riskParity", "current"].every((k) => weighting(o[k], n)) || !Array.isArray(o.frontier)) return null;
  }
  return value as PortfolioAnalysis;
}
