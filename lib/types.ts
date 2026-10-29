/**
 * Shared data shapes. Components depend on these types, not on where the data
 * comes from: the mock market and the real one (Tiingo) both produce them.
 *
 * Conventions:
 * - Prices are in US dollars.
 * - `time` values are Unix timestamps in milliseconds (UTC).
 * - Percentages are fractions: 0.0123 means +1.23%.
 */

// `as const` makes this a readonly tuple of literal strings, and the type below
// is derived from it, so the list and the type can never drift apart.
export const TIMEFRAMES = ["1D", "1W", "1M", "6M", "1Y", "5Y"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/**
 * How far back each timeframe reaches. Prices are daily closes, so "1D" is
 * just yesterday's close to today's: today's change.
 */
export const TIMEFRAME_SPAN: Record<Timeframe, { days: number } | { months: number }> = {
  "1D": { days: 1 },
  "1W": { days: 7 },
  "1M": { months: 1 },
  "6M": { months: 6 },
  "1Y": { months: 12 },
  "5Y": { months: 60 },
};

export interface PricePoint {
  time: number;
  price: number;
}

/** One trading day, as a data source reports it. */
export interface DailyBar {
  /** The day's close, as a timestamp (see lib/market/calendar.ts). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Shares traded; null for indices, which don't trade. */
  volume: number | null;
  /**
   * The close adjusted for later splits and dividends, so that a whole
   * history compares like for like. Charts and backtests use this; today's
   * price and change use the plain `close`.
   */
  adjClose: number;
}

/**
 * A dividend or a split, as of the close of its ex-date: the first day the
 * stock trades without it. Holders at the previous close get the dividend or
 * the extra shares.
 */
export type CorporateAction =
  | { symbol: string; time: number; kind: "dividend"; /** Dollars per share. */ amount: number }
  | { symbol: string; time: number; kind: "split"; /** New shares per old share: 2 = 2-for-1, 0.5 = a 1-for-2 reverse split. */ ratio: number };

/** Fields shared by anything with a price: stocks and market indices. */
export interface Quote {
  symbol: string;
  name: string;
  /** The latest close. */
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number | null;
  /** Daily adjusted closes, oldest first, up to 5 years. */
  history: PricePoint[];
  /**
   * Daily closes as they were traded, not adjusted: what orders fill at and
   * alerts compare with. Same days as `history`.
   */
  raw: PricePoint[];
  /**
   * Prices every 5 minutes through the most recent trading days (adjusted,
   * like `history`), oldest first, for the 1D, 1W and 1M charts. Empty when
   * the data source has only daily prices.
   */
  intraday: PricePoint[];
  /** Dividends and splits, oldest first. */
  actions: CorporateAction[];
}

export interface Stock extends Quote {
  /** Null for tickers outside the catalog: real data sources' price feeds don't include it. */
  sector: string | null;
  /** Not every data source has these (Tiingo's end-of-day data doesn't), so they can be null. */
  marketCap: number | null;
  peRatio: number | null;
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
  /** False while the stock has no price (loading or unavailable): it's then valued at cost. */
  priced: boolean;
}

export interface PortfolioSummary {
  cash: number;
  positions: Position[];
  /** Option positions at their marks. */
  optionsValue: number;
  totalValue: number;
  costBasis: number;
  totalGain: number;
  totalGainPercent: number;
  dayChange: number;
  dayChangePercent: number;
}

/** A stock's name and today's price, without its history. Small enough to send to the browser for every stock. */
export type StockQuote = Pick<Stock, "symbol" | "name" | "price" | "change" | "changePercent">;
