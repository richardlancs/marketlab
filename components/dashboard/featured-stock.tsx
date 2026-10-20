import Link from "next/link";
import { PriceChart } from "@/components/charts/price-chart";
import { StockStats } from "@/components/stocks/stock-stats";
import { Card } from "@/components/ui/card";
import { FEATURED_SYMBOL, getStock } from "@/lib/market";

/**
 * The large chart card. The data loading and the static parts (title, stats)
 * stay on the server; only <PriceChart> runs in the browser.
 */
export async function FeaturedStock() {
  const stock = await getStock(FEATURED_SYMBOL);
  if (!stock) throw new Error(`Featured stock ${FEATURED_SYMBOL} is missing from the market data`);

  return (
    <Card aria-labelledby="featured-stock" className="h-full">
      <PriceChart
        history={stock.history}
        intraday={stock.intraday}
        today={{ change: stock.change, percent: stock.changePercent }}
        title={
          <div className="min-w-0">
            <h2 id="featured-stock" className="text-lg font-semibold tracking-tight">
              <Link href={`/stocks/${stock.symbol}`} className="rounded-sm hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                {stock.symbol} <span className="font-normal text-muted">{stock.name}</span>
              </Link>
            </h2>
            <p className="text-xs text-muted">{stock.sector}</p>
          </div>
        }
      />
      <StockStats stock={stock} className="mt-6" />
    </Card>
  );
}
