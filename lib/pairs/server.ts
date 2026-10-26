/**
 * The pairs lab's server side: scans and tests through the analytics service
 * (services/analytics/analytics/pairs.py), on the stored prices. A scan
 * reads every catalog stock, so the store is filled first if it's empty
 * (as the factors need too). Server-only.
 */
import "server-only";
import { ensureFactors, syncPrices } from "../analytics/server";
import { post, PythonEngineError } from "../backtest/python-client";
import { priceSource } from "../market";
import { CATALOG } from "../market/catalog";
import { parsePairScan, parsePairTest, type PairScan, type PairSettings, type PairTest } from "./types";

/** A scan reads about a hundred stocks' prices and runs hundreds of tests. */
const TIMEOUT_MS = 30_000;

const failed = (error: unknown): { ok: false; message: string } => ({ ok: false, message: error instanceof PythonEngineError ? error.message : "The pairs lab couldn't run that. Try again in a minute." });
const unreadable = { ok: false as const, message: "The pairs lab's answer came back in a form MarketLab couldn't read." };

/** Every same-sector pair of catalog stocks, tested over the year to `formationEnd`. The universe is the server's, never the browser's. */
export async function scanPairs(formationEnd: number): Promise<{ ok: true; result: PairScan } | { ok: false; message: string }> {
  try {
    await ensureFactors();
    const universe = CATALOG.map((s) => ({ symbol: s.symbol, sector: s.sector }));
    const data = await post("/v1/pairs/scan", { source: priceSource(), universe, formationEnd }, "Pairs scan", TIMEOUT_MS);
    const result = parsePairScan(data.result);
    return result ? { ok: true, result } : unreadable;
  } catch (error) {
    return failed(error);
  }
}

export async function testPair(settings: PairSettings): Promise<{ ok: true; result: PairTest } | { ok: false; message: string }> {
  try {
    const synced = await syncPrices([settings.a, settings.b]);
    if (synced.failed.length) return { ok: false, message: `Prices for ${synced.failed.join(", ")} are unavailable right now. Try again in a minute.` };
    const data = await post("/v1/pairs/backtest", { source: priceSource(), ...settings }, "Pair test", TIMEOUT_MS);
    const result = parsePairTest(data.result);
    return result ? { ok: true, result } : unreadable;
  } catch (error) {
    return failed(error);
  }
}
