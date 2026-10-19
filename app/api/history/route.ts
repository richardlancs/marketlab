import { getMarket } from "@/lib/market";
import { STOCK_SYMBOLS } from "@/lib/market/universe";

/**
 * GET /api/history?symbol=AAPL&symbol=MSFT: daily adjusted closes for up to
 * five stocks, plus the S&P 500 (or the fund tracking it) as a benchmark.
 * The backtest page asks for just the stocks it needs, so it doesn't load
 * five years of every stock up front.
 */
export async function GET(request: Request) {
  const symbols = [...new Set(new URL(request.url).searchParams.getAll("symbol"))];
  if (symbols.length === 0 || symbols.length > 5 || symbols.some((s) => !STOCK_SYMBOLS.includes(s))) {
    return Response.json({ error: "Ask for 1 to 5 known stock symbols." }, { status: 400 });
  }
  const market = await getMarket();
  const history = Object.fromEntries(symbols.map((s) => [s, market.stocks.find((stock) => stock.symbol === s)?.history ?? []]));
  return Response.json(
    { history, market: market.indices[0].history, source: market.source, asOf: market.asOf },
    // The same for everyone, and it changes at most hourly.
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
