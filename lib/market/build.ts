/**
 * Turns a provider's raw daily bars into the quotes the app displays. Kept
 * free of Next.js imports so tests can run it directly.
 */
import type { CorporateAction, DailyBar, MarketIndex, PricePoint, Quote, Stock } from "../types";
import type { MarketDataProvider } from "./provider";
import { INDICES, STOCKS } from "./universe";

export interface Market {
  source: MarketDataProvider["source"];
  /** The latest close in the data: what the prices are "as of". */
  asOf: number;
  stocks: Stock[];
  indices: MarketIndex[];
  /** Set when the real source failed and this is a fallback, to show the user. */
  notice: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A quote from bars: the last bar is "today", the one before it "yesterday". */
export function toQuote(symbol: string, name: string, bars: DailyBar[], actions: CorporateAction[] = [], intraday: PricePoint[] = []): Quote {
  if (bars.length === 0) throw new Error(`No price data for ${symbol}`);
  const last = bars[bars.length - 1];
  const previous = bars[bars.length - 2] ?? last;
  const change = round2(last.close - previous.close);
  return {
    symbol,
    name,
    price: last.close,
    previousClose: previous.close,
    change,
    changePercent: previous.close === 0 ? 0 : (last.close - previous.close) / previous.close,
    open: last.open,
    high: last.high,
    low: last.low,
    volume: last.volume,
    history: bars.map((bar) => ({ time: bar.time, price: bar.adjClose })),
    raw: bars.map((bar) => ({ time: bar.time, price: bar.close })),
    intraday,
    actions,
  };
}

export async function buildMarket(provider: MarketDataProvider, now: number): Promise<Market> {
  const [stocks, indices] = await Promise.all([
    Promise.all(
      STOCKS.map(async (listing): Promise<Stock> => {
        const series = await provider.getSeries(listing.symbol, now);
        return {
          ...toQuote(listing.symbol, listing.name, series.bars, series.actions, series.intraday),
          sector: listing.sector,
          marketCap: series.marketCap,
          peRatio: series.peRatio,
        };
      }),
    ),
    Promise.all(
      INDICES.map(async (listing) => {
        const symbol = provider.indexSymbol(listing);
        const series = await provider.getSeries(symbol, now);
        return toQuote(symbol, listing.name, series.bars, [], series.intraday);
      }),
    ),
  ]);
  const asOf = Math.max(...stocks.map((s) => s.history[s.history.length - 1].time));
  return { source: provider.source, asOf, stocks, indices, notice: null };
}
