import { PriceChart } from "@/components/charts/price-chart";
import { Card } from "@/components/ui/card";
import { formatCompactCurrency, formatCompactNumber, formatCurrency } from "@/lib/format";
import { FEATURED_SYMBOL, getStock } from "@/lib/mock-data";

/**
 * The large chart card. The data loading and the static parts (title, stats)
 * stay on the server; only <PriceChart> runs in the browser.
 */
export async function FeaturedStock() {
  const stock = await getStock(FEATURED_SYMBOL);
  if (!stock) throw new Error(`Featured stock ${FEATURED_SYMBOL} is missing from the mock data`);

  const stats = [
    { label: "Open", value: formatCurrency(stock.open) },
    { label: "High", value: formatCurrency(stock.high) },
    { label: "Low", value: formatCurrency(stock.low) },
    { label: "Volume", value: formatCompactNumber(stock.volume) },
    { label: "Mkt cap", value: formatCompactCurrency(stock.marketCap) },
    { label: "P/E", value: stock.peRatio.toFixed(1) },
  ];

  return (
    <Card aria-labelledby="featured-stock" className="h-full">
      <PriceChart
        history={stock.history}
        previousClose={stock.previousClose}
        title={
          <div className="min-w-0">
            <h2 id="featured-stock" className="text-lg font-semibold tracking-tight">
              {stock.symbol} <span className="font-normal text-muted">{stock.name}</span>
            </h2>
            <p className="text-xs text-muted">{stock.sector}</p>
          </div>
        }
      />

      <dl className="mt-6 grid grid-cols-3 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-muted">{stat.label}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
