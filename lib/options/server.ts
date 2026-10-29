/**
 * The options lab's server side: the simulated chain for a stock, from the
 * analytics service (services/analytics/analytics/options.py), cached for
 * the day's prices.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { syncPrices } from "../analytics/server";
import { post, pythonConfigured, PythonEngineError } from "../backtest/python-client";
import type { Account } from "../trading";
import { priceSource } from "../market";
import { parseChain, type OptionChain } from "./types";

export type ChainResult = { ok: true; chain: OptionChain } | { ok: false; message: string };

/** A stock's simulated chain, priced from its stored prices. Cached for an hour; a failure isn't cached. */
export async function getChain(symbol: string): Promise<ChainResult> {
  try {
    return { ok: true, chain: await cachedChain(symbol, priceSource()) };
  } catch (error) {
    return { ok: false, message: error instanceof PythonEngineError ? error.message : "The option chain couldn't be calculated. Try again in a minute." };
  }
}

async function cachedChain(symbol: string, source: string): Promise<OptionChain> {
  "use cache";
  cacheTag("market", `options:${symbol}`);
  cacheLife("hours");
  await syncPrices([symbol]);
  const data = await post("/v1/options/chain", { source, symbol }, "Option chain");
  const chain = parseChain(data.chain);
  if (!chain) throw new PythonEngineError("The option chain came back in a form MarketLab couldn't read.");
  return chain;
}

/**
 * Has the analytics service value an account's option positions at the
 * latest close (services/analytics/analytics/option_marks.py), if any are
 * unmarked or behind it. The nightly job does this for every account; this
 * covers a new position, or a visit before the job. Returns true if it asked
 * (the account should be read again); a failure only logs, and the stored
 * marks (or the prices paid) stand in.
 */
export async function refreshOptionMarks(accountId: string, account: Account): Promise<boolean> {
  const latest = account.processedThrough ?? 0;
  const symbols = [...new Set((account.options ?? []).filter((o) => o.markedAt === undefined || o.markedAt < latest).map((o) => o.symbol))];
  if (symbols.length === 0 || !pythonConfigured()) return false;
  try {
    await syncPrices(symbols);
    await post("/v1/options/marks", { source: priceSource(), ownerId: accountId }, "Option marks");
    return true;
  } catch (error) {
    console.error("[options] Marking positions failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * The chain's price (per share) for a contract at the latest close: from
 * today's chain when it lists it, otherwise (an older position's strike, or
 * an expiry under a week away) Black-Scholes at the chain's price, volatility
 * and yield, as the chain itself is priced.
 */
export async function contractPrice(symbol: string, kind: "call" | "put", strike: number, expiry: string): Promise<{ ok: true; price: number } | { ok: false; message: string }> {
  const chain = await getChain(symbol);
  if (!chain.ok) return chain;
  const listed = chain.chain.expiries.find((e) => e.expiry === expiry)?.strikes.find((s) => s.strike === strike);
  if (listed) return { ok: true, price: listed[kind].price };
  const today = new Date(chain.chain.asOf).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(expiry) - Date.parse(today)) / 86_400_000);
  if (days < 0) return { ok: false, message: "That option has expired." };
  try {
    const priced = await post(
      "/v1/options/price",
      { kind, spot: chain.chain.spot, strike, days, volatility: chain.chain.volatility, rate: chain.chain.rate, dividendYield: chain.chain.dividendYield },
      "Option price",
    );
    return typeof priced.price === "number" ? { ok: true, price: priced.price } : { ok: false, message: "That option has no price right now." };
  } catch (error) {
    return { ok: false, message: error instanceof PythonEngineError ? error.message : "That option couldn't be priced. Try again in a minute." };
  }
}
