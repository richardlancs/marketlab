/**
 * What a market-data source must provide. The rest of the app depends only on
 * this, so the mock market and the real one (Tiingo) are interchangeable.
 */
import type { DailyBar } from "../types";
import type { IndexListing } from "./universe";

export interface Series {
  /** About 5 years of daily bars, oldest first, ending at the latest close. */
  bars: DailyBar[];
  /** Fundamentals, when the source has them. */
  marketCap: number | null;
  peRatio: number | null;
}

export interface MarketDataProvider {
  readonly source: "mock" | "tiingo";
  /** What to show for an index: the index itself, or a fund that tracks it. */
  indexSymbol(index: IndexListing): string;
  /** `now` decides which day's close is the latest (the mock market moves with the calendar). */
  getSeries(symbol: string, now: number): Promise<Series>;
}
