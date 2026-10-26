import { ensureFactors, syncPrices } from "@/lib/analytics/server";
import { parseFactorExposures } from "@/lib/analytics/factors";
import { post, pythonConfigured } from "@/lib/backtest/python-client";
import { currentBook } from "@/lib/books";
import { accounts } from "@/lib/db";
import { getStockDetail, priceSource } from "@/lib/market";
import { currentOwner } from "@/lib/owner";
import { allow } from "@/lib/rate-limit";
import { visitorAccount } from "@/lib/visitor-account";

/**
 * GET /api/portfolio/factors: this visitor's portfolio's factor exposures
 * (signed in or a guest), holding today's weights over the past year,
 * calculated by the analytics service (services/analytics/analytics/factors.py)
 * from the nightly factor returns. The holdings are read here, on the
 * server, never taken from the request.
 */
export async function GET() {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!pythonConfigured()) return json({ error: "Factor analysis needs the analytics service, which isn't running." }, 503);
  if (!(await allow("portfolio-analysis", 20, 60))) return json({ error: "You're refreshing the analysis a lot. Wait a minute and try again." }, 429);

  const owner = await currentOwner({ create: false });
  const book = await currentBook(owner);
  const account = (owner && (await accounts.load(book?.accountId ?? owner.id))) || (await visitorAccount());
  const held = account.holdings.filter((h) => h.shares > 0);
  if (held.length === 0) return json({ empty: true });

  const details = await Promise.all(held.map((h) => getStockDetail(h.symbol)));
  const holdings = held.flatMap((h, i) => {
    const detail = details[i];
    return detail?.status === "ok" ? [{ symbol: h.symbol, value: h.shares * detail.stock.price }] : [];
  });
  if (holdings.length === 0) return json({ error: "Prices for your holdings are unavailable right now. Try again in a minute." }, 503);

  try {
    await syncPrices(["SPX", ...holdings.map((h) => h.symbol)]);
    await ensureFactors();
    const data = await post("/v1/analytics/portfolio/factors", { source: priceSource(), holdings }, "Portfolio factors");
    const factors = parseFactorExposures(data.factors);
    if (!factors) return json({ error: "The factor analysis came back in a form MarketLab couldn't read." }, 502);
    return json({ factors });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Factor analysis failed. Try again in a minute." }, 503);
  }
}
