import type { Metadata } from "next";
import { StockTable, type StockTableRow } from "@/components/stocks/stock-table";
import { Card } from "@/components/ui/card";
import { getStocks } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Stocks — MarketLab" };

/**
 * Every stock in one sortable table. This page is a Server Component: it reads
 * the data and slims it down, then hands the rows to the client-side table,
 * which handles the sorting.
 */
export default async function StocksPage() {
  const stocks = await getStocks();
  const rows: StockTableRow[] = stocks.map((stock) => ({
    symbol: stock.symbol,
    name: stock.name,
    price: stock.price,
    change: stock.change,
    changePercent: stock.changePercent,
    previousClose: stock.previousClose,
    marketCap: stock.marketCap,
    peRatio: stock.peRatio,
    intraday: stock.history["1D"].map((p) => p.price),
  }));

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <p className="text-sm font-medium text-accent">Mock data</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Stocks</h1>
        <p className="mt-2 text-muted">
          All {stocks.length} stocks in the dataset. Select a column heading to sort, or a row to open the stock.
        </p>
      </div>

      <div style={{ animationDelay: "60ms" }} className="mt-8 animate-fade-up">
        {/* The table itself has no outer padding, so the card's padding frames it. */}
        <Card aria-label="All stocks" className="overflow-x-auto py-2">
          <StockTable rows={rows} />
        </Card>
      </div>
    </main>
  );
}
