import { toStockTableRow } from "@/components/stocks/stock-table-rows";
import { getStockDetail } from "@/lib/market";
import { parseSymbolQuery } from "@/lib/market/symbols";
import { MAX_HOLDINGS, MAX_WATCHLIST } from "@/lib/trading";

/**
 * GET /api/quotes?symbol=KO&symbol=BRK-B: today's price and a month of history
 * for stocks outside the core, which the layout doesn't send. The browser asks
 * for the ones the account holds or watches.
 *
 * Every symbol must exist. One whose prices are unavailable right now is left
 * out of the answer rather than failing the rest.
 */
export async function GET(request: Request) {
  // At most a full portfolio plus a full watchlist.
  const symbols = parseSymbolQuery(new URL(request.url).searchParams, MAX_HOLDINGS + MAX_WATCHLIST);
  if (!symbols) return Response.json({ error: `Ask for 1 to ${MAX_HOLDINGS + MAX_WATCHLIST} stock symbols.` }, { status: 400 });

  const details = await Promise.all(symbols.map(getStockDetail));
  const unknown = symbols.filter((_, i) => details[i] === null);
  if (unknown.length) return Response.json({ error: `Unknown stock: ${unknown.join(", ")}.` }, { status: 400 });

  const rows = details.flatMap((d) => (d?.status === "ok" ? [toStockTableRow(d.stock)] : []));
  // The same for everyone, and it changes at most hourly.
  return Response.json({ rows }, { headers: { "Cache-Control": "public, max-age=300" } });
}
