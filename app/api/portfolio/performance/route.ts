import { accounts } from "@/lib/db";
import { getMarket, getStockDetail } from "@/lib/market";
import { currentOwner } from "@/lib/owner";
import { relevantSymbols } from "@/lib/portfolio-history";
import { performance } from "@/lib/portfolio-performance";
import { TIMEFRAMES, type PricePoint, type Timeframe } from "@/lib/types";
import { visitorAccount } from "@/lib/visitor-account";

/**
 * GET /api/portfolio/performance?index=SPX&range=1Y: how this visitor's
 * portfolio (signed in or a guest) has done over the range, next to an
 * index: each day's value and both sides' measures (lib/portfolio-performance.ts).
 *
 * Everything is computed here, next to the data: the browser gets a few
 * hundred numbers for the range it shows, instead of years of prices for
 * every stock it holds. Prices come from the server's hourly cache, so this
 * costs no data-source requests.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const range = (TIMEFRAMES as readonly string[]).includes(params.get("range") ?? "") ? (params.get("range") as Timeframe) : "1Y";
  const [owner, market] = await Promise.all([currentOwner({ create: false }), getMarket()]);
  const index = market.indices.find((i) => i.symbol === params.get("index")) ?? market.indices[0];
  const account = (owner && (await accounts.load(owner.id))) || (await visitorAccount());

  const symbols = relevantSymbols(account);
  const details = await Promise.all(symbols.map(getStockDetail));
  const history: Record<string, PricePoint[]> = {};
  details.forEach((detail, i) => {
    if (detail?.status === "ok") history[symbols[i]] = detail.stock.raw;
  });

  return Response.json(
    {
      indices: market.indices.map(({ symbol, name }) => ({ symbol, name })),
      index: { symbol: index.symbol, name: index.name },
      range,
      ...performance(account, history, index.history, range),
    },
    // Private, per-visitor data: never stored by a browser or CDN cache.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
