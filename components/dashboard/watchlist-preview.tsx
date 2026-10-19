import { Card } from "@/components/ui/card";
import { getWatchlist } from "@/lib/mock-data";
import { StockRow } from "./stock-row";

/** The user's watchlist, shown beside the featured chart. */
export async function WatchlistPreview() {
  const stocks = await getWatchlist();

  return (
    <Card aria-labelledby="watchlist" className="h-full">
      <div className="flex items-baseline justify-between">
        <h2 id="watchlist" className="text-lg font-semibold tracking-tight">
          Watchlist
        </h2>
        <span className="text-xs text-muted">{stocks.length} symbols</span>
      </div>

      {/* divide-y draws a hairline between rows, but not above the first one. */}
      <ul className="mt-2 divide-y divide-border">
        {stocks.map((stock) => (
          <StockRow key={stock.symbol} stock={stock} sparkline />
        ))}
      </ul>
    </Card>
  );
}
