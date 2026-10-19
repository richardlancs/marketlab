import type { ReactNode } from "react";
import { getStocks } from "@/lib/market";
import { StockRow } from "./stock-row";
import { WatchlistCard } from "./watchlist-card";

/**
 * The user's watchlist, shown beside the featured chart.
 *
 * Which stocks are on it is only known in the browser (it's saved there), but
 * the rows need each stock's price history for their sparklines, which is
 * large. So the server renders a finished row for *every* stock, and the
 * client card picks out the watched ones, in order. No history is sent to the
 * browser, only the rows' HTML.
 */
export async function WatchlistPreview() {
  const stocks = await getStocks();
  const rows: Record<string, ReactNode> = Object.fromEntries(
    stocks.map((stock) => [stock.symbol, <StockRow key={stock.symbol} stock={stock} sparkline />]),
  );
  return <WatchlistCard rows={rows} />;
}
