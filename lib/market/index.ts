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
import type { MarketData } from "../processing";
import type { DailyBar, MarketIndex, Stock } from "../types";
import { buildMarket, toQuote, type Market } from "./build";
import { mockProvider } from "./mock";
import { isTiingoBlocked, marketMode } from "./mode";
import type { Listing, MarketDataProvider } from "./provider";
import { isSymbolFormat, normalizeSymbol } from "./symbols";
import { parseFilings, parseTickerMap, type Filing } from "./filings";
import { parseCompanyFacts, type CompanyFacts } from "./fundamentals";
import { createTiingoProvider, fetchTiingoNews, type NewsItem } from "./tiingo";
import { INDICES, STOCK_SYMBOLS } from "./universe";

export type { Market } from "./build";
export type { Listing } from "./provider";
export type { Filing } from "./filings";
export type { CompanyFacts } from "./fundamentals";
export type { NewsItem } from "./tiingo";
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
    return { ...toQuote(listing.symbol, listing.name, series.bars, series.actions, series.intraday), sector: listing.sector, marketCap: series.marketCap, peRatio: series.peRatio };
  } catch (error) {
    // Unlike the core market, there's no mock fallback here: made-up prices
    // next to a real ticker would mislead. Retried after a minute.
    console.error(`[market] Couldn't load prices for ${listing.symbol}:`, error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return null;
  }
}

/**
 * What lib/processing.ts needs to bring an account up to date: traded closes
 * and dividends/splits for these stocks, up to the market's latest close. A
 * stock whose prices are unavailable right now is left out, and processing
 * waits for it rather than skipping its closes.
 */
export async function getProcessingData(symbols: string[]): Promise<MarketData> {
  const [market, details] = await Promise.all([getMarket(), Promise.all(symbols.map(getStockDetail))]);
  const raw: MarketData["raw"] = {};
  const actions: MarketData["actions"] = {};
  details.forEach((detail, i) => {
    if (detail?.status !== "ok") return;
    raw[symbols[i]] = detail.stock.raw;
    actions[symbols[i]] = detail.stock.actions;
  });
  return { raw, actions, latest: market.asOf };
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

/** The current source's name in the price store ("mock" or "tiingo"). */
export const priceSource = () => marketMode();

export interface StoreSeries {
  bars: DailyBar[];
  marketCap: number | null;
  peRatio: number | null;
  dividendYield: number | null;
}

/** Daily bars (and fundamentals) for the price store, cached like the rest. Indices are stored under their own symbol (SPX…). Null if they can't be loaded now. */
async function cachedBars(symbol: string): Promise<StoreSeries | null> {
  "use cache";
  cacheTag("market", `bars:${symbol}`);
  const provider = selectProvider();
  const index = INDICES.find((i) => i.symbol === symbol);
  try {
    const series = await provider.getSeries(index ? provider.indexSymbol(index) : symbol, Date.now());
    cacheLife("hours");
    return { bars: series.bars, marketCap: series.marketCap, peRatio: series.peRatio, dividendYield: series.dividendYield ?? null };
  } catch (error) {
    // Never stored from a fallback: the store keeps each source's own prices.
    console.error(`[market] Couldn't load bars for ${symbol}:`, error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return null;
  }
}

export async function getBarsForStore(input: string): Promise<StoreSeries | null> {
  const symbol = normalizeSymbol(input);
  return isSymbolFormat(symbol) ? cachedBars(symbol) : null;
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

// ---------------------------------------------------------------------------
// Filings (SEC, public) and news (Tiingo, personal use only)
// ---------------------------------------------------------------------------

/** Who's asking, as the SEC requires ("MarketLab you@example.com"). Null hides filings. */
const secUserAgent = () => process.env.SEC_USER_AGENT?.trim() || null;

async function secJson(url: string, userAgent: string): Promise<unknown> {
  const response = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "application/json" } });
  if (!response.ok) throw new Error(`SEC request failed: HTTP ${response.status}`);
  return response.json();
}

async function cachedTickerMap(userAgent: string): Promise<Record<string, number>> {
  "use cache";
  cacheTag("sec-tickers");
  try {
    const map = parseTickerMap(await secJson("https://www.sec.gov/files/company_tickers.json", userAgent));
    cacheLife("weeks");
    return map;
  } catch (error) {
    console.error("[filings] Couldn't load the SEC ticker list:", error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return {};
  }
}

async function cachedFilings(symbol: string, userAgent: string): Promise<Filing[] | null> {
  "use cache";
  cacheTag(`filings:${symbol}`);
  const cik = (await cachedTickerMap(userAgent))[symbol];
  if (!cik) {
    cacheLife("days");
    return null;
  }
  try {
    const filings = parseFilings(cik, await secJson(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`, userAgent));
    cacheLife("hours");
    return filings;
  } catch (error) {
    console.error(`[filings] Couldn't load filings for ${symbol}:`, error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return null;
  }
}

/**
 * A company's reported numbers from the SEC (./fundamentals.ts), freshly
 * fetched: null if it has none to use (not an SEC filer, or not in dollars),
 * "failed" if they couldn't be fetched now (including without SEC_USER_AGENT).
 * Not cached: the file is several megabytes, so lib/fundamentals.ts stores the
 * parsed result instead.
 */
export async function fetchCompanyFacts(input: string): Promise<CompanyFacts | null | "failed"> {
  const userAgent = secUserAgent();
  const symbol = normalizeSymbol(input);
  if (!userAgent || !isSymbolFormat(symbol)) return "failed";
  const map = await cachedTickerMap(userAgent);
  if (Object.keys(map).length === 0) return "failed";
  const ciks = [map[symbol], PREDECESSORS[symbol]].filter((cik): cik is number => cik !== undefined);
  try {
    for (const cik of ciks) {
      const facts = await companyFactsOf(cik, userAgent);
      if (facts) return facts;
    }
    return null;
  } catch (error) {
    console.error(`[fundamentals] Couldn't load company facts for ${symbol}:`, error instanceof Error ? error.message : error);
    return "failed";
  }
}

/**
 * Where a ticker now belongs to a new holding company with no reports of its
 * own yet, the company that reported before it. Used only while the new one
 * has no numbers.
 */
const PREDECESSORS: Record<string, number> = {
  XOM: 34088, // Exxon Mobil Corporation, before ExxonMobil Holdings Corp (2026)
};

async function companyFactsOf(cik: number, userAgent: string): Promise<CompanyFacts | null> {
  try {
    return parseCompanyFacts(await secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`, userAgent));
  } catch (error) {
    // A company that files nothing in XBRL has no facts file at all.
    if (error instanceof Error && error.message.endsWith("HTTP 404")) return null;
    throw error;
  }
}

/** A stock's recent SEC filings, or null if there are none to show (no SEC_USER_AGENT, unknown company, SEC unavailable). */
export async function getFilings(input: string): Promise<Filing[] | null> {
  const userAgent = secUserAgent();
  const symbol = normalizeSymbol(input);
  if (!userAgent || !isSymbolFormat(symbol)) return null;
  return cachedFilings(symbol, userAgent);
}

async function cachedNews(symbol: string): Promise<NewsItem[] | null> {
  "use cache";
  cacheTag(`news:${symbol}`);
  try {
    const news = await fetchTiingoNews(process.env.TIINGO_API_KEY as string, symbol, Date.now());
    if (news) cacheLife("hours");
    else cacheLife("days"); // refused (no news on this plan) or over budget: don't keep asking
    return news;
  } catch {
    cacheLife("minutes");
    return null;
  }
}

/** News headlines, only with real data on (Tiingo's data is for personal use); otherwise null. */
export async function getNews(input: string): Promise<NewsItem[] | null> {
  const symbol = normalizeSymbol(input);
  if (marketMode() !== "tiingo" || !isSymbolFormat(symbol)) return null;
  return cachedNews(symbol);
}
