/**
 * Factor exposures: how strongly a stock or portfolio moves with the market,
 * size, value, momentum and low-volatility factors, as the analytics service
 * calculates them (services/analytics/analytics/factors.py). Types, a parser
 * and plain-words summaries, so both server and browser code can use them.
 */

export const FACTORS = ["market", "size", "value", "momentum", "lowVol"] as const;
export type Factor = (typeof FACTORS)[number];

export const FACTOR_NAMES: Record<Factor, string> = { market: "Market", size: "Size", value: "Value", momentum: "Momentum", lowVol: "Low volatility" };

/** What a positive exposure means, and a negative one. */
export const FACTOR_SIDES: Record<Factor, { positive: string; negative: string }> = {
  market: { positive: "moves with the market", negative: "moves against the market" },
  size: { positive: "behaves like smaller companies", negative: "behaves like large companies" },
  value: { positive: "behaves like cheap (value) stocks", negative: "behaves like expensive (growth) stocks" },
  momentum: { positive: "behaves like recent winners", negative: "behaves like recent losers" },
  lowVol: { positive: "behaves like calm, steady stocks", negative: "behaves like jumpy, volatile stocks" },
};

export interface FactorExposures {
  betas: Record<Factor, number | null>;
  /** How many standard errors each beta is from zero; beyond about ±2 is unlikely to be chance. */
  tStats: Record<Factor, number | null>;
  /** The return left over after the factors, annualised (a fraction). */
  alpha: number | null;
  alphaT: number | null;
  /** The share of the daily ups and downs the factors explain (0–1). */
  r2: number | null;
  residualVolatility: number | null;
  sessions: number;
  start: number;
  asOf: number;
  /** Portfolios only: each holding's weight. */
  holdings?: Record<string, number>;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);

export function parseFactorExposures(value: unknown): FactorExposures | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  const betas = v.betas as Record<string, unknown> | undefined;
  const tStats = v.tStats as Record<string, unknown> | undefined;
  if (!betas || !tStats || !FACTORS.every((f) => numOrNull(betas[f]) && numOrNull(tStats[f]))) return null;
  if (![v.alpha, v.alphaT, v.r2, v.residualVolatility].every(numOrNull) || ![v.sessions, v.start, v.asOf].every(Number.isInteger)) return null;
  return value as FactorExposures;
}

/** Whether an exposure is clear enough to mention: |t| ≥ 2, and big enough to matter. */
const clear = (e: FactorExposures, f: Factor) => {
  const b = e.betas[f];
  const t = e.tStats[f];
  return b !== null && t !== null && Math.abs(t) >= 2 && Math.abs(b) >= (f === "market" ? 0 : 0.15);
};

/**
 * One or two sentences in plain words, e.g. "Moves about 1.2× as much as
 * the market, and behaves like large companies and expensive (growth)
 * stocks." `subject` is "It" or "Your portfolio".
 */
export function describeExposures(e: FactorExposures, subject = "It"): string {
  const market = e.betas.market;
  const parts: string[] = [];
  if (market !== null) {
    parts.push(
      Math.abs(market - 1) < 0.1 ? "moves about as much as the market" : market > 0 ? `moves about ${market.toFixed(1)}× as much as the market` : "tends to move against the market",
    );
  }
  const tilts = FACTORS.filter((f) => f !== "market" && clear(e, f))
    .sort((a, b) => Math.abs(e.betas[b]!) - Math.abs(e.betas[a]!))
    .slice(0, 2)
    .map((f) => FACTOR_SIDES[f][e.betas[f]! > 0 ? "positive" : "negative"].replace(/^behaves like /, ""));
  if (tilts.length) parts.push(`behaves like ${tilts.join(" and ")}`);
  const sentence = parts.length ? `${subject} ${parts.join(", and ")}.` : `${subject} has no clear factor tilts.`;
  const r2 = e.r2;
  const explained = r2 === null ? "" : r2 < 0.3 ? " The factors explain little of its ups and downs: most come from things particular to it." : r2 > 0.7 ? " The factors explain most of its ups and downs." : "";
  return sentence + explained;
}
