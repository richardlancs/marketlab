/**
 * Real end-of-day prices from Tiingo (https://www.tiingo.com).
 *
 * Licensing: Tiingo's free plan is for personal use only. It may not be shown
 * to other people, so a public deployment must not set TIINGO_API_KEY (the app
 * then uses the mock market). See the README.
 *
 * The free plan allows 50 requests an hour and 1,000 a day. The dashboard needs
 * one request per core symbol (13) per refresh, and refreshes at most hourly.
 * Any other ticker costs one request for its name (once, then cached for
 * weeks; catalog stocks skip it) and one per hour for prices while people look
 * at it. ./budget.ts keeps those extras from crowding out the dashboard.
 */
import type { DailyBar } from "../types";
import { createBudget, type Budget } from "./budget";
import { CLOSE_OFFSET, DAY } from "./calendar";
import { catalogEntry } from "./catalog";
import type { Listing, MarketDataProvider, Series } from "./provider";
import { INDICES, STOCK_SYMBOLS } from "./universe";

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

/**
 * Turns Tiingo's metadata for one ticker into a listing. Tiingo has no
 * sectors in this endpoint, so the sector is null.
 */
export function parseTiingoMeta(symbol: string, data: unknown): Listing {
  const name = typeof data === "object" && data !== null ? (data as Record<string, unknown>).name : undefined;
  if (typeof name !== "string" || !name.trim()) throw new TiingoError(`Unexpected metadata from Tiingo for ${symbol}.`);
  return { symbol, name: name.trim(), sector: null };
}

const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

/** The symbols the dashboard always needs: they go first in the request budget. */
const CORE = new Set([...STOCK_SYMBOLS, ...INDICES.map((index) => index.fund)]);

// Responses are kept for an hour per symbol. In production the page cache
// already limits fetching to about once an hour, but in development every code
// change rebuilds the market; without this, a few edits would use up the free
// plan's 50 requests an hour. It lives on globalThis so it survives reloads of
// this module during development.
const TTL = 60 * 60 * 1000;
// Names change rarely, so they're kept far longer. "No such ticker" is kept too,
// so a repeated typo doesn't cost a request each time.
const META_TTL = 7 * 24 * TTL;
const MISSING_TTL = 24 * TTL;

interface Memo {
  bars: Map<string, { at: number; bars: DailyBar[] }>;
  meta: Map<string, { at: number; listing: Listing | null }>;
  budget: Budget;
}
const memo: Memo = ((globalThis as { __marketlabTiingo?: Memo }).__marketlabTiingo ??= { bars: new Map(), meta: new Map(), budget: createBudget() });

export function createTiingoProvider(apiKey: string, fetchImpl: typeof fetch = fetch): MarketDataProvider {
  /** One request to Tiingo, counted against the budget. Returns null for a 404 (no such ticker). */
  async function request(symbol: string, path: string, now: number): Promise<unknown> {
    if (!memo.budget.take(CORE.has(symbol), now)) {
      throw new TiingoError(`Skipped the Tiingo request for ${symbol}: the hourly request budget is used up.`, 429);
    }
    // The key goes in a header, not the URL, so it never ends up in logs.
    const response = await fetchImpl(`${API}/${encodeURIComponent(symbol)}${path}`, {
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      if (response.status === 429) memo.budget.exhaust(now);
      const reason =
        response.status === 401 || response.status === 403
          ? "the API key was rejected"
          : response.status === 429
            ? "the request limit was reached"
            : `HTTP ${response.status}`;
      throw new TiingoError(`Tiingo request for ${symbol} failed: ${reason}.`, response.status);
    }
    return response.json();
  }

  async function fetchBars(symbol: string, now: number): Promise<DailyBar[]> {
    const cached = memo.bars.get(symbol);
    if (cached && now - cached.at < TTL) return cached.bars;
    const data = await request(symbol, `/prices?startDate=${isoDate(now - HISTORY_DAYS * DAY)}`, now);
    if (data === null) throw new TiingoError(`Tiingo has no prices for ${symbol}.`, 404);
    const bars = parseTiingoPrices(data);
    memo.bars.set(symbol, { at: now, bars });
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
    async getListing(symbol) {
      // Catalog stocks already have a name (and a sector), so they cost nothing.
      const entry = catalogEntry(symbol);
      if (entry) return { ...entry };
      const now = Date.now();
      const cached = memo.meta.get(symbol);
      if (cached && now - cached.at < (cached.listing ? META_TTL : MISSING_TTL)) return cached.listing;
      const data = await request(symbol, "", now);
      const listing = data === null ? null : parseTiingoMeta(symbol, data);
      memo.meta.set(symbol, { at: now, listing });
      return listing;
    },
  };
}

/** For tests: forget cached responses and reset the request budget. */
export const clearTiingoMemo = () => {
  memo.bars.clear();
  memo.meta.clear();
  memo.budget = createBudget();
};
