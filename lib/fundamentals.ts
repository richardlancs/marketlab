/**
 * Company numbers from the SEC (lib/market/fundamentals.ts), for stock pages
 * and the screener. Server code only.
 *
 * Each company's facts file is several megabytes, so the parsed numbers are
 * stored (company_facts) rather than fetched per visit. The daily job
 * refreshes each catalog company about once a week, a few at a time, within
 * the SEC's limit of 10 requests a second. A stock with nothing stored yet (a
 * new deployment, or any ticker outside the catalog) is fetched on its page
 * and cached for a day.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { fundamentals } from "./db";
import { fetchCompanyFacts, type CompanyFacts } from "./market";
import { post } from "./backtest/python-client";
import { RATIO_KEYS, type Ratios } from "./market/fundamentals";
import { CATALOG } from "./market/catalog";

const DAY = 86_400_000;
/** How old stored numbers may get before they're fetched again. Companies report quarterly, so a week is plenty. */
export const REFRESH_AFTER = 7 * DAY;
/** Requests at once: well under the SEC's 10 a second. */
const PARALLEL = 3;

export interface FundamentalsDeps {
  now(): number;
  due(symbols: readonly string[], before: number): Promise<string[]>;
  fetch(symbol: string): Promise<CompanyFacts | null | "failed">;
  save(symbol: string, facts: CompanyFacts | null, now: number): Promise<void>;
}

const defaultDeps: FundamentalsDeps = {
  now: Date.now,
  due: (symbols, before) => fundamentals.due(symbols, before),
  fetch: fetchCompanyFacts,
  save: (symbol, facts, now) => fundamentals.save(symbol, facts, now),
};

export interface FundamentalsSummary {
  updated: number;
  /** Companies with no numbers to use. */
  none: number;
  failed: number;
  /** Still due when time (or the per-run limit) ran out. */
  remaining: number;
}

/**
 * Fetches and stores the numbers of catalog companies that are due, until
 * `deadline` (ms) or `limit` companies. A failed fetch isn't stored, so it's
 * retried next time.
 */
export async function refreshFundamentals(deadline: number, { limit = 30, deps = defaultDeps }: { limit?: number; deps?: FundamentalsDeps } = {}): Promise<FundamentalsSummary> {
  const due = await deps.due(
    CATALOG.map((s) => s.symbol),
    deps.now() - REFRESH_AFTER,
  );
  const summary: FundamentalsSummary = { updated: 0, none: 0, failed: 0, remaining: 0 };
  const queue = due.slice(0, limit);
  let slowest = 0;
  const worker = async () => {
    for (;;) {
      // Don't start one that wouldn't finish in time.
      if (deps.now() + slowest > deadline) return;
      const symbol = queue.shift();
      if (!symbol) return;
      const started = deps.now();
      const facts = await deps.fetch(symbol);
      if (facts === "failed") summary.failed++;
      else {
        await deps.save(symbol, facts, deps.now());
        if (facts) summary.updated++;
        else summary.none++;
      }
      slowest = Math.max(slowest, deps.now() - started);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  summary.remaining = due.length - summary.updated - summary.none;
  return summary;
}

async function cachedFetch(symbol: string): Promise<CompanyFacts | null> {
  "use cache";
  cacheTag(`fundamentals:${symbol}`);
  const facts = await fetchCompanyFacts(symbol);
  if (facts === "failed") {
    cacheLife("minutes");
    return null;
  }
  cacheLife("days");
  return facts;
}

/** A company's reported numbers, or null if there are none to show. `symbol` must be canonical. */
export async function getFundamentals(symbol: string): Promise<CompanyFacts | null> {
  const stored = await fundamentals.get(symbol).catch((error) => {
    console.error(`[fundamentals] Couldn't read ${symbol}:`, error instanceof Error ? error.message : error);
    return undefined;
  });
  return stored !== undefined ? stored : cachedFetch(symbol);
}

/**
 * Ratios from a company's numbers at a price (P/E, margins, growth, return on
 * equity, free-cash-flow yield), and whether the numbers are current (under
 * 15 months old), worked out by the analytics service
 * (services/analytics/analytics/fundamentals.py). Null if it can't be reached.
 */
export async function ratiosAt(facts: CompanyFacts, price: number, marketCap: number | null): Promise<{ ratios: Ratios; current: boolean } | null> {
  try {
    const data = await post("/v1/fundamentals/ratios", { facts, price, marketCap, now: Date.now() }, "Company ratios");
    const r = data.ratios as Record<string, unknown> | undefined;
    if (!r || typeof data.current !== "boolean" || !RATIO_KEYS.every((k) => r[k] === null || (typeof r[k] === "number" && Number.isFinite(r[k])))) return null;
    return { ratios: r as unknown as Ratios, current: data.current };
  } catch (error) {
    console.error("[fundamentals] Couldn't work out ratios:", error instanceof Error ? error.message : error);
    return null;
  }
}
