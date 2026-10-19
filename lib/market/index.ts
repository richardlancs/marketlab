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
import { buildMarket, type Market } from "./build";
import { mockProvider } from "./mock";
import type { MarketDataProvider } from "./provider";
import { createTiingoProvider } from "./tiingo";

export type { Market } from "./build";
export { FEATURED_SYMBOL, STOCK_SYMBOLS } from "./universe";

/**
 * Real prices when TIINGO_API_KEY is set, the mock market otherwise.
 * MARKET_DATA_SOURCE=mock forces the mock market even with a key set.
 */
function selectProvider(): MarketDataProvider {
  const key = process.env.TIINGO_API_KEY;
  if (process.env.MARKET_DATA_SOURCE === "mock" || !key) return mockProvider;
  return createTiingoProvider(key);
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

export async function getStock(symbol: string): Promise<Stock | undefined> {
  return (await getStocks()).find((s) => s.symbol === symbol);
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
