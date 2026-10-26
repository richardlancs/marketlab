/**
 * The options lab's server side: the simulated chain for a stock, from the
 * analytics service (services/analytics/analytics/options.py), cached for
 * the day's prices.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { syncPrices } from "../analytics/server";
import { post, PythonEngineError } from "../backtest/python-client";
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
