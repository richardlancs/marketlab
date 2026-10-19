/**
 * The market data the app reads: every stock and index with ~5 years of
 * daily history. Server code only.
 *
 * getMarket() is cached ('use cache') for about an hour: the first request
 * after that builds a fresh snapshot in the background while visitors keep
 * getting the cached one. Pages that use it are still pre-rendered at build
 * time and refresh themselves from then on. The current time is read inside
 * the cache, so "today" for the moving mock market advances with each refresh.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { MarketIndex, Stock } from "../types";
import { buildMarket, toQuote, type Market } from "./build";
import { mockProvider } from "./mock";
import { isTiingoBlocked, marketMode } from "./mode";
import type { Listing, MarketDataProvider } from "./provider";
import { isSymbolFormat, normalizeSymbol } from "./symbols";
import { createTiingoProvider } from "./tiingo";
import { STOCK_SYMBOLS } from "./universe";

export type { Market } from "./build";
export type { Listing } from "./provider";
export { FEATURED_SYMBOL, STOCK_SYMBOLS } from "./universe";

let warnedBlocked = false;

/**
 * Real prices when TIINGO_API_KEY is set, the mock market otherwise.
 * MARKET_DATA_SOURCE=mock forces the mock market even with a key set, and a
 * public Vercel deployment always uses it (see ./mode.ts).
 */
function selectProvider(): MarketDataProvider {
  if (isTiingoBlocked() && !warnedBlocked) {
    warnedBlocked = true;
    console.warn("[market] TIINGO_API_KEY is set on a Vercel deployment and ignored: Tiingo's free plan forbids public display. Set MARKET_DATA_PRIVATE=1 only if this deployment is private.");
  }
  return marketMode() === "tiingo" ? createTiingoProvider(process.env.TIINGO_API_KEY as string) : mockProvider;
}

export async function getMarket(): Promise<Market> {
  "use cache";
  cacheTag("market");
  const now = Date.now();
  const provider = selectProvider();
  try {
    const market = await buildMarket(provider, now);
    cacheLife("hours");
    return market;
  } catch (error) {
    // The real source failed (bad key, request limit, network). Show the mock
    // market with a notice rather than an error page, and keep this fallback
    // only briefly ('minutes' = refreshed after a minute) so it retries soon.
    console.error("[market] Falling back to mock data:", error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return { ...(await buildMarket(mockProvider, now)), notice: "Live prices are unavailable right now, so this shows mock data." };
  }
}

export async function getStocks(): Promise<Stock[]> {
  return (await getMarket()).stocks;
}

/** A core stock (one of the ten on the dashboard), from the shared snapshot. */
export async function getStock(symbol: string): Promise<Stock | undefined> {
  return (await getStocks()).find((s) => s.symbol === symbol);
}

/** The listing, null if there's no such stock, or "failed" if the source couldn't be asked. */
async function cachedListing(symbol: string): Promise<Listing | null | "failed"> {
  "use cache";
  cacheTag(`listing:${symbol}`);
  try {
    const listing = await selectProvider().getListing(symbol);
    // Names hardly change; "no such stock" is kept for days, so typos stay cheap.
    if (listing) cacheLife("weeks");
    else cacheLife("days");
    return listing;
  } catch (error) {
    console.error(`[market] Couldn't look up ${symbol}:`, error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return "failed";
  }
}

async function lookUp(input: string): Promise<Listing | null | "failed"> {
  const symbol = normalizeSymbol(input);
  if (!isSymbolFormat(symbol)) return null;
  // Normalized before the cached call, so "aapl" and "AAPL" share one cache entry.
  return cachedListing(symbol);
}

/**
 * The stock's name and sector, or null if it doesn't exist in the current
 * data source (or can't be checked right now). Accepts any spelling
 * ("brk.b"); this is what server code uses to check a symbol from a request
 * is real.
 */
export async function getListing(input: string): Promise<Listing | null> {
  const listing = await lookUp(input);
  return listing === "failed" ? null : listing;
}

/** Prices for a stock outside the core, cached per symbol. Null when they can't be loaded right now. */
async function cachedExtraStock(listing: Listing): Promise<Stock | null> {
  "use cache";
  cacheTag(`stock:${listing.symbol}`);
  try {
    const series = await selectProvider().getSeries(listing.symbol, Date.now());
    cacheLife("hours");
    return { ...toQuote(listing.symbol, listing.name, series.bars), sector: listing.sector, marketCap: series.marketCap, peRatio: series.peRatio };
  } catch (error) {
    // Unlike the core market, there's no mock fallback here: made-up prices
    // next to a real ticker would mislead. Retried after a minute.
    console.error(`[market] Couldn't load prices for ${listing.symbol}:`, error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return null;
  }
}

export type StockDetail = { status: "ok"; stock: Stock } | { status: "unavailable"; listing: Listing };

/**
 * Any stock: a core one from the shared snapshot (so the dashboard and its
 * page always agree), any other from its own cache. Null if no such stock
 * exists; "unavailable" if it exists but its prices can't be loaded right now.
 */
export async function getStockDetail(input: string): Promise<StockDetail | null> {
  const symbol = normalizeSymbol(input);
  if (STOCK_SYMBOLS.includes(symbol)) {
    const stock = await getStock(symbol);
    return stock ? { status: "ok", stock } : null;
  }
  const listing = await lookUp(symbol);
  if (!listing) return null;
  // The ticker couldn't even be looked up (out of requests, say): it may well exist, so don't call it unknown.
  if (listing === "failed") return { status: "unavailable", listing: { symbol, name: symbol, sector: null } };
  const stock = await cachedExtraStock(listing);
  return stock ? { status: "ok", stock } : { status: "unavailable", listing };
}

export async function getIndices(): Promise<MarketIndex[]> {
  return (await getMarket()).indices;
}

/** The biggest percentage gainers and losers today, strongest first. */
export async function getTopMovers(count = 3): Promise<{ gainers: Stock[]; losers: Stock[] }> {
  const byChange = [...(await getStocks())].sort((a, b) => b.changePercent - a.changePercent);
  // Moves smaller than 0.005% display as "0.00%", so they don't count as gaining or losing.
  const MIN_MOVE = 0.00005;
  return {
    gainers: byChange.filter((s) => s.changePercent >= MIN_MOVE).slice(0, count),
    losers: byChange.filter((s) => s.changePercent <= -MIN_MOVE).reverse().slice(0, count),
  };
}
