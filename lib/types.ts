/**
 * Shared data shapes. Components depend on these types, not on where the data
 * comes from, so the mock generator can later be swapped for a real API.
 *
 * Conventions:
 * - Prices are in US dollars.
 * - `time` values are Unix timestamps in milliseconds (UTC).
 * - Percentages are fractions: 0.0123 means +1.23%.
 */

// `as const` makes this a readonly tuple of literal strings, and the type below
// is derived from it, so the list and the type can never drift apart.
export const TIMEFRAMES = ["1D", "1W", "1M", "1Y"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export interface PricePoint {
  time: number;
  price: number;
}

/** Fields shared by anything with a price: stocks and market indices. */
export interface Quote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  history: Record<Timeframe, PricePoint[]>;
}

export interface Stock extends Quote {
  sector: string;
  volume: number;
  marketCap: number;
  peRatio: number;
}

export type MarketIndex = Quote;

export interface Holding {
  symbol: string;
  shares: number;
  averageCost: number;
}

export interface Position extends Holding {
  name: string;
  price: number;
  marketValue: number;
  costBasis: number;
  gain: number;
  gainPercent: number;
  dayChange: number;
}

export interface PortfolioSummary {
  cash: number;
  positions: Position[];
  totalValue: number;
  costBasis: number;
  totalGain: number;
  totalGainPercent: number;
  dayChange: number;
  dayChangePercent: number;
}
