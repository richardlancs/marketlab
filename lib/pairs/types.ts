/**
 * The pairs-trading lab (services/analytics/analytics/pairs.py): settings,
 * the service's answers, and their parsers. Types and pure checks only, so
 * pages, the browser and tests can use them.
 *
 * A scan tests every same-sector pair of catalog stocks for cointegration
 * over a formation year; a test trades one pair's gap over the year after.
 */
import type { Metrics } from "../backtest/engine";

export interface PairCandidate {
  a: string;
  b: string;
  sector: string;
  pValue: number | null;
  /** Benjamini-Hochberg adjusted for the number of pairs tested. */
  adjusted: number | null;
  /** log A ≈ intercept + hedgeRatio × log B over the formation year. */
  hedgeRatio: number | null;
  intercept: number | null;
  /** Sessions for the gap to close half of a stretch; null when it doesn't pull back. */
  halfLife: number | null;
  correlation: number | null;
  sessions: number;
}

export interface PairScan {
  formationStart: number;
  formationEnd: number;
  tests: number;
  passed: number;
  passedAdjusted: number;
  expectedByChance: number | null;
  pairs: PairCandidate[];
}

export interface PairSettings {
  a: string;
  b: string;
  formationEnd: number;
  /** z-score levels: trade past ±entry, close back at ±exit, give up at ±stop. */
  entry: number;
  exit: number;
  stop: number;
  initialCash: number;
  costs: { commission: number; slippageBps: number };
  /** The yearly fee for borrowing the shares sold short, in basis points. */
  borrowBps: number;
}

export interface PairTrade {
  time: number;
  symbol: string;
  side: "buy" | "sell";
  shares: number | null;
  price: number | null;
  reason: string;
}

export interface PairTest {
  a: string;
  b: string;
  formation: { start: number; end: number; sessions: number; hedgeRatio: number | null; intercept: number | null; mean: number | null; sd: number | null; halfLife: number | null; pValue: number | null };
  /** The same test over the trading year: did the relationship last? */
  trading: { pValue: number | null };
  settings: Omit<PairSettings, "a" | "b" | "formationEnd" | "costs"> & { commission: number; slippageBps: number };
  times: number[];
  z: (number | null)[];
  prices: { a: (number | null)[]; b: (number | null)[] };
  equity: { time: number; price: number }[];
  trades: PairTrade[];
  metrics: Metrics;
  costs: { commission: number; slippage: number; borrow: number };
}

export const PAIR_LIMITS = { minEntry: 0.5, maxEntry: 4, maxExit: 3, minStop: 1, maxStop: 8, maxBorrowBps: 2000 } as const;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const inRange = (v: unknown, min: number, max: number): v is number => isNum(v) && v >= min && v <= max;

/** Clean settings, or null: each stock must pass `isKnown`, and exit < entry < stop. */
export function parsePairSettings(value: unknown, isKnown: (symbol: string) => boolean): PairSettings | null {
  const v = obj(value);
  const c = obj(v?.costs);
  if (!v || !c || typeof v.a !== "string" || typeof v.b !== "string" || v.a === v.b || !isKnown(v.a) || !isKnown(v.b)) return null;
  if (!Number.isInteger(v.formationEnd) || !inRange(v.entry, PAIR_LIMITS.minEntry, PAIR_LIMITS.maxEntry) || !inRange(v.exit, 0, PAIR_LIMITS.maxExit) || !inRange(v.stop, PAIR_LIMITS.minStop, PAIR_LIMITS.maxStop)) return null;
  if (!(v.exit < v.entry && v.entry < v.stop)) return null;
  if (!inRange(v.initialCash, 100, 10_000_000) || !inRange(c.commission, 0, 100) || !inRange(c.slippageBps, 0, 100) || !inRange(v.borrowBps, 0, PAIR_LIMITS.maxBorrowBps)) return null;
  return { a: v.a, b: v.b, formationEnd: v.formationEnd as number, entry: v.entry, exit: v.exit, stop: v.stop, initialCash: v.initialCash, costs: { commission: c.commission, slippageBps: c.slippageBps }, borrowBps: v.borrowBps };
}

export function parsePairScan(value: unknown): PairScan | null {
  const v = obj(value);
  if (!v || !["formationStart", "formationEnd", "tests", "passed", "passedAdjusted"].every((k) => Number.isInteger(v[k])) || !numOrNull(v.expectedByChance) || !Array.isArray(v.pairs)) return null;
  const ok = (v.pairs as unknown[]).every((p) => {
    const x = obj(p);
    return !!x && typeof x.a === "string" && typeof x.b === "string" && typeof x.sector === "string" && Number.isInteger(x.sessions) && ["pValue", "adjusted", "hedgeRatio", "intercept", "halfLife", "correlation"].every((k) => numOrNull(x[k]));
  });
  return ok ? (value as PairScan) : null;
}

export function parsePairTest(value: unknown): PairTest | null {
  const v = obj(value);
  const m = obj(v?.metrics);
  const prices = obj(v?.prices);
  if (!v || !m || !prices || typeof v.a !== "string" || typeof v.b !== "string" || !obj(v.formation) || !obj(v.trading) || !obj(v.settings) || !obj(v.costs)) return null;
  const times = v.times;
  if (!Array.isArray(times) || times.length < 2 || !times.every((t) => Number.isInteger(t))) return null;
  const n = times.length;
  const series = (s: unknown) => Array.isArray(s) && s.length === n && s.every(numOrNull);
  if (!series(v.z) || !series(prices.a) || !series(prices.b)) return null;
  if (!Array.isArray(v.equity) || v.equity.length !== n || !(v.equity as Record<string, unknown>[]).every((p) => Number.isInteger(p?.time) && isNum(p.price))) return null;
  if (!Array.isArray(v.trades) || !(v.trades as Record<string, unknown>[]).every((t) => Number.isInteger(t?.time) && typeof t.symbol === "string" && (t.side === "buy" || t.side === "sell") && typeof t.reason === "string")) return null;
  if (!["finalValue", "totalReturn", "cagr", "maxDrawdown", "volatility", "exposure"].every((k) => isNum(m[k])) || !numOrNull(m.sharpe)) return null;
  return value as PairTest;
}

/** One sentence on what the scan found, with how many to expect by chance alone. */
export function scanSummary(s: PairScan): string {
  const chance = s.expectedByChance === null ? "" : ` By chance alone, about ${Math.round(s.expectedByChance)} would pass at 5%.`;
  const kept = s.passedAdjusted === 0 ? "None survive adjusting for how many were tested." : `${s.passedAdjusted} ${s.passedAdjusted === 1 ? "survives" : "survive"} adjusting for how many were tested.`;
  return `${s.tests} same-sector pairs tested; ${s.passed} passed at 5%.${chance} ${kept}`;
}
