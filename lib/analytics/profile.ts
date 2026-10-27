/**
 * A stock's risk and technical profile, as the analytics service stores it
 * (services/analytics/analytics/profiles.py). Types and a parser only, so
 * both server and browser code can use them.
 *
 * Percentages are fractions (0.021 = 2.1%); losses (VaR, drawdown) are
 * positive numbers. Times are ms.
 */

export interface Drawdown {
  depth: number;
  peak: number | null;
  trough: number | null;
  recovered: number | null;
  recoveryDays: number | null;
}

export interface VolatilityRange {
  sessions: number;
  /** One standard deviation of the log return over the horizon. */
  sd: number | null;
  low68: number | null;
  high68: number | null;
  low90: number | null;
  high90: number | null;
}

export interface VolatilityConeRow {
  sessions: number;
  now: number | null;
  low: number | null;
  median: number | null;
  high: number | null;
  /** Share of past windows at or below today's. */
  percentile: number | null;
}

/** A GARCH(1,1) volatility forecast (services/analytics/analytics/volatility.py). Volatilities are annualised. */
export interface VolatilityForecast {
  asOf: number;
  price: number | null;
  realised21: number | null;
  model: { omega: number | null; alpha: number | null; beta: number | null; persistence: number | null; halfLife: number | null; longRun: number | null; now: number | null; sessions: number } | null;
  ranges: Record<"day" | "week" | "month", VolatilityRange> | null;
  cone: VolatilityConeRow[];
  check: { sessions: number; inside90: number | null; naiveInside90: number | null; qlike: number | null; naiveQlike: number | null } | null;
}

export interface StockProfile {
  asOf: number;
  sessions: number;
  price: number;
  /** Total returns over each period; "12-1" is 12 months ago to 1 month ago (momentum). */
  returns: Record<"1M" | "3M" | "6M" | "1Y" | "3Y" | "12-1", number | null>;
  income: { dividendsTTM: number | null; dividendYield: number | null };
  risk: {
    volatility1Y: number | null;
    volatility3Y: number | null;
    downsideDeviation1Y: number | null;
    beta1Y: number | null;
    beta3Y: number | null;
    correlation1Y: number | null;
    correlation3Y: number | null;
    var95: number | null;
    expectedShortfall95: number | null;
    parametricVar95: number | null;
    skew: number | null;
    excessKurtosis: number | null;
    bestDay: number | null;
    worstDay: number | null;
    maxDrawdown: Drawdown;
    drawdownFromHigh: number | null;
    rollingVolatility: [number, number | null][];
    histogram: { edges: number[]; counts: number[] };
  };
  /** Missing on profiles stored before the forecast existed (analytics 1.0.0). */
  volatility?: VolatilityForecast | null;
  technicals: {
    sma50: number | null;
    sma200: number | null;
    ema20: number | null;
    rsi14: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    bollingerUpper: number | null;
    bollingerLower: number | null;
    percentB: number | null;
    atr14: number | null;
    high52w: number | null;
    low52w: number | null;
    averageVolume20: number | null;
    relativeVolume: number | null;
    states: {
      trend: "above" | "below" | null;
      cross: "golden" | "death" | null;
      lastCross: number | null;
      rsi: "overbought" | "oversold" | "neutral" | null;
      macd: "bullish" | "bearish" | null;
    };
  };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** The profile if `value` has its shape (every field the page reads), or null. */
export function parseStockProfile(value: unknown): StockProfile | null {
  const p = obj(value);
  const risk = obj(p?.risk);
  const tech = obj(p?.technicals);
  const states = obj(tech?.states);
  const returns = obj(p?.returns);
  const drawdown = obj(risk?.maxDrawdown);
  const histogram = obj(risk?.histogram);
  const income = obj(p?.income);
  if (!p || !risk || !tech || !states || !returns || !drawdown || !histogram || !income) return null;
  if (!numOrNull(income.dividendsTTM) || !numOrNull(income.dividendYield)) return null;
  if (!isNum(p.asOf) || !isNum(p.sessions) || !isNum(p.price)) return null;
  if (!["1M", "3M", "6M", "1Y", "3Y", "12-1"].every((k) => numOrNull(returns[k]))) return null;
  const riskNumbers = ["volatility1Y", "volatility3Y", "downsideDeviation1Y", "beta1Y", "beta3Y", "correlation1Y", "correlation3Y", "var95", "expectedShortfall95", "parametricVar95", "skew", "excessKurtosis", "bestDay", "worstDay", "drawdownFromHigh"];
  if (!riskNumbers.every((k) => numOrNull(risk[k]))) return null;
  if (!isNum(drawdown.depth) || !["peak", "trough", "recovered", "recoveryDays"].every((k) => numOrNull(drawdown[k]))) return null;
  if (!Array.isArray(risk.rollingVolatility) || !risk.rollingVolatility.every((pt) => Array.isArray(pt) && isNum(pt[0]) && numOrNull(pt[1]))) return null;
  if (!Array.isArray(histogram.edges) || !Array.isArray(histogram.counts) || !histogram.edges.every(isNum) || !histogram.counts.every(isNum)) return null;
  const techNumbers = ["sma50", "sma200", "ema20", "rsi14", "macd", "macdSignal", "macdHistogram", "bollingerUpper", "bollingerLower", "percentB", "atr14", "high52w", "low52w", "averageVolume20", "relativeVolume"];
  if (!techNumbers.every((k) => numOrNull(tech[k]))) return null;
  const oneOf = (v: unknown, options: string[]) => v === null || options.includes(v as string);
  if (!oneOf(states.trend, ["above", "below"]) || !oneOf(states.cross, ["golden", "death"]) || !numOrNull(states.lastCross)) return null;
  if (!oneOf(states.rsi, ["overbought", "oversold", "neutral"]) || !oneOf(states.macd, ["bullish", "bearish"])) return null;
  if (p.volatility !== undefined && p.volatility !== null && !parseVolatility(p.volatility)) return null;
  return value as StockProfile;
}

/** The forecast if `value` has its shape, or null. */
export function parseVolatility(value: unknown): VolatilityForecast | null {
  const v = obj(value);
  if (!v || !isNum(v.asOf) || !numOrNull(v.price) || !numOrNull(v.realised21) || !Array.isArray(v.cone)) return null;
  const model = v.model === null ? null : obj(v.model);
  if (v.model !== null && (!model || !isNum(model.sessions) || !["omega", "alpha", "beta", "persistence", "halfLife", "longRun", "now"].every((k) => numOrNull(model[k])))) return null;
  const ranges = v.ranges === null ? null : obj(v.ranges);
  const range = (r: unknown) => {
    const x = obj(r);
    return !!x && isNum(x.sessions) && ["sd", "low68", "high68", "low90", "high90"].every((k) => numOrNull(x[k]));
  };
  if (v.ranges !== null && (!ranges || !["day", "week", "month"].every((k) => range(ranges[k])))) return null;
  if (!v.cone.every((row) => obj(row) && isNum((row as Record<string, unknown>).sessions) && ["now", "low", "median", "high", "percentile"].every((k) => numOrNull((row as Record<string, unknown>)[k])))) return null;
  const check = v.check === null ? null : obj(v.check);
  if (v.check !== null && (!check || !isNum(check.sessions) || !["inside90", "naiveInside90", "qlike", "naiveQlike"].every((k) => numOrNull(check[k])))) return null;
  return value as VolatilityForecast;
}
