import type { Metadata } from "next";
import Link from "next/link";
import { DataSource } from "@/components/market/data-source";
import { StockTable } from "@/components/stocks/stock-table";
import { toStockTableRow } from "@/components/stocks/stock-table-rows";
import { Card } from "@/components/ui/card";
import { getStocks } from "@/lib/market";
import { MORE_LISTINGS } from "@/lib/market/catalog";
import { marketMode } from "@/lib/market/mode";

export const metadata: Metadata = { title: "Stocks — MarketLab" };

/**
 * The core stocks in one sortable table, then links to the rest of the
 * catalog. This page is a Server Component: it reads the data and slims it
 * down, then hands the rows to the client-side table, which handles the
 * sorting. The other stocks are listed without prices, so the page doesn't
 * load ~100 price histories (with real data, that would be ~100 requests).
 */
export default async function StocksPage() {
  const stocks = await getStocks();
  const rows = stocks.map(toStockTableRow);
  const bySector = Map.groupBy(MORE_LISTINGS, (listing) => listing.sector);

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <DataSource />
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Stocks</h1>
        <p className="mt-2 text-muted">
          The {stocks.length} featured stocks. Select a column heading to sort, or a row to open the stock.
        </p>
      </div>

      <div style={{ animationDelay: "60ms" }} className="mt-8 animate-fade-up">
        {/* The table itself has no outer padding, so the card's padding frames it. */}
        <Card aria-label="All stocks" className="overflow-x-auto py-2">
          <StockTable rows={rows} />
        </Card>
      </div>

      <div style={{ animationDelay: "120ms" }} className="mt-4 animate-fade-up lg:mt-6">
        <Card aria-labelledby="more-stocks">
          <h2 id="more-stocks" className="text-lg font-semibold tracking-tight">
            More stocks
          </h2>
          <p className="mt-1 text-sm text-muted">
            {MORE_LISTINGS.length} more you can open, watch, trade and backtest.
            {marketMode() === "tiingo" && " Or search for any other ticker with ⌘K."}
          </p>
          <div className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {[...bySector].map(([sector, listings]) => (
              <section key={sector} aria-label={sector}>
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{sector}</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {listings.map((listing) => (
                    <li key={listing.symbol} className="truncate">
                      <Link href={`/stocks/${listing.symbol}`} className="rounded-sm hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                        <span className="font-semibold">{listing.symbol}</span> <span className="text-muted">{listing.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
