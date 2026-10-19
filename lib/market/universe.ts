/**
 * Which stocks and indices MarketLab covers. Kept small and free of data so
 * that anything can import it cheaply, including proxy.ts, which runs before
 * every stock-page request.
 */

export interface StockListing {
  symbol: string;
  name: string;
  sector: string;
}

export interface IndexListing {
  /** The index's own symbol, used by the mock market. */
  symbol: string;
  name: string;
  /**
   * An exchange-traded fund that tracks the index. Real data sources serve
   * end-of-day prices for funds but not for the indices themselves, so the
   * real market shows the fund instead.
   */
  fund: string;
}

export const STOCKS: readonly StockListing[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology" },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology" },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Semiconductors" },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Communication Services" },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Discretionary" },
  { symbol: "META", name: "Meta Platforms Inc.", sector: "Communication Services" },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Consumer Discretionary" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials" },
  { symbol: "V", name: "Visa Inc.", sector: "Financials" },
  { symbol: "NFLX", name: "Netflix Inc.", sector: "Communication Services" },
];

export const INDICES: readonly IndexListing[] = [
  { symbol: "SPX", name: "S&P 500", fund: "SPY" },
  { symbol: "IXIC", name: "Nasdaq Composite", fund: "QQQ" },
  { symbol: "DJI", name: "Dow Jones", fund: "DIA" },
];

/** Every stock symbol, for code that only needs to check a symbol exists. */
export const STOCK_SYMBOLS: readonly string[] = STOCKS.map((s) => s.symbol);

/** The stock shown in the dashboard's large chart. */
export const FEATURED_SYMBOL = "AAPL";
