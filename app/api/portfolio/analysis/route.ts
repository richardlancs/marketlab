import { post, pythonConfigured } from "@/lib/backtest/python-client";
import { syncPrices } from "@/lib/analytics/server";
import { parsePortfolioAnalysis } from "@/lib/analytics/portfolio";
import { accounts } from "@/lib/db";
import { getStockDetail, priceSource } from "@/lib/market";
import { catalogEntry } from "@/lib/market/catalog";
import { currentOwner } from "@/lib/owner";
import { allow } from "@/lib/rate-limit";
import { visitorAccount } from "@/lib/visitor-account";

/**
 * GET /api/portfolio/analysis: risk, stress tests, a Monte Carlo projection
 * and alternative weightings for this visitor's current holdings (signed in
 * or a guest), calculated by the analytics service from stored prices
 * (lib/analytics, services/analytics/analytics/portfolio.py).
 *
 * The holdings are read here, on the server, never taken from the request.
 */
export async function GET() {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!pythonConfigured()) return json({ error: "Portfolio analysis needs the analytics service, which isn't running." }, 503);
  if (!(await allow("portfolio-analysis", 20, 60))) return json({ error: "You're refreshing the analysis a lot. Wait a minute and try again." }, 429);

  const owner = await currentOwner({ create: false });
  const account = (owner && (await accounts.load(owner.id))) || (await visitorAccount());
  const held = account.holdings.filter((h) => h.shares > 0);
  if (held.length === 0) return json({ empty: true });

  // Values at the latest close; a stock whose prices can't be loaded is left out (and listed).
  const details = await Promise.all(held.map((h) => getStockDetail(h.symbol)));
  const holdings = held.flatMap((h, i) => {
    const detail = details[i];
    return detail?.status === "ok" ? [{ symbol: h.symbol, value: h.shares * detail.stock.price, sector: detail.stock.sector ?? catalogEntry(h.symbol)?.sector ?? null }] : [];
  });
  if (holdings.length === 0) return json({ error: "Prices for your holdings are unavailable right now. Try again in a minute." }, 503);

  try {
    await syncPrices(["SPX", ...holdings.map((h) => h.symbol)]);
    const data = await post("/v1/analytics/portfolio", { source: priceSource(), holdings, cash: account.cash }, "Portfolio analysis");
    const analysis = parsePortfolioAnalysis(data.analysis);
    if (!analysis) return json({ error: "The analysis came back in a form MarketLab couldn't read." }, 502);
    return json({ analysis, totalValue: holdings.reduce((sum, h) => sum + h.value, 0) + account.cash });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Portfolio analysis failed. Try again in a minute." }, 503);
  }
}
