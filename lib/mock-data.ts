/**
 * Mock market data. Everything is generated from fixed seeds, so the numbers
 * are identical on every run, on the server and in the browser.
 *
 * The getters are `async` on purpose: a real market-data API will be async,
 * so components that `await` these now won't need to change later.
 */
import { bridge, gaussian, hashString, mulberry32, type Rng } from "./random";
import type { MarketIndex, PricePoint, Quote, Stock } from "./types";

/** Change this to get a completely different (but still reproducible) dataset. */
const DATASET_SEED = 2026;

// ---------------------------------------------------------------------------
// Market calendar
// ---------------------------------------------------------------------------

/** The last trading day in the dataset (Friday, Oct 16, 2026), at 00:00 UTC. */
export const AS_OF_DAY = Date.UTC(2026, 9, 16);

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
// US market hours (9:30–16:00 New York time) expressed in UTC during daylight
// saving time. A simplification: real data would shift by an hour in winter.
const OPEN_OFFSET = 13.5 * HOUR;
const CLOSE_OFFSET = 20 * HOUR;

/** The last `count` weekdays up to and including AS_OF_DAY, oldest first. Holidays are ignored. */
export function tradingDays(count: number): number[] {
  const days: number[] = [];
  for (let day = AS_OF_DAY; days.length < count; day -= 24 * HOUR) {
    const weekday = new Date(day).getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (weekday !== 0 && weekday !== 6) days.unshift(day);
  }
  return days;
}

/** Timestamps from market open to close (both included) every `stepMinutes`. */
function intradayTimes(day: number, stepMinutes: number): number[] {
  const times: number[] = [];
  for (let t = day + OPEN_OFFSET; t <= day + CLOSE_OFFSET; t += stepMinutes * MINUTE) {
    times.push(t);
  }
  return times;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toPoints(times: number[], prices: number[]): PricePoint[] {
  return times.map((time, i) => ({ time, price: round2(prices[i]) }));
}

// ---------------------------------------------------------------------------
// Quote generation
// ---------------------------------------------------------------------------

interface QuoteSpec {
  symbol: string;
  name: string;
  /** The "current" price: every series ends exactly here. */
  price: number;
  /** Typical daily move as a fraction (0.02 = 2%). */
  dailyVolatility: number;
}

const rngFor = (key: string): Rng => mulberry32(hashString(key) ^ DATASET_SEED);

/**
 * Builds a full quote with history for every timeframe.
 * - 1Y: ~252 daily closes, bridged from a random starting price to `price`.
 * - 1M: the last 22 of those daily closes.
 * - 1W: 30-minute points over the last 5 trading days.
 * - 1D: 5-minute points over the last trading day, from today's open to `price`.
 */
export function generateQuote({ symbol, name, price, dailyVolatility: vol }: QuoteSpec): Quote {
  const rng = rngFor(symbol);

  const days = tradingDays(252);
  const yearReturn = -0.2 + rng() * 0.8; // somewhere between -20% and +60%
  const dailyPrices = bridge(rng, price / (1 + yearReturn), price, days.length - 1, vol);
  const daily = toPoints(
    days.map((day) => day + CLOSE_OFFSET),
    dailyPrices,
  );

  const previousClose = daily[daily.length - 2].price;
  const open = round2(previousClose * (1 + gaussian(rng) * vol * 0.3));

  // Intraday volatility is scaled down so a full day adds up to `vol`.
  const dayTimes = intradayTimes(AS_OF_DAY, 5);
  const intraday = toPoints(dayTimes, bridge(rng, open, price, dayTimes.length - 1, vol / Math.sqrt(dayTimes.length)));

  const weekTimes = days.slice(-5).flatMap((day) => intradayTimes(day, 30));
  const weekStart = daily[daily.length - 6].price; // the close before this week
  const week = toPoints(weekTimes, bridge(rng, weekStart, price, weekTimes.length - 1, vol / Math.sqrt(14)));

  const intradayPrices = intraday.map((p) => p.price);

  return {
    symbol,
    name,
    price,
    previousClose,
    change: round2(price - previousClose),
    changePercent: (price - previousClose) / previousClose,
    open,
    high: Math.max(...intradayPrices),
    low: Math.min(...intradayPrices),
    history: {
      "1D": intraday,
      "1W": week,
      "1M": daily.slice(-22),
      "1Y": daily,
    },
  };
}

interface StockSpec extends QuoteSpec {
  sector: string;
  sharesOutstanding: number;
  earningsPerShare: number;
  averageVolume: number;
}

export function generateStock(spec: StockSpec): Stock {
  const quote = generateQuote(spec);
  // A separate seed, so adding stats never changes the price history.
  const rng = rngFor(`${spec.symbol}:stats`);
  return {
    ...quote,
    sector: spec.sector,
    volume: Math.round(spec.averageVolume * (0.6 + rng() * 0.8)),
    marketCap: spec.price * spec.sharesOutstanding,
    peRatio: Math.round((spec.price / spec.earningsPerShare) * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// The dataset (fictional values, loosely modeled on real companies)
// ---------------------------------------------------------------------------

const STOCK_SPECS: StockSpec[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", price: 248.3, dailyVolatility: 0.016, sharesOutstanding: 14.9e9, earningsPerShare: 7.1, averageVolume: 52e6 },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology", price: 512.75, dailyVolatility: 0.015, sharesOutstanding: 7.43e9, earningsPerShare: 13.9, averageVolume: 21e6 },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Semiconductors", price: 186.4, dailyVolatility: 0.028, sharesOutstanding: 24.3e9, earningsPerShare: 3.85, averageVolume: 210e6 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Communication Services", price: 236.15, dailyVolatility: 0.018, sharesOutstanding: 12.1e9, earningsPerShare: 9.4, averageVolume: 31e6 },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumer Discretionary", price: 221.6, dailyVolatility: 0.019, sharesOutstanding: 10.6e9, earningsPerShare: 6.15, averageVolume: 45e6 },
  { symbol: "META", name: "Meta Platforms Inc.", sector: "Communication Services", price: 712.2, dailyVolatility: 0.022, sharesOutstanding: 2.52e9, earningsPerShare: 26.8, averageVolume: 13e6 },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Consumer Discretionary", price: 428.9, dailyVolatility: 0.035, sharesOutstanding: 3.22e9, earningsPerShare: 1.95, averageVolume: 98e6 },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials", price: 305.45, dailyVolatility: 0.013, sharesOutstanding: 2.75e9, earningsPerShare: 19.9, averageVolume: 9e6 },
  { symbol: "V", name: "Visa Inc.", sector: "Financials", price: 348.1, dailyVolatility: 0.011, sharesOutstanding: 1.95e9, earningsPerShare: 10.6, averageVolume: 6.5e6 },
  { symbol: "NFLX", name: "Netflix Inc.", sector: "Communication Services", price: 1184.5, dailyVolatility: 0.024, sharesOutstanding: 0.428e9, earningsPerShare: 24.1, averageVolume: 3.8e6 },
];

const INDEX_SPECS: QuoteSpec[] = [
  { symbol: "SPX", name: "S&P 500", price: 6712.4, dailyVolatility: 0.009 },
  { symbol: "IXIC", name: "Nasdaq Composite", price: 22684.15, dailyVolatility: 0.012 },
  { symbol: "DJI", name: "Dow Jones", price: 46190.6, dailyVolatility: 0.008 },
];

/** Every stock symbol in the dataset. Cheap to read, for code that only needs to check a symbol exists. */
export const STOCK_SYMBOLS: readonly string[] = STOCK_SPECS.map((spec) => spec.symbol);

export const FEATURED_SYMBOL = "AAPL";

// Generated once, when this module is first imported.
const stocks = STOCK_SPECS.map(generateStock);
const indices = INDEX_SPECS.map(generateQuote);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getStocks(): Promise<Stock[]> {
  return stocks;
}

export async function getStock(symbol: string): Promise<Stock | undefined> {
  return stocks.find((s) => s.symbol === symbol);
}

export async function getIndices(): Promise<MarketIndex[]> {
  return indices;
}

/** The biggest percentage gainers and losers today, strongest first. */
export async function getTopMovers(count = 3): Promise<{ gainers: Stock[]; losers: Stock[] }> {
  const byChange = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
  // Moves smaller than 0.005% display as "0.00%", so they don't count as gaining or losing.
  const MIN_MOVE = 0.00005;
  return {
    gainers: byChange.filter((s) => s.changePercent >= MIN_MOVE).slice(0, count),
    losers: byChange.filter((s) => s.changePercent <= -MIN_MOVE).reverse().slice(0, count),
  };
}
