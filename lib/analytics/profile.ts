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
  return value as StockProfile;
}
