/**
 * Real end-of-day prices from Tiingo (https://www.tiingo.com).
 *
 * Licensing: Tiingo's free plan is for personal use only. It may not be shown
 * to other people, so a public deployment must not set TIINGO_API_KEY (the app
 * then uses the mock market). See the README.
 *
 * The free plan allows 50 requests an hour and 1,000 a day. The app needs one
 * request per symbol (13) per refresh, and refreshes at most hourly.
 */
import type { DailyBar } from "../types";
import { CLOSE_OFFSET, DAY } from "./calendar";
import type { MarketDataProvider, Series } from "./provider";

const API = "https://api.tiingo.com/tiingo/daily";
/** Slightly over 5 years, so the 5-year view always has the close it starts from. */
const HISTORY_DAYS = 5 * 366 + 10;

export class TiingoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TiingoError";
  }
}

const isPrice = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Turns Tiingo's JSON (an array of daily rows) into bars, oldest first.
 * Rows with a missing or invalid field are dropped rather than trusted.
 */
export function parseTiingoPrices(data: unknown): DailyBar[] {
  if (!Array.isArray(data)) throw new TiingoError("Unexpected response from Tiingo (not a list of prices).");
  const bars: DailyBar[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null) continue;
    const { date, open, high, low, close, volume, adjClose } = row as Record<string, unknown>;
    const time = typeof date === "string" ? Date.parse(date) : Number.NaN;
    if (!Number.isFinite(time) || ![open, high, low, close, adjClose].every(isPrice)) continue;
    // Tiingo dates are midnight UTC of the trading day; bars use the close time.
    const day = Math.floor(time / DAY) * DAY;
    bars.push({
      time: day + CLOSE_OFFSET,
      open: open as number,
      high: high as number,
      low: low as number,
      close: close as number,
      volume: typeof volume === "number" && Number.isFinite(volume) && volume >= 0 ? volume : null,
      adjClose: adjClose as number,
    });
  }
  bars.sort((a, b) => a.time - b.time);
  if (bars.length < 2) throw new TiingoError("Tiingo returned too little price history.");
  return bars;
}

const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

// Responses are kept for an hour per symbol. In production the page cache
// already limits fetching to about once an hour, but in development every code
// change rebuilds the market; without this, a few edits would use up the free
// plan's 50 requests an hour. It lives on globalThis so it survives reloads of
// this module during development.
const TTL = 60 * 60 * 1000;
const memo: Map<string, { at: number; bars: DailyBar[] }> = ((globalThis as { __tiingoMemo?: Map<string, { at: number; bars: DailyBar[] }> }).__tiingoMemo ??=
  new Map());

export function createTiingoProvider(apiKey: string, fetchImpl: typeof fetch = fetch): MarketDataProvider {
  async function fetchBars(symbol: string, now: number): Promise<DailyBar[]> {
    const cached = memo.get(symbol);
    if (cached && now - cached.at < TTL) return cached.bars;

    const url = `${API}/${encodeURIComponent(symbol)}/prices?startDate=${isoDate(now - HISTORY_DAYS * DAY)}`;
    // The key goes in a header, not the URL, so it never ends up in logs.
    const response = await fetchImpl(url, { headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" } });
    if (!response.ok) {
      const reason =
        response.status === 401 || response.status === 403
          ? "the API key was rejected"
          : response.status === 429
            ? "the request limit was reached"
            : `HTTP ${response.status}`;
      throw new TiingoError(`Tiingo request for ${symbol} failed: ${reason}.`, response.status);
    }
    const bars = parseTiingoPrices(await response.json());
    memo.set(symbol, { at: now, bars });
    return bars;
  }

  return {
    source: "tiingo",
    // Tiingo's end-of-day data covers funds but not indices, so show the fund that tracks each one.
    indexSymbol: (index) => index.fund,
    async getSeries(symbol, now): Promise<Series> {
      // End-of-day data has no market cap or P/E.
      return { bars: await fetchBars(symbol, now), marketCap: null, peRatio: null };
    },
  };
}

/** For tests: forget cached responses. */
export const clearTiingoMemo = () => memo.clear();
