/**
 * The mock market: prices generated from fixed seeds, so every run sees the
 * same numbers, and moving forward one trading day at a time with the real
 * calendar.
 *
 * - Up to ANCHOR_DAY (Oct 16, 2026), each history is a random path that ends
 *   at the stock's listed price, as in earlier versions of MarketLab.
 * - After it, each day's move comes from a seed made of the symbol and that
 *   day's date. A day's price therefore never changes once it exists, no
 *   matter when you look: tomorrow simply adds one more day.
 */
import { bridge, gaussian, hashString, mulberry32, type Rng } from "../random";
import type { DailyBar } from "../types";
import { CLOSE_OFFSET, latestClosedTradingDay, tradingDaysAfter, tradingDaysEndingAt } from "./calendar";
import type { MarketDataProvider, Series } from "./provider";

/** Change this to get a completely different (but still reproducible) dataset. */
const DATASET_SEED = 2026;

/** The day the original, frozen dataset ended. Prices on this day match it exactly. */
export const ANCHOR_DAY = Date.UTC(2026, 9, 16);

/**
 * How many bars each series keeps: a little over 5 years of weekdays (the
 * mock market has no holidays), so the 5-year view always has its start.
 */
export const HISTORY_BARS = 1310;

interface Spec {
  /** The price on ANCHOR_DAY. */
  price: number;
  /** Typical daily move as a fraction (0.02 = 2%). */
  dailyVolatility: number;
  /** Stocks only: for market cap, P/E and volume. */
  sharesOutstanding?: number;
  earningsPerShare?: number;
  averageVolume?: number;
}

// Fictional values, loosely modeled on real companies.
const SPECS: Record<string, Spec> = {
  AAPL: { price: 248.3, dailyVolatility: 0.016, sharesOutstanding: 14.9e9, earningsPerShare: 7.1, averageVolume: 52e6 },
  MSFT: { price: 512.75, dailyVolatility: 0.015, sharesOutstanding: 7.43e9, earningsPerShare: 13.9, averageVolume: 21e6 },
  NVDA: { price: 186.4, dailyVolatility: 0.028, sharesOutstanding: 24.3e9, earningsPerShare: 3.85, averageVolume: 210e6 },
  GOOGL: { price: 236.15, dailyVolatility: 0.018, sharesOutstanding: 12.1e9, earningsPerShare: 9.4, averageVolume: 31e6 },
  AMZN: { price: 221.6, dailyVolatility: 0.019, sharesOutstanding: 10.6e9, earningsPerShare: 6.15, averageVolume: 45e6 },
  META: { price: 712.2, dailyVolatility: 0.022, sharesOutstanding: 2.52e9, earningsPerShare: 26.8, averageVolume: 13e6 },
  TSLA: { price: 428.9, dailyVolatility: 0.035, sharesOutstanding: 3.22e9, earningsPerShare: 1.95, averageVolume: 98e6 },
  JPM: { price: 305.45, dailyVolatility: 0.013, sharesOutstanding: 2.75e9, earningsPerShare: 19.9, averageVolume: 9e6 },
  V: { price: 348.1, dailyVolatility: 0.011, sharesOutstanding: 1.95e9, earningsPerShare: 10.6, averageVolume: 6.5e6 },
  NFLX: { price: 1184.5, dailyVolatility: 0.024, sharesOutstanding: 0.428e9, earningsPerShare: 24.1, averageVolume: 3.8e6 },
  // Indices: levels, not prices, and no volume.
  SPX: { price: 6712.4, dailyVolatility: 0.009 },
  IXIC: { price: 22684.15, dailyVolatility: 0.012 },
  DJI: { price: 46190.6, dailyVolatility: 0.008 },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const rngFor = (key: string): Rng => mulberry32(hashString(key) ^ DATASET_SEED);

/** Daily closes for every trading day from 5 years before ANCHOR_DAY through `lastDay`. */
function closes(symbol: string, spec: Spec, lastDay: number): { days: number[]; closes: number[] } {
  const rng = rngFor(symbol);
  const pastDays = tradingDaysEndingAt(ANCHOR_DAY, HISTORY_BARS);
  const annualReturn = -0.1 + rng() * 0.4; // somewhere between -10% and +30% a year
  const start = spec.price / (1 + annualReturn) ** 5;
  const values = bridge(rng, start, spec.price, pastDays.length - 1, spec.dailyVolatility);

  // After the anchor, each day's move is seeded by its own date.
  const futureDays = tradingDaysAfter(ANCHOR_DAY, lastDay);
  let price = spec.price;
  for (const day of futureDays) {
    const dayRng = rngFor(`${symbol}:${day}`);
    // A small upward drift (about 7% a year), like stock markets over time.
    price *= Math.exp(gaussian(dayRng) * spec.dailyVolatility + 0.00027);
    values.push(price);
  }
  return { days: [...pastDays, ...futureDays], closes: values.map(round2) };
}

/** Builds a day's open, high, low and volume around its close. */
function toBar(symbol: string, spec: Spec, day: number, close: number, previousClose: number): DailyBar {
  const rng = rngFor(`${symbol}:${day}:bar`);
  const open = round2(previousClose * (1 + gaussian(rng) * spec.dailyVolatility * 0.3));
  const high = round2(Math.max(open, close) * (1 + Math.abs(gaussian(rng)) * spec.dailyVolatility * 0.4));
  const low = round2(Math.min(open, close) * (1 - Math.abs(gaussian(rng)) * spec.dailyVolatility * 0.4));
  const volume = spec.averageVolume ? Math.round(spec.averageVolume * (0.6 + rng() * 0.8)) : null;
  // No splits or dividends in the mock market, so the adjusted close is the close.
  return { time: day + CLOSE_OFFSET, open, high, low, close, volume, adjClose: close };
}

/** The mock series for `symbol` as of `now`. Throws for a symbol it doesn't know. */
export function mockSeries(symbol: string, now: number): Series {
  const spec = SPECS[symbol];
  if (!spec) throw new Error(`The mock market has no data for ${symbol}`);
  // Never earlier than the anchor, so the original dataset is always complete.
  const lastDay = Math.max(ANCHOR_DAY, latestClosedTradingDay(now));
  const { days, closes: values } = closes(symbol, spec, lastDay);
  const bars = days.map((day, i) => toBar(symbol, spec, day, values[i], values[i - 1] ?? values[i])).slice(-HISTORY_BARS);
  const price = bars[bars.length - 1].close;
  return {
    bars,
    marketCap: spec.sharesOutstanding ? price * spec.sharesOutstanding : null,
    peRatio: spec.earningsPerShare ? Math.round((price / spec.earningsPerShare) * 10) / 10 : null,
  };
}

export const mockProvider: MarketDataProvider = {
  source: "mock",
  indexSymbol: (index) => index.symbol,
  getSeries: async (symbol, now) => mockSeries(symbol, now),
};
