/**
 * The stock screener's rules: the rows it shows (built from stored stock
 * profiles and fundamentals), percentile ranks, filters, presets and sorting.
 * Pure functions, so the page can filter all ~100 rows instantly in the
 * browser, and tests can check every rule.
 */
import { CONFIG_VERSION, type BacktestConfig } from "../backtest/config";
import type { StockProfile } from "./profile";

export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  marketCap: number | null;
  peRatio: number | null;
  dividendYield: number | null;
  r1M: number | null;
  r3M: number | null;
  r1Y: number | null;
  momentum: number | null;
  volatility: number | null;
  beta: number | null;
  rsi: number | null;
  fromHigh: number | null;
  trend: "above" | "below" | null;
  cross: "golden" | "death" | null;
  /** Percentile (0 = lowest, 1 = highest) of momentum among all rows, and within the sector. */
  momentumRank: number | null;
  momentumSectorRank: number | null;
  /** Percentile of volatility among all rows (0 = calmest). */
  volatilityRank: number | null;
}

/** Fractions of 0 to 1: where each value sits among the others (ties share the average rank). Nulls stay null. */
export function percentiles(values: (number | null)[]): (number | null)[] {
  const present = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
  const out: (number | null)[] = values.map(() => null);
  if (present.length === 0) return out;
  if (present.length === 1) {
    out[present[0].i] = 0.5;
    return out;
  }
  present.sort((a, b) => a.v - b.v);
  for (let start = 0; start < present.length; ) {
    let end = start;
    while (end + 1 < present.length && present[end + 1].v === present[start].v) end++;
    const rank = (start + end) / 2 / (present.length - 1);
    for (let k = start; k <= end; k++) out[present[k].i] = rank;
    start = end + 1;
  }
  return out;
}

export interface ProfileInput {
  symbol: string;
  name: string;
  sector: string;
  profile: StockProfile;
  marketCap: number | null;
  peRatio: number | null;
  /** The source's indicated yield, if it has one; otherwise the trailing yield from the prices is used. */
  dividendYield: number | null;
}

export function buildRows(inputs: ProfileInput[]): ScreenerRow[] {
  const rows: ScreenerRow[] = inputs.map(({ symbol, name, sector, profile: p, marketCap, peRatio, dividendYield }) => ({
    symbol,
    name,
    sector,
    price: p.price,
    marketCap,
    peRatio,
    dividendYield: dividendYield ?? p.income.dividendYield,
    r1M: p.returns["1M"],
    r3M: p.returns["3M"],
    r1Y: p.returns["1Y"],
    momentum: p.returns["12-1"],
    volatility: p.risk.volatility1Y,
    beta: p.risk.beta1Y,
    rsi: p.technicals.rsi14,
    fromHigh: p.risk.drawdownFromHigh,
    trend: p.technicals.states.trend,
    cross: p.technicals.states.cross,
    momentumRank: null,
    momentumSectorRank: null,
    volatilityRank: null,
  }));
  percentiles(rows.map((r) => r.momentum)).forEach((rank, i) => (rows[i].momentumRank = rank));
  percentiles(rows.map((r) => r.volatility)).forEach((rank, i) => (rows[i].volatilityRank = rank));
  for (const sector of new Set(rows.map((r) => r.sector))) {
    const members = rows.filter((r) => r.sector === sector);
    percentiles(members.map((r) => r.momentum)).forEach((rank, i) => (members[i].momentumSectorRank = rank));
  }
  return rows;
}

/** Columns that can be filtered by a range and sorted. */
export const METRICS = {
  price: { label: "Price", format: "money" },
  r1M: { label: "1M", format: "signed" },
  r3M: { label: "3M", format: "signed" },
  r1Y: { label: "1Y", format: "signed" },
  momentum: { label: "Momentum 12-1", format: "signed" },
  volatility: { label: "Volatility", format: "percent" },
  beta: { label: "Beta", format: "number" },
  rsi: { label: "RSI", format: "number" },
  fromHigh: { label: "Below high", format: "percent" },
  dividendYield: { label: "Yield", format: "percent" },
  marketCap: { label: "Mkt cap", format: "compact" },
  peRatio: { label: "P/E", format: "number" },
} as const;
export type MetricKey = keyof typeof METRICS;

export interface Screen {
  sectors: string[];
  /** Inclusive bounds; percentages as fractions. */
  ranges: Partial<Record<MetricKey, { min?: number; max?: number }>>;
  trend: "above" | "below" | null;
  /** Percentile rank bounds (0-1). */
  momentumRankMin?: number;
  volatilityRankMax?: number;
  sort: MetricKey | "symbol";
  descending: boolean;
}

export const EMPTY_SCREEN: Screen = { sectors: [], ranges: {}, trend: null, sort: "marketCap", descending: true };

export const PRESETS: { id: string; name: string; description: string; screen: Screen }[] = [
  {
    id: "momentum",
    name: "Momentum leaders",
    description: "The top fifth by 12-1 momentum, still above their 200-day average.",
    screen: { ...EMPTY_SCREEN, trend: "above", momentumRankMin: 0.8, sort: "momentum", descending: true },
  },
  {
    id: "low-volatility",
    name: "Low volatility",
    description: "The calmest fifth over the past year.",
    screen: { ...EMPTY_SCREEN, volatilityRankMax: 0.2, sort: "volatility", descending: false },
  },
  {
    id: "oversold",
    name: "Oversold in an uptrend",
    description: "RSI under 40 while above the 200-day average: a pullback within a longer rise.",
    screen: { ...EMPTY_SCREEN, trend: "above", ranges: { rsi: { max: 40 } }, sort: "rsi", descending: false },
  },
  {
    id: "dividends",
    name: "Dividend payers",
    description: "A yield of 2.5% or more.",
    screen: { ...EMPTY_SCREEN, ranges: { dividendYield: { min: 0.025 } }, sort: "dividendYield", descending: true },
  },
  {
    id: "defensive",
    name: "Defensive",
    description: "Beta under 0.8: they've tended to move less than the market.",
    screen: { ...EMPTY_SCREEN, ranges: { beta: { max: 0.8 } }, sort: "beta", descending: false },
  },
];

const within = (value: number | null, range: { min?: number; max?: number } | undefined) =>
  !range || (value !== null && (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max));

/** The rows passing every filter in `screen`, sorted. A row missing a filtered value is left out. */
export function applyScreen(rows: ScreenerRow[], screen: Screen): ScreenerRow[] {
  const passing = rows.filter(
    (r) =>
      (screen.sectors.length === 0 || screen.sectors.includes(r.sector)) &&
      (screen.trend === null || r.trend === screen.trend) &&
      (screen.momentumRankMin === undefined || (r.momentumRank !== null && r.momentumRank >= screen.momentumRankMin)) &&
      (screen.volatilityRankMax === undefined || (r.volatilityRank !== null && r.volatilityRank <= screen.volatilityRankMax)) &&
      (Object.keys(screen.ranges) as MetricKey[]).every((key) => within(r[key], screen.ranges[key])),
  );
  const key = screen.sort;
  const direction = screen.descending ? -1 : 1;
  return passing.sort((a, b) => {
    if (key === "symbol") return direction * a.symbol.localeCompare(b.symbol);
    const x = a[key];
    const y = b[key];
    if (x === null && y === null) return a.symbol.localeCompare(b.symbol);
    if (x === null) return 1; // missing values last, either way
    if (y === null) return -1;
    return direction * (x - y) || a.symbol.localeCompare(b.symbol);
  });
}

/**
 * Settings for backtesting the screen's top results: equal weights in up to
 * five stocks, bought and held over the last `years`, against the market.
 * Note the look-ahead: today's screen picks stocks that did well up to today.
 */
export function backtestOfScreen(rows: ScreenerRow[], asOf: number, years = 3): BacktestConfig | null {
  const picks = rows.slice(0, 5);
  if (picks.length === 0) return null;
  // Weights in whole tenths of a percent that add up to exactly 1.
  const base = Math.floor(1000 / picks.length);
  const holdings = picks.map((r, i) => ({ symbol: r.symbol, weight: (base + (i < 1000 - base * picks.length ? 1 : 0)) / 1000 }));
  return {
    version: CONFIG_VERSION,
    holdings,
    strategy: { kind: "buy-and-hold" },
    start: asOf - Math.round(years * 365.25 * 86_400_000),
    end: asOf,
    initialCash: 10_000,
    costs: { commission: 0, slippageBps: 0 },
    benchmark: "market",
  };
}
