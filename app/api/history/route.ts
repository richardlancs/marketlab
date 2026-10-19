import { getMarket, getStockDetail } from "@/lib/market";
import { parseSymbolQuery } from "@/lib/market/symbols";
import type { PricePoint } from "@/lib/types";

/**
 * GET /api/history?symbol=AAPL&symbol=KO: daily adjusted closes for up to five
 * stocks, plus the S&P 500 (or the fund tracking it) as a benchmark. The
 * backtest page asks for just the stocks it needs, so it doesn't load five
 * years of every stock up front.
 */
export async function GET(request: Request) {
  const symbols = parseSymbolQuery(new URL(request.url).searchParams, 5);
  if (!symbols) return Response.json({ error: "Ask for 1 to 5 stock symbols." }, { status: 400 });

  const details = await Promise.all(symbols.map(getStockDetail));
  const history: Record<string, PricePoint[]> = {};
  for (const [i, detail] of details.entries()) {
    if (!detail) return Response.json({ error: `Unknown stock: ${symbols[i]}.` }, { status: 400 });
    if (detail.status === "unavailable") {
      return Response.json({ error: `Prices for ${symbols[i]} are unavailable right now. Try again in a minute.` }, { status: 503 });
    }
    history[symbols[i]] = detail.stock.history;
  }
  const market = await getMarket();
  return Response.json(
    { history, market: market.indices[0].history, source: market.source, asOf: market.asOf },
    // The same for everyone, and it changes at most hourly.
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
