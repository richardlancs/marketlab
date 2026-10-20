/**
 * The mock market: prices generated from fixed seeds, so every run sees the
 * same numbers, and moving forward one trading day at a time with the real
 * calendar.
 *
 * - Up to ANCHOR_DAY (Oct 16, 2026), each history is a random path that ends
 *   at the stock's real price that day (./anchors.ts). Only that end point
 *   is real: the path to it is made up.
 * - After it, each day's move comes from a seed made of the symbol and that
 *   day's date. A day's price therefore never changes once it exists, no
 *   matter when you look: tomorrow simply adds one more day.
 */
import { bridge, gaussian, hashString, mulberry32, type Rng } from "../random";
import { intradayPrices } from "./intraday";
import type { CorporateAction, DailyBar } from "../types";
import { ANCHORS, INDEX_ANCHORS } from "./anchors";
import { catalogEntry } from "./catalog";
import { CLOSE_OFFSET, latestClosedTradingDay, tradingDaysAfter, tradingDaysEndingAt } from "./calendar";
import type { MarketDataProvider, Series } from "./provider";
import { isSymbolFormat } from "./symbols";

/** Change this to get a completely different (but still reproducible) dataset. */
const DATASET_SEED = 2026;

/** The day the original, frozen dataset ended. Prices on this day match it exactly. */
export const ANCHOR_DAY = Date.UTC(2026, 9, 16);

/**
 * Dividends and splits only happen from this day on (the start of Phase 7),
 * so every close before it stays exactly as it was. Adjusted closes before
 * an event do change once it happens, as they do with real data.
 */
export const ACTIONS_START = Date.UTC(2026, 9, 19);

/** Trading days between a payer's dividends: about a quarter. */
const DIVIDEND_EVERY = 63;
/** A stock splits once its price reaches this many times its starting price, as companies tend to after a big run. */
const SPLIT_WHEN = 2.5;

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
  /** Stocks only: yearly dividend as a fraction of the price (0 = none). */
  dividendYield?: number;
}

/**
 * The core stocks' typical daily moves, P/E ratios and trading volumes: not
 * real figures, but in the right range. Their starting prices and market caps
 * are real (./anchors.ts).
 */
const CORE: Record<string, { dailyVolatility: number; peRatio: number; averageVolume: number }> = {
  AAPL: { dailyVolatility: 0.016, peRatio: 35, averageVolume: 52e6 },
  MSFT: { dailyVolatility: 0.015, peRatio: 36.9, averageVolume: 21e6 },
  NVDA: { dailyVolatility: 0.028, peRatio: 48.4, averageVolume: 210e6 },
  GOOGL: { dailyVolatility: 0.018, peRatio: 25.1, averageVolume: 31e6 },
  AMZN: { dailyVolatility: 0.019, peRatio: 36, averageVolume: 45e6 },
  META: { dailyVolatility: 0.022, peRatio: 26.6, averageVolume: 13e6 },
  TSLA: { dailyVolatility: 0.035, peRatio: 220, averageVolume: 98e6 },
  JPM: { dailyVolatility: 0.013, peRatio: 15.3, averageVolume: 9e6 },
  V: { dailyVolatility: 0.011, peRatio: 32.8, averageVolume: 6.5e6 },
  NFLX: { dailyVolatility: 0.024, peRatio: 49.1, averageVolume: 38e6 },
};

/** The indices' typical daily moves. Their levels are in ./anchors.ts. */
const INDEX_VOLATILITY: Record<string, number> = { SPX: 0.009, IXIC: 0.012, DJI: 0.008 };

const round2 = (n: number) => Math.round(n * 100) / 100;
const rngFor = (key: string): Rng => mulberry32(hashString(key) ^ DATASET_SEED);

/** A random number between `min` and `max` where each doubling is equally likely (prices, sizes). */
const logUniform = (rng: Rng, min: number, max: number) => min * Math.exp(rng() * Math.log(max / min));

/**
 * The spec for any symbol. Catalog stocks and the indices start from their
 * real price, market cap and (roughly) dividend yield (./anchors.ts); the
 * rest of the numbers are generated from the symbol itself, the same every
 * time. Which symbols *exist* in the mock market is the catalog's job
 * (./catalog.ts); this only has to give each one believable numbers.
 */
export function specFor(symbol: string): Spec {
  const index = INDEX_ANCHORS[symbol];
  if (index !== undefined) return { price: index, dailyVolatility: INDEX_VOLATILITY[symbol] ?? 0.01 };
  const rng = rngFor(`${symbol}:spec`);
  const anchor = ANCHORS[symbol];
  // Drawn even when there's an anchor, so each stock's other numbers don't depend on whether it has one.
  const generatedPrice = round2(logUniform(rng, 15, 600));
  const generatedCap = logUniform(rng, 10e9, 500e9);
  const generatedPe = 10 + rng() * 35;
  const generatedVolatility = 0.012 + rng() * 0.023;
  const generatedVolume = logUniform(rng, 2e6, 40e6);
  const generatedYield = rng() < 0.6 ? 0.005 + rng() * 0.03 : 0;
  const core = CORE[symbol];
  const price = anchor ? anchor[0] : generatedPrice;
  const peRatio = core?.peRatio ?? generatedPe;
  return {
    price,
    dailyVolatility: core?.dailyVolatility ?? generatedVolatility,
    sharesOutstanding: (anchor ? anchor[1] * 1e9 : generatedCap) / price,
    earningsPerShare: price / peRatio,
    averageVolume: core?.averageVolume ?? generatedVolume,
    dividendYield: anchor ? anchor[2] / 100 : generatedYield,
  };
}

/**
 * Daily closes for every trading day from 5 years before ANCHOR_DAY through
 * `lastDay`, as traded (not adjusted), and the dividends and splits after
 * ACTIONS_START. Stocks that pay a dividend (most of them, at roughly their
 * real yield) pay it every quarter; indices never do.
 */
function closes(symbol: string, spec: Spec, lastDay: number): { days: number[]; closes: number[]; actions: CorporateAction[] } {
  const rng = rngFor(symbol);
  const pastDays = tradingDaysEndingAt(ANCHOR_DAY, HISTORY_BARS);
  const annualReturn = -0.1 + rng() * 0.4; // somewhere between -10% and +30% a year
  const start = spec.price / (1 + annualReturn) ** 5;
  const values = bridge(rng, start, spec.price, pastDays.length - 1, spec.dailyVolatility);

  const yearlyYield = spec.dividendYield ?? 0;
  const paysDividends = yearlyYield > 0;
  const firstDividend = Math.floor(rngFor(`${symbol}:dividends`)() * DIVIDEND_EVERY); // spreads ex-dates across the quarter

  // After the anchor, each day's move is seeded by its own date.
  const futureDays = tradingDaysAfter(ANCHOR_DAY, lastDay);
  const actions: CorporateAction[] = [];
  let price = spec.price;
  let sinceStart = 0;
  for (const day of futureDays) {
    const dayRng = rngFor(`${symbol}:${day}`);
    // A small upward drift (about 7% a year), like stock markets over time.
    price *= Math.exp(gaussian(dayRng) * spec.dailyVolatility + 0.00027);
    if (day >= ACTIONS_START) {
      const time = day + CLOSE_OFFSET;
      // On the ex-date the price drops by the dividend, or by the split ratio.
      if (paysDividends && sinceStart % DIVIDEND_EVERY === firstDividend) {
        const amount = round2((price * yearlyYield) / 4);
        if (amount > 0) {
          actions.push({ symbol, time, kind: "dividend", amount });
          price -= amount;
        }
      }
      if (spec.sharesOutstanding !== undefined && price > SPLIT_WHEN * spec.price) {
        // Back to about the starting price: 2-for-1, 3-for-1…
        const ratio = Math.max(2, Math.round(price / spec.price));
        actions.push({ symbol, time, kind: "split", ratio });
        price /= ratio;
      }
      sinceStart++;
    }
    values.push(price);
  }
  return { days: [...pastDays, ...futureDays], closes: values.map(round2), actions };
}

/**
 * Adjusted closes: each close scaled down by every dividend and split after
 * it, so a whole history compares like for like (what charts and backtests
 * use). A dividend multiplies earlier closes by (1 − amount / the previous
 * close); a split by 1 / ratio.
 */
function adjust(days: number[], values: number[], actions: CorporateAction[]): number[] {
  const factorAt = new Map<number, number>(); // index of the ex-date → factor for every close before it
  for (const action of actions) {
    const i = days.indexOf(action.time - CLOSE_OFFSET);
    if (i <= 0) continue;
    const factor = action.kind === "split" ? 1 / action.ratio : 1 - action.amount / values[i - 1];
    factorAt.set(i, (factorAt.get(i) ?? 1) * factor);
  }
  const adjusted = new Array<number>(values.length);
  let factor = 1;
  for (let i = values.length - 1; i >= 0; i--) {
    adjusted[i] = factor === 1 ? values[i] : Math.round(values[i] * factor * 10_000) / 10_000;
    factor *= factorAt.get(i) ?? 1;
  }
  return adjusted;
}

/** Builds a day's open, high, low and volume around its close. */
function toBar(symbol: string, spec: Spec, day: number, close: number, previousClose: number, adjClose: number): DailyBar {
  const rng = rngFor(`${symbol}:${day}:bar`);
  const open = round2(previousClose * (1 + gaussian(rng) * spec.dailyVolatility * 0.3));
  const high = round2(Math.max(open, close) * (1 + Math.abs(gaussian(rng)) * spec.dailyVolatility * 0.4));
  const low = round2(Math.min(open, close) * (1 - Math.abs(gaussian(rng)) * spec.dailyVolatility * 0.4));
  const volume = spec.averageVolume ? Math.round(spec.averageVolume * (0.6 + rng() * 0.8)) : null;
  return { time: day + CLOSE_OFFSET, open, high, low, close, volume, adjClose };
}

/** The mock series for `symbol` as of `now`. Throws for a malformed symbol. */
export function mockSeries(symbol: string, now: number): Series {
  if (!isSymbolFormat(symbol)) throw new Error(`The mock market has no data for ${symbol}`);
  const spec = specFor(symbol);
  // Never earlier than the anchor, so the original dataset is always complete.
  const lastDay = Math.max(ANCHOR_DAY, latestClosedTradingDay(now));
  const { days, closes: values, actions } = closes(symbol, spec, lastDay);
  const adjusted = adjust(days, values, actions);
  // A split day opens near the new (split) price, not the old one.
  const opensFrom = (i: number) => {
    const split = actions.find((a) => a.kind === "split" && a.time === days[i] + CLOSE_OFFSET);
    const previous = values[i - 1] ?? values[i];
    return split?.kind === "split" ? previous / split.ratio : previous;
  };
  const bars = days.map((day, i) => toBar(symbol, spec, day, values[i], opensFrom(i), adjusted[i])).slice(-HISTORY_BARS);
  const price = bars[bars.length - 1].close;
  // After a split there are more shares, each earning less, so market cap and P/E don't jump.
  const splits = actions.reduce((product, a) => (a.kind === "split" ? product * a.ratio : product), 1);
  return {
    bars,
    marketCap: spec.sharesOutstanding ? price * spec.sharesOutstanding * splits : null,
    peRatio: spec.earningsPerShare ? Math.round((price / (spec.earningsPerShare / splits)) * 10) / 10 : null,
    actions: actions.filter((a) => a.time >= bars[0].time),
    intraday: intradayPrices(symbol, bars),
  };
}

export const mockProvider: MarketDataProvider = {
  source: "mock",
  indexSymbol: (index) => index.symbol,
  getSeries: async (symbol, now) => mockSeries(symbol, now),
  // The mock market has exactly the catalog's stocks.
  getListing: async (symbol) => {
    const entry = catalogEntry(symbol);
    return entry ? { ...entry } : null;
  },
};
