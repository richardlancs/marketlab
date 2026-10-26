/**
 * The stock screener's rules: the rows it shows (built by the analytics
 * service from stored profiles and fundamentals, with percentile ranks:
 * services/analytics/analytics/screener.py), and the filters, presets and
 * sorting, which run in the browser so all ~100 rows filter instantly.
 */
import { CONFIG_VERSION, type BacktestConfig } from "../backtest/config";

export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  marketCap: number | null;
  /** From reported earnings when the SEC has them, otherwise the price source's. */
  peRatio: number | null;
  dividendYield: number | null;
  /** From the SEC's company facts (lib/market/fundamentals.ts); null without them. */
  priceToSales: number | null;
  revenueGrowth: number | null;
  netMargin: number | null;
  returnOnEquity: number | null;
  freeCashFlowYield: number | null;
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
  priceToSales: { label: "P/S", format: "number" },
  revenueGrowth: { label: "Revenue growth", format: "signed" },
  netMargin: { label: "Net margin", format: "percent" },
  returnOnEquity: { label: "ROE", format: "percent" },
  freeCashFlowYield: { label: "FCF yield", format: "percent" },
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

/** Which columns the table shows: prices and risk, or the companies' reported numbers. */
export type ScreenerView = "market" | "company";

export const PRESETS: { id: string; name: string; description: string; screen: Screen; view?: ScreenerView }[] = [
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
  {
    id: "quality",
    name: "Quality",
    description: "Profitable and efficient: a net margin and return on equity of 15% or more, with revenue still growing.",
    screen: { ...EMPTY_SCREEN, ranges: { netMargin: { min: 0.15 }, returnOnEquity: { min: 0.15 }, revenueGrowth: { min: 0 } }, sort: "returnOnEquity", descending: true },
    view: "company",
  },
  {
    id: "value",
    name: "Value",
    description: "Cheap for their earnings: a P/E of 18 or less, with free cash flow of 4% of the price or more.",
    screen: { ...EMPTY_SCREEN, ranges: { peRatio: { max: 18 }, freeCashFlowYield: { min: 0.04 } }, sort: "peRatio", descending: false },
    view: "company",
  },
  {
    id: "growth",
    name: "Growth",
    description: "Revenue up 15% or more in the last fiscal year.",
    screen: { ...EMPTY_SCREEN, ranges: { revenueGrowth: { min: 0.15 } }, sort: "revenueGrowth", descending: true },
    view: "company",
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
