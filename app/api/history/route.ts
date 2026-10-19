import { getMarket, getStockDetail } from "@/lib/market";
import { MAX_HISTORY_SYMBOLS, parseHistoryQuery } from "@/lib/market/history-query";
import type { PricePoint } from "@/lib/types";

/**
 * GET /api/history?symbol=AAPL&symbol=KO: daily adjusted closes for the
 * stocks asked for, plus the S&P 500 (or the fund tracking it) as a
 * benchmark. The backtest page and the portfolio chart ask for just the
 * stocks they need, so nothing loads five years of every stock up front.
 * See lib/market/history-query.ts for the other options.
 */
export async function GET(request: Request) {
  const query = parseHistoryQuery(new URL(request.url).searchParams);
  if (!query) return Response.json({ error: `Ask for up to ${MAX_HISTORY_SYMBOLS} stock symbols.` }, { status: 400 });
  const { symbols, allIndices, from } = query;
  const trim = (points: PricePoint[]) => {
    if (from === null) return points;
    // Keep the last close before `from` too, so a range can start from it.
    const i = points.findIndex((p) => p.time >= from);
    return i === -1 ? points.slice(-1) : points.slice(Math.max(0, i - 1));
  };

  const details = await Promise.all(symbols.map(getStockDetail));
  const history: Record<string, PricePoint[]> = {};
  for (const [i, detail] of details.entries()) {
    if (!detail) return Response.json({ error: `Unknown stock: ${symbols[i]}.` }, { status: 400 });
    if (detail.status === "unavailable") {
      return Response.json({ error: `Prices for ${symbols[i]} are unavailable right now. Try again in a minute.` }, { status: 503 });
    }
    history[symbols[i]] = trim(detail.stock.history);
  }
  const market = await getMarket();
  return Response.json(
    {
      history,
      market: trim(market.indices[0].history),
      ...(allIndices && { indices: market.indices.map((index) => ({ symbol: index.symbol, name: index.name, history: trim(index.history) })) }),
      source: market.source,
      asOf: market.asOf,
    },
    // The same for everyone, and it changes at most hourly.
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
