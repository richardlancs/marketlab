import type { Metadata } from "next";
import { StorageLabel } from "@/components/account/storage-label";
import { toStockTableRow } from "@/components/stocks/stock-table-rows";
import { WatchlistTable } from "@/components/stocks/watchlist-table";
import { Card } from "@/components/ui/card";
import { getStocks } from "@/lib/market";

export const metadata: Metadata = { title: "Watchlist — MarketLab" };

/**
 * The stocks you follow. Which ones they are is saved in your browser (or your
 * account), so the page sends rows for the ten core stocks and the client
 * table keeps the watched ones, adding any others it loads itself. The page
 * itself stays fully static.
 */
export default async function WatchlistPage() {
  const rows = (await getStocks()).map(toStockTableRow);

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <StorageLabel />
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Watchlist</h1>
        <p className="mt-2 text-muted">The stocks you follow. Use the star to add or remove one.</p>
      </div>

      <div style={{ animationDelay: "60ms" }} className="mt-8 animate-fade-up">
        <Card aria-label="Your watchlist" className="overflow-x-auto py-2">
          <WatchlistTable rows={rows} />
        </Card>
      </div>
    </main>
  );
}
