import { syncPrices } from "@/lib/analytics/server";
import { isCorrelationSummary, type CorrelationSummary, type WatchlistCorrelation } from "@/lib/analytics/portfolio";
import { post, pythonConfigured } from "@/lib/backtest/python-client";
import { accounts } from "@/lib/db";
import { priceSource } from "@/lib/market";
import { currentOwner } from "@/lib/owner";
import { allow } from "@/lib/rate-limit";
import { visitorAccount } from "@/lib/visitor-account";

/** The most stocks compared at once (the analytics service's limit). */
const MAX = 30;

/**
 * GET /api/watchlist/correlation: how this visitor's watched stocks (signed
 * in or a guest) moved together over the last year, calculated by the
 * analytics service (services/analytics/analytics/correlation.py) from
 * stored prices. The watchlist is read here, on the server, never taken
 * from the request.
 */
export async function GET() {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!pythonConfigured()) return json({ error: "Comparing stocks needs the analytics service, which isn't running." }, 503);
  if (!(await allow("watchlist-correlation", 20, 60))) return json({ error: "You're refreshing a lot. Wait a minute and try again." }, 429);

  const owner = await currentOwner({ create: false });
  const account = (owner && (await accounts.load(owner.id))) || (await visitorAccount());
  const symbols = [...new Set(account.watchlist)].slice(0, MAX);
  if (symbols.length < 2) return json({ empty: true });

  try {
    const synced = await syncPrices(symbols);
    const data = await post("/v1/analytics/correlation", { source: priceSource(), symbols: symbols.filter((s) => !synced.failed.includes(s)) }, "Watchlist correlation");
    const usable = data.symbols;
    if (!Array.isArray(usable) || !usable.every((s) => typeof s === "string") || !isCorrelationSummary(data, usable.length) || typeof data.asOf !== "number") {
      return json({ error: "The comparison came back in a form MarketLab couldn't read." }, 502);
    }
    const { correlation, order, effectiveBets, closest } = data as unknown as CorrelationSummary;
    const leftOut = [...synced.failed, ...(Array.isArray(data.leftOut) ? data.leftOut.filter((s): s is string => typeof s === "string") : [])];
    return json({ symbols: usable, leftOut, asOf: data.asOf, summary: { correlation, order, effectiveBets, closest } } satisfies WatchlistCorrelation);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Comparing your stocks failed. Try again in a minute." }, 503);
  }
}
